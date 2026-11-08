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
import { AnswerItemDto } from './dto/exam.dto';
import {
  acceptsSync,
  answeredInTime,
  attemptDeadline,
  clampClientTime,
  isNewer,
  publicSnapshot,
  QuestionSnapshot,
  windowState,
} from './exam-rules';

/** Mã lỗi 409 để client phân biệt và xử lý đúng */
export const ATTEMPT_SUBMITTED = 'ATTEMPT_SUBMITTED';
export const SESSION_REPLACED = 'SESSION_REPLACED';

function conflict(code: string, message: string) {
  return new ConflictException({ statusCode: 409, code, message });
}

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
      if (attempt && attempt.status !== ExamAttemptStatus.IN_PROGRESS)
        state = 'SUBMITTED';
      else if (attempt)
        state = acceptsSync(attempt.deadlineAt, now)
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
        grading: attempt?.status === ExamAttemptStatus.SUBMITTED,
        correctCount: closed ? (attempt?.correctCount ?? null) : null,
      };
    });
  }

  /**
   * Bắt đầu, hoặc vào lại bài đang làm. Đề sinh và đóng băng một lần duy nhất.
   * Phiên (tab/thiết bị) gọi start trở thành phiên duy nhất được ghi bài;
   * phiên cũ sẽ nhận lỗi SESSION_REPLACED khi lưu.
   */
  async start(user: JwtPayload, examId: string, sessionId: string) {
    const { exam, candidate } = await this.loadCandidate(user, examId);
    if (candidate.attempt) {
      await this.claimSession(candidate.attempt.id, sessionId);
      return this.view(user, examId);
    }

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
          activeSessionId: sessionId,
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
      const existing = await this.loadAttempt(user, examId);
      await this.claimSession(existing.id, sessionId);
    }
    return this.view(user, examId);
  }

  /** Giành phiên ghi bài; đếm số lần đổi thiết bị để giám thị xem xét. */
  private async claimSession(attemptId: string, sessionId: string) {
    await this.prisma.examAttempt.updateMany({
      where: {
        id: attemptId,
        status: ExamAttemptStatus.IN_PROGRESS,
        activeSessionId: { not: sessionId },
      },
      data: { activeSessionId: sessionId, sessionTakeovers: { increment: 1 } },
    });
  }

  async view(user: JwtPayload, examId: string) {
    const { exam } = await this.loadCandidate(user, examId);
    let attempt = await this.loadAttempt(user, examId);
    if (
      attempt.status === ExamAttemptStatus.IN_PROGRESS &&
      !acceptsSync(attempt.deadlineAt, new Date())
    ) {
      await this.grading.submit(attempt.id);
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
      // Đã nộp nhưng hàng đợi chưa chấm xong
      grading: attempt.status === ExamAttemptStatus.SUBMITTED,
      questions: inProgress
        ? attempt.questions.map((q) => ({
            questionId: q.questionId,
            position: q.position,
            ...publicSnapshot(q.snapshot as unknown as QuestionSnapshot),
            selectedOptionIds: q.selectedOptionIds,
            clientSavedAt: q.clientSavedAt,
          }))
        : [],
    };
  }

  /**
   * Lưu theo lô (tự lưu định kỳ, hoặc gửi bù sau khi mất mạng). Mỗi câu chỉ
   * ghi đè khi bản gửi lên mới hơn bản đang có, và chỉ nhận câu được chọn
   * trước hạn nộp.
   */
  async saveAnswers(
    user: JwtPayload,
    examId: string,
    sessionId: string,
    answers: AnswerItemDto[],
  ) {
    const attempt = await this.loadAttempt(user, examId);
    if (attempt.status !== ExamAttemptStatus.IN_PROGRESS) {
      throw conflict(ATTEMPT_SUBMITTED, 'Bài đã nộp');
    }
    if (attempt.activeSessionId !== sessionId) {
      throw conflict(
        SESSION_REPLACED,
        'Bài thi đang được mở ở thiết bị hoặc tab khác',
      );
    }
    const now = new Date();
    if (!acceptsSync(attempt.deadlineAt, now)) {
      await this.grading.submit(attempt.id);
      throw conflict(ATTEMPT_SUBMITTED, 'Đã hết giờ làm bài, bài đã được nộp');
    }

    const byQuestion = new Map(attempt.questions.map((q) => [q.questionId, q]));
    for (const a of answers) {
      const q = byQuestion.get(a.questionId);
      if (!q) throw new BadRequestException('Câu hỏi không có trong bài thi');
      const snapshot = q.snapshot as unknown as QuestionSnapshot;
      const ids = new Set(snapshot.options.map((o) => o.id));
      if (a.selectedOptionIds.some((id) => !ids.has(id))) {
        throw new BadRequestException('Phương án không thuộc câu hỏi này');
      }
      if (
        snapshot.type !== QuestionType.MULTIPLE &&
        a.selectedOptionIds.length > 1
      ) {
        throw new BadRequestException('Câu này chỉ chọn một phương án');
      }
    }

    let saved = 0;
    let stale = 0;
    let late = 0;
    for (const a of answers) {
      const clientSavedAt = clampClientTime(a.clientSavedAt, now);
      if (!answeredInTime(clientSavedAt, attempt.deadlineAt)) {
        late++;
        continue;
      }
      if (
        !isNewer(clientSavedAt, byQuestion.get(a.questionId)!.clientSavedAt)
      ) {
        stale++;
        continue;
      }
      // Điều kiện trong WHERE để hai request đồng thời không ghi đè bản mới hơn
      const { count } = await this.prisma.attemptQuestion.updateMany({
        where: {
          attemptId: attempt.id,
          questionId: a.questionId,
          OR: [
            { clientSavedAt: null },
            { clientSavedAt: { lt: clientSavedAt } },
          ],
        },
        data: {
          selectedOptionIds: a.selectedOptionIds,
          clientSavedAt,
          savedAt: now,
        },
      });
      if (count === 1) saved++;
      else stale++;
    }
    return { saved, stale, late, serverNow: now };
  }

  /** Nộp bài; gọi lặp vẫn trả về cùng kết quả. Việc chấm chạy trong hàng đợi. */
  async submit(user: JwtPayload, examId: string, sessionId: string) {
    const attempt = await this.loadAttempt(user, examId);
    if (
      attempt.status === ExamAttemptStatus.IN_PROGRESS &&
      attempt.activeSessionId !== sessionId
    ) {
      throw conflict(
        SESSION_REPLACED,
        'Bài thi đang được mở ở thiết bị hoặc tab khác',
      );
    }
    await this.grading.submit(attempt.id);
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
