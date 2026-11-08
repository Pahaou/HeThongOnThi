import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtPayload } from '../auth/auth.types';
import {
  CandidateVerdict,
  ExamAttemptStatus,
  ExamStatus,
  Prisma,
  QuestionType,
} from '../generated/prisma/client';
import { buildPaper, shuffle } from '../practice/grading';
import { loadPools, poolKey } from '../practice/question-pool';
import { PrismaService } from '../prisma/prisma.service';
import { ExamGradingService } from './exam-grading.service';
import {
  attemptDeadline,
  publicSnapshot,
  QuestionSnapshot,
  windowState,
  withinDeadline,
} from './exam-rules';

export type MyExamState =
  'NOT_OPEN' | 'OPEN' | 'IN_PROGRESS' | 'SUBMITTED' | 'MISSED' | 'CLOSED';

@Injectable()
export class ExamTakeService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly grading: ExamGradingService,
  ) {}

  /** Kỳ thi đã công bố mà mình là thí sinh. Điểm chỉ hiện khi kỳ thi đã đóng. */
  async myExams(user: JwtPayload) {
    const now = new Date();
    const candidacies = await this.prisma.examCandidate.findMany({
      where: { userId: user.sub, exam: { status: ExamStatus.PUBLISHED } },
      orderBy: { exam: { opensAt: 'asc' } },
      include: {
        exam: {
          include: {
            course: { select: { id: true, slug: true, title: true } },
            rules: { select: { count: true } },
          },
        },
        attempt: true,
      },
    });
    return candidacies.map(({ exam, attempt }) => {
      const window = windowState(exam, now);
      const closed = window === 'CLOSED';
      let state: MyExamState;
      if (attempt?.status === ExamAttemptStatus.SUBMITTED) state = 'SUBMITTED';
      else if (attempt)
        state = withinDeadline(attempt.deadlineAt, now)
          ? 'IN_PROGRESS'
          : 'SUBMITTED';
      else state = window === 'OPEN' ? 'OPEN' : closed ? 'MISSED' : 'NOT_OPEN';
      return {
        id: exam.id,
        title: exam.title,
        course: exam.course,
        opensAt: exam.opensAt,
        closesAt: exam.closesAt,
        durationSec: exam.durationSec,
        totalQuestions: exam.rules.reduce((s, r) => s + r.count, 0),
        state,
        score: closed && attempt?.score != null ? attempt.score : null,
        correctCount: closed ? (attempt?.correctCount ?? null) : null,
      };
    });
  }

  /** Bắt đầu, hoặc vào lại bài đang làm. Đề sinh và đóng băng một lần duy nhất. */
  async start(user: JwtPayload, examId: string) {
    const { exam, candidate } = await this.loadCandidate(user, examId);
    if (candidate.attempt) return this.view(user, examId);

    const now = new Date();
    const state = windowState(exam, now);
    if (state === 'NOT_OPEN') throw new ConflictException('Kỳ thi chưa mở');
    if (state === 'CLOSED') throw new ConflictException('Kỳ thi đã đóng');

    const pools = await loadPools(this.prisma, exam.courseId);
    const paper = buildPaper(
      exam.rules,
      (r) => pools.get(poolKey(r.topicId, r.difficulty)) ?? [],
    );
    if (!paper.ok) {
      throw new ConflictException(
        'Kho câu hỏi không đủ để sinh đề, hãy báo giảng viên',
      );
    }
    const questions = await this.prisma.question.findMany({
      where: { id: { in: paper.questionIds } },
      include: { options: { orderBy: { position: 'asc' } } },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));

    try {
      await this.prisma.examAttempt.create({
        data: {
          candidateId: candidate.id,
          startedAt: now,
          deadlineAt: attemptDeadline(now, exam.durationSec, exam.closesAt),
          totalCount: paper.questionIds.length,
          questions: {
            create: paper.questionIds.map((id, position) => {
              const q = byId.get(id)!;
              const options = q.options.map((o) => ({
                id: o.id,
                content: o.content,
                isCorrect: o.isCorrect,
              }));
              const snapshot: QuestionSnapshot = {
                type: q.type,
                content: q.content,
                // Câu đúng/sai giữ thứ tự "Đúng" rồi "Sai"
                options:
                  exam.shuffleOptions && q.type !== QuestionType.TRUE_FALSE
                    ? shuffle(options)
                    : options,
              };
              return {
                position,
                questionId: id,
                snapshot: snapshot as unknown as Prisma.InputJsonValue,
              };
            }),
          },
        },
      });
    } catch (e) {
      // Hai request bắt đầu cùng lúc: request sau dùng bài của request trước
      if (!(
        e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
      )) {
        throw e;
      }
    }
    return this.view(user, examId);
  }

  async view(user: JwtPayload, examId: string) {
    const { exam } = await this.loadCandidate(user, examId);
    let attempt = await this.loadAttempt(user, examId);
    if (
      attempt.status === ExamAttemptStatus.IN_PROGRESS &&
      !withinDeadline(attempt.deadlineAt, new Date())
    ) {
      await this.grading.grade(attempt.id);
      attempt = await this.loadAttempt(user, examId);
    }

    const now = new Date();
    const inProgress = attempt.status === ExamAttemptStatus.IN_PROGRESS;
    const closed = windowState(exam, now) === 'CLOSED';
    return {
      exam: { id: exam.id, title: exam.title, closesAt: exam.closesAt },
      status: attempt.status,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      submittedAt: attempt.submittedAt,
      serverNow: now,
      totalCount: attempt.totalCount,
      answeredCount: attempt.questions.filter(
        (q) => q.selectedOptionIds.length > 0,
      ).length,
      // Điểm chỉ công bố khi kỳ thi đã đóng; không bao giờ trả đáp án đúng
      score: closed ? attempt.score : null,
      correctCount: closed ? attempt.correctCount : null,
      questions: inProgress
        ? attempt.questions.map((q) => ({
            questionId: q.questionId,
            position: q.position,
            ...publicSnapshot(q.snapshot as unknown as QuestionSnapshot),
            selectedOptionIds: q.selectedOptionIds,
          }))
        : [],
    };
  }

  async save(
    user: JwtPayload,
    examId: string,
    questionId: string,
    selectedOptionIds: string[],
  ) {
    const attempt = await this.loadAttempt(user, examId);
    if (attempt.status !== ExamAttemptStatus.IN_PROGRESS) {
      throw new ConflictException('Bài đã nộp');
    }
    if (!withinDeadline(attempt.deadlineAt, new Date())) {
      await this.grading.grade(attempt.id);
      throw new ConflictException('Đã hết giờ làm bài, bài đã được nộp');
    }
    const question = attempt.questions.find((q) => q.questionId === questionId);
    if (!question)
      throw new NotFoundException('Câu hỏi không có trong bài thi');
    const snapshot = question.snapshot as unknown as QuestionSnapshot;
    const ids = new Set(snapshot.options.map((o) => o.id));
    if (selectedOptionIds.some((id) => !ids.has(id))) {
      throw new BadRequestException('Phương án không thuộc câu hỏi này');
    }
    if (
      snapshot.type !== QuestionType.MULTIPLE &&
      selectedOptionIds.length > 1
    ) {
      throw new BadRequestException('Câu này chỉ chọn một phương án');
    }
    const savedAt = new Date();
    await this.prisma.attemptQuestion.update({
      where: { attemptId_questionId: { attemptId: attempt.id, questionId } },
      data: { selectedOptionIds, savedAt },
    });
    return { savedAt };
  }

  /** Nộp bài; gọi lặp vẫn trả về cùng kết quả. */
  async submit(user: JwtPayload, examId: string) {
    const attempt = await this.loadAttempt(user, examId);
    await this.grading.grade(attempt.id);
    return this.view(user, examId);
  }

  // ---------- Hỗ trợ ----------

  /** Chỉ thí sinh của kỳ thi đã công bố; người khác nhận 404 như không tồn tại. */
  private async loadCandidate(user: JwtPayload, examId: string) {
    const candidate = await this.prisma.examCandidate.findUnique({
      where: { examId_userId: { examId, userId: user.sub } },
      include: {
        exam: { include: { rules: true } },
        attempt: { select: { id: true } },
      },
    });
    if (!candidate || candidate.exam.status !== ExamStatus.PUBLISHED) {
      throw new NotFoundException('Không tìm thấy kỳ thi');
    }
    if (candidate.verdict === CandidateVerdict.VIOLATION) {
      throw new ForbiddenException('Bạn đã bị đình chỉ khỏi kỳ thi này');
    }
    return { exam: candidate.exam, candidate };
  }

  private async loadAttempt(user: JwtPayload, examId: string) {
    const attempt = await this.prisma.examAttempt.findFirst({
      where: { candidate: { examId, userId: user.sub } },
      include: { questions: { orderBy: { position: 'asc' } } },
    });
    if (!attempt) throw new NotFoundException('Bạn chưa bắt đầu kỳ thi này');
    return attempt;
  }
}
