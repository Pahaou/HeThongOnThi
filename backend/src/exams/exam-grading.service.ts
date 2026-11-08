import { Injectable } from '@nestjs/common';
import { ExamAttemptStatus } from '../generated/prisma/client';
import { score10 } from '../practice/grading';
import { PrismaService } from '../prisma/prisma.service';
import { gradeSnapshot, QuestionSnapshot, SAVE_GRACE_MS } from './exam-rules';

/**
 * Chấm bài thi chính thức. Chỉ một lời gọi "giành" được quyền chấm
 * (điều kiện status = IN_PROGRESS), nên nộp lặp hay nộp đồng thời
 * đều chỉ chấm một lần và cho cùng một kết quả.
 */
@Injectable()
export class ExamGradingService {
  constructor(private readonly prisma: PrismaService) {}

  async grade(attemptId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.examAttempt.updateMany({
        where: { id: attemptId, status: ExamAttemptStatus.IN_PROGRESS },
        data: { status: ExamAttemptStatus.SUBMITTED, submittedAt: new Date() },
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

  /** Chấm mọi bài đã quá hạn (kể cả ân hạn) mà chưa nộp. */
  async gradeExpired(examId: string): Promise<void> {
    const expired = await this.prisma.examAttempt.findMany({
      where: {
        status: ExamAttemptStatus.IN_PROGRESS,
        candidate: { examId },
        deadlineAt: { lt: new Date(Date.now() - SAVE_GRACE_MS) },
      },
      select: { id: true },
    });
    for (const a of expired) await this.grade(a.id);
  }
}
