import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Queue } from 'bullmq';
import { ExamAttemptStatus } from '../generated/prisma/client';
import { score10 } from '../practice/grading';
import { PrismaService } from '../prisma/prisma.service';
import { gradeSnapshot, QuestionSnapshot, SYNC_GRACE_MS } from './exam-rules';

export const GRADING_QUEUE = 'exam-grading';
export const SWEEP_EVERY_MS = 30_000;
// Bài đã nộp mà quá lâu chưa được chấm (vd. server tắt giữa chừng) thì đưa lại vào hàng đợi
const STUCK_AFTER_MS = 30_000;

/**
 * Nộp bài chỉ đánh dấu SUBMITTED rồi đưa việc chấm vào hàng đợi (Redis),
 * nên nhiều thí sinh nộp cùng lúc không làm chậm request. Mọi bước đều
 * idempotent: nộp lặp, job chạy lặp hay quét lặp đều cho cùng kết quả.
 */
@Injectable()
export class ExamGradingService implements OnModuleInit {
  private readonly logger = new Logger(ExamGradingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(GRADING_QUEUE) private readonly queue: Queue,
  ) {}

  async onModuleInit() {
    // Quét định kỳ: tự nộp bài quá hạn và chấm lại bài bị kẹt
    await this.queue.upsertJobScheduler(
      'sweep',
      { every: SWEEP_EVERY_MS },
      { name: 'sweep' },
    );
  }

  /** Đánh dấu đã nộp (chỉ lần đầu có tác dụng) rồi xếp hàng chấm. */
  async submit(attemptId: string): Promise<void> {
    await this.prisma.examAttempt.updateMany({
      where: { id: attemptId, status: ExamAttemptStatus.IN_PROGRESS },
      data: { status: ExamAttemptStatus.SUBMITTED, submittedAt: new Date() },
    });
    await this.enqueue(attemptId);
  }

  async enqueue(attemptId: string): Promise<void> {
    await this.queue.add(
      'grade',
      { attemptId },
      {
        // Cùng jobId khi đang chờ thì không thêm trùng
        jobId: `grade-${attemptId}`,
        attempts: 5,
        backoff: { type: 'exponential', delay: 1000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  }

  /** Chấm theo đề đã đóng băng. Chỉ bài SUBMITTED được chấm, đúng một lần. */
  async grade(attemptId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.examAttempt.updateMany({
        where: { id: attemptId, status: ExamAttemptStatus.SUBMITTED },
        data: { status: ExamAttemptStatus.GRADED, gradedAt: new Date() },
      });
      if (count === 0) return;

      const questions = await tx.attemptQuestion.findMany({
        where: { attemptId },
      });
      let correct = 0;
      for (const q of questions) {
        const isCorrect = gradeSnapshot(
          q.snapshot as unknown as QuestionSnapshot,
          q.selectedOptionIds,
        );
        if (isCorrect) correct++;
        await tx.attemptQuestion.update({
          where: { attemptId_position: { attemptId, position: q.position } },
          data: { isCorrect },
        });
      }
      await tx.examAttempt.update({
        where: { id: attemptId },
        data: {
          correctCount: correct,
          score: score10(correct, questions.length),
        },
      });
    });
  }

  /**
   * Tự nộp bài đã quá hạn + thời gian chờ đồng bộ, và xếp hàng lại bài đã
   * nộp mà chưa chấm. Truyền examId để chỉ quét một kỳ thi.
   */
  async sweep(
    examId?: string,
  ): Promise<{ submitted: number; requeued: number }> {
    const now = Date.now();
    const scope = examId ? { candidate: { examId } } : {};
    const overdue = await this.prisma.examAttempt.findMany({
      where: {
        ...scope,
        status: ExamAttemptStatus.IN_PROGRESS,
        deadlineAt: { lt: new Date(now - SYNC_GRACE_MS) },
      },
      select: { id: true },
    });
    for (const a of overdue) await this.submit(a.id);

    const stuck = await this.prisma.examAttempt.findMany({
      where: {
        ...scope,
        status: ExamAttemptStatus.SUBMITTED,
        submittedAt: { lt: new Date(now - STUCK_AFTER_MS) },
      },
      select: { id: true },
    });
    for (const a of stuck) await this.enqueue(a.id);

    if (overdue.length || stuck.length) {
      this.logger.log(
        `Quét bài thi: tự nộp ${overdue.length}, xếp hàng lại ${stuck.length}`,
      );
    }
    return { submitted: overdue.length, requeued: stuck.length };
  }
}
