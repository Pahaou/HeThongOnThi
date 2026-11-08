import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtPayload } from '../auth/auth.types';
import { canManageCourse } from '../courses/course-access';
import {
  Difficulty,
  PracticeMode,
  Prisma,
  QuestionStatus,
  QuestionType,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StartMockDto, StartTopicPracticeDto } from './dto/practice.dto';
import {
  buildPaper,
  isAnswerCorrect,
  pickRandom,
  score10,
  shuffle,
} from './grading';
import { loadPools, poolKey } from './question-pool';

// Cho phép trễ vài giây so với hạn nộp để bù độ trễ mạng
const DEADLINE_GRACE_MS = 5_000;

const ATTEMPT_INCLUDE = {
  course: { select: { id: true, slug: true, title: true } },
  answers: {
    orderBy: { position: 'asc' },
    include: {
      question: {
        select: {
          id: true,
          type: true,
          difficulty: true,
          content: true,
          explanation: true,
          topic: { select: { id: true, name: true } },
          options: { select: { id: true, content: true, isCorrect: true } },
        },
      },
    },
  },
} satisfies Prisma.PracticeAttemptInclude;

type AttemptWithAnswers = Prisma.PracticeAttemptGetPayload<{
  include: typeof ATTEMPT_INCLUDE;
}>;

@Injectable()
export class PracticeService {
  constructor(private readonly prisma: PrismaService) {}

  /** Những gì học viên chọn được để ôn: chủ đề (số câu theo độ khó) và đề thi thử đã công bố. */
  async options(user: JwtPayload, courseId: string) {
    await this.assertLearner(user, courseId);
    const [topics, pools, blueprints] = await Promise.all([
      this.prisma.topic.findMany({
        where: { courseId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      loadPools(this.prisma, courseId),
      this.prisma.examBlueprint.findMany({
        where: { courseId, published: true },
        orderBy: { createdAt: 'desc' },
        include: { rules: { select: { count: true } } },
      }),
    ]);
    const count = (topicId: string, d: Difficulty) =>
      pools.get(poolKey(topicId, d))?.length ?? 0;
    return {
      topics: topics
        .map((t) => ({
          ...t,
          counts: {
            EASY: count(t.id, Difficulty.EASY),
            MEDIUM: count(t.id, Difficulty.MEDIUM),
            HARD: count(t.id, Difficulty.HARD),
          },
        }))
        .filter((t) => t.counts.EASY + t.counts.MEDIUM + t.counts.HARD > 0),
      blueprints: blueprints.map(({ rules, ...b }) => ({
        id: b.id,
        title: b.title,
        durationSec: b.durationSec,
        totalQuestions: rules.reduce((s, r) => s + r.count, 0),
      })),
    };
  }

  async startTopic(user: JwtPayload, dto: StartTopicPracticeDto) {
    await this.assertLearner(user, dto.courseId);
    const topics = dto.topicIds?.length
      ? await this.prisma.topic.findMany({
          where: { id: { in: dto.topicIds }, courseId: dto.courseId },
          select: { id: true, name: true },
        })
      : null;
    if (topics && topics.length !== dto.topicIds!.length) {
      throw new BadRequestException('Có chủ đề không thuộc khóa học này');
    }

    const pool = await this.prisma.question.findMany({
      where: {
        courseId: dto.courseId,
        status: QuestionStatus.ACTIVE,
        topicId: topics ? { in: topics.map((t) => t.id) } : undefined,
        difficulty: dto.difficulty,
      },
      select: { id: true },
    });
    if (pool.length === 0) {
      throw new BadRequestException('Chưa có câu hỏi nào phù hợp để ôn tập');
    }
    const questionIds = pickRandom(
      pool.map((q) => q.id),
      dto.count,
    );
    const title = topics
      ? `Ôn tập: ${topics.map((t) => t.name).join(', ')}`
      : 'Ôn tập: tất cả chủ đề';
    const id = await this.createAttempt(user.sub, dto.courseId, questionIds, {
      mode: PracticeMode.TOPIC,
      title,
    });
    return this.view(user, id);
  }

  async startMock(user: JwtPayload, dto: StartMockDto) {
    const blueprint = await this.prisma.examBlueprint.findUnique({
      where: { id: dto.blueprintId },
      include: { rules: true, course: true },
    });
    if (
      !blueprint ||
      (!blueprint.published && !canManageCourse(blueprint.course, user))
    ) {
      throw new NotFoundException('Không tìm thấy đề thi thử');
    }
    await this.assertLearner(user, blueprint.courseId);

    const pools = await loadPools(this.prisma, blueprint.courseId);
    const paper = buildPaper(
      blueprint.rules,
      (r) => pools.get(poolKey(r.topicId, r.difficulty)) ?? [],
    );
    if (!paper.ok) {
      throw new BadRequestException(
        'Kho câu hỏi hiện không đủ để sinh đề này, hãy báo giảng viên',
      );
    }
    const id = await this.createAttempt(
      user.sub,
      blueprint.courseId,
      paper.questionIds,
      {
        mode: PracticeMode.MOCK,
        title: blueprint.title,
        blueprintId: blueprint.id,
        deadlineAt: new Date(Date.now() + blueprint.durationSec * 1000),
      },
    );
    return this.view(user, id);
  }

  async view(user: JwtPayload, attemptId: string) {
    let attempt = await this.loadOwn(user, attemptId);
    if (this.isExpired(attempt)) attempt = await this.grade(attempt);
    return this.present(attempt);
  }

  /**
   * Ôn tập: chấm ngay và trả về đáp án + giải thích, mỗi câu trả lời một lần.
   * Thi thử: chỉ lưu lựa chọn (đổi được tới khi nộp), không tiết lộ đúng sai.
   */
  async answer(
    user: JwtPayload,
    attemptId: string,
    questionId: string,
    selectedOptionIds: string[],
  ) {
    const attempt = await this.loadOwn(user, attemptId);
    if (attempt.submittedAt) throw new ConflictException('Bài đã nộp');
    if (this.isExpired(attempt)) {
      await this.grade(attempt);
      throw new ConflictException('Đã hết giờ làm bài, bài đã được nộp');
    }

    const answer = attempt.answers.find((a) => a.questionId === questionId);
    if (!answer) throw new NotFoundException('Câu hỏi không có trong bài này');
    const { question } = answer;
    const optionIds = new Set(question.options.map((o) => o.id));
    if (selectedOptionIds.some((id) => !optionIds.has(id))) {
      throw new BadRequestException('Phương án không thuộc câu hỏi này');
    }
    if (
      question.type !== QuestionType.MULTIPLE &&
      selectedOptionIds.length > 1
    ) {
      throw new BadRequestException('Câu này chỉ chọn một phương án');
    }
    const key = { attemptId_questionId: { attemptId, questionId } };

    if (attempt.mode === PracticeMode.MOCK) {
      await this.prisma.practiceAnswer.update({
        where: key,
        data: { selectedOptionIds, answeredAt: new Date() },
      });
      return { saved: true };
    }

    if (answer.answeredAt) throw new ConflictException('Câu này đã trả lời');
    if (selectedOptionIds.length === 0) {
      throw new BadRequestException('Chọn ít nhất một phương án');
    }
    const correctIds = question.options
      .filter((o) => o.isCorrect)
      .map((o) => o.id);
    const isCorrect = isAnswerCorrect(selectedOptionIds, correctIds);
    // Điều kiện answeredAt = null để hai request đồng thời không cùng chấm một câu
    const { count } = await this.prisma.practiceAnswer.updateMany({
      where: { attemptId, questionId, answeredAt: null },
      data: { selectedOptionIds, isCorrect, answeredAt: new Date() },
    });
    if (count === 0) throw new ConflictException('Câu này đã trả lời');
    if (isCorrect) {
      await this.prisma.practiceAttempt.update({
        where: { id: attemptId },
        data: { correctCount: { increment: 1 } },
      });
    }
    return {
      isCorrect,
      correctOptionIds: correctIds,
      explanation: question.explanation,
    };
  }

  /** Nộp bài; gọi lại nhiều lần vẫn trả về cùng kết quả. */
  async submit(user: JwtPayload, attemptId: string) {
    const attempt = await this.loadOwn(user, attemptId);
    return this.present(await this.grade(attempt));
  }

  async history(user: JwtPayload, courseId: string) {
    await this.assertLearner(user, courseId);
    return this.prisma.practiceAttempt.findMany({
      where: { userId: user.sub, courseId },
      orderBy: { startedAt: 'desc' },
      take: 30,
      select: {
        id: true,
        mode: true,
        title: true,
        startedAt: true,
        deadlineAt: true,
        submittedAt: true,
        totalCount: true,
        correctCount: true,
        score: true,
      },
    });
  }

  // ---------- Nội bộ ----------

  private async createAttempt(
    userId: string,
    courseId: string,
    questionIds: string[],
    data: {
      mode: PracticeMode;
      title: string;
      blueprintId?: string;
      deadlineAt?: Date;
    },
  ): Promise<string> {
    const options = await this.prisma.questionOption.findMany({
      where: { questionId: { in: questionIds } },
      orderBy: { position: 'asc' },
      select: {
        id: true,
        questionId: true,
        question: { select: { type: true } },
      },
    });
    const byQuestion = new Map<string, string[]>();
    const trueFalse = new Set<string>();
    for (const o of options) {
      byQuestion.set(o.questionId, [
        ...(byQuestion.get(o.questionId) ?? []),
        o.id,
      ]);
      if (o.question.type === QuestionType.TRUE_FALSE)
        trueFalse.add(o.questionId);
    }

    const attempt = await this.prisma.practiceAttempt.create({
      data: {
        ...data,
        userId,
        courseId,
        totalCount: questionIds.length,
        answers: {
          create: questionIds.map((questionId, position) => ({
            questionId,
            position,
            // Câu đúng/sai giữ nguyên thứ tự "Đúng" rồi "Sai"
            optionOrder: trueFalse.has(questionId)
              ? (byQuestion.get(questionId) ?? [])
              : shuffle(byQuestion.get(questionId) ?? []),
          })),
        },
      },
      select: { id: true },
    });
    return attempt.id;
  }

  /**
   * Chấm toàn bài và đánh dấu đã nộp. Chỉ một request "giành" được quyền
   * nộp (điều kiện submittedAt = null), các request sau chỉ đọc kết quả.
   */
  private async grade(
    attempt: AttemptWithAnswers,
  ): Promise<AttemptWithAnswers> {
    if (attempt.submittedAt) return attempt;
    await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.practiceAttempt.updateMany({
        where: { id: attempt.id, submittedAt: null },
        data: { submittedAt: new Date() },
      });
      if (count === 0) return;

      let correct = 0;
      for (const a of attempt.answers) {
        const correctIds = a.question.options
          .filter((o) => o.isCorrect)
          .map((o) => o.id);
        const isCorrect = isAnswerCorrect(a.selectedOptionIds, correctIds);
        if (isCorrect) correct++;
        if (a.isCorrect !== isCorrect) {
          await tx.practiceAnswer.update({
            where: {
              attemptId_questionId: {
                attemptId: attempt.id,
                questionId: a.questionId,
              },
            },
            data: { isCorrect },
          });
        }
      }
      await tx.practiceAttempt.update({
        where: { id: attempt.id },
        data: {
          correctCount: correct,
          score: score10(correct, attempt.totalCount),
        },
      });
    });
    return this.loadOwnById(attempt.id);
  }

  private isExpired(attempt: {
    deadlineAt: Date | null;
    submittedAt: Date | null;
  }) {
    return (
      !attempt.submittedAt &&
      !!attempt.deadlineAt &&
      Date.now() > attempt.deadlineAt.getTime() + DEADLINE_GRACE_MS
    );
  }

  /** Dữ liệu trả về client; chỉ kèm đáp án đúng cho câu đã được chấm. */
  private present(attempt: AttemptWithAnswers) {
    const submitted = !!attempt.submittedAt;
    return {
      id: attempt.id,
      mode: attempt.mode,
      title: attempt.title,
      course: attempt.course,
      startedAt: attempt.startedAt,
      deadlineAt: attempt.deadlineAt,
      submittedAt: attempt.submittedAt,
      serverNow: new Date(),
      totalCount: attempt.totalCount,
      correctCount:
        submitted || attempt.mode === PracticeMode.TOPIC
          ? attempt.correctCount
          : null,
      score: attempt.score,
      questions: attempt.answers.map((a) => {
        const q = a.question;
        const revealed =
          submitted || (attempt.mode === PracticeMode.TOPIC && !!a.answeredAt);
        const byId = new Map(q.options.map((o) => [o.id, o]));
        return {
          questionId: q.id,
          position: a.position,
          type: q.type,
          difficulty: q.difficulty,
          topic: q.topic,
          content: q.content,
          // Bỏ qua phương án đã bị xóa khỏi câu hỏi sau khi bắt đầu làm
          options: a.optionOrder
            .filter((id) => byId.has(id))
            .map((id) => ({ id, content: byId.get(id)!.content })),
          selectedOptionIds: a.selectedOptionIds,
          answered: !!a.answeredAt,
          ...(revealed && {
            isCorrect: a.isCorrect ?? false,
            correctOptionIds: q.options
              .filter((o) => o.isCorrect)
              .map((o) => o.id),
            explanation: q.explanation,
          }),
        };
      }),
    };
  }

  private async loadOwn(user: JwtPayload, attemptId: string) {
    const attempt = await this.loadOwnById(attemptId).catch(() => null);
    if (!attempt || attempt.userId !== user.sub) {
      throw new NotFoundException('Không tìm thấy bài làm');
    }
    return attempt;
  }

  private loadOwnById(attemptId: string) {
    return this.prisma.practiceAttempt.findUniqueOrThrow({
      where: { id: attemptId },
      include: ATTEMPT_INCLUDE,
    });
  }

  /** Học viên đã ghi danh, hoặc người quản lý khóa học. */
  private async assertLearner(user: JwtPayload, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    if (canManageCourse(course, user)) return;
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId: user.sub, courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException('Bạn cần ghi danh khóa học để ôn tập');
    }
  }
}
