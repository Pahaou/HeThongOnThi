import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtPayload } from '../auth/auth.types';
import { canManageCourse } from '../courses/course-access';
import {
  AiCallStatus,
  AiFeature,
  QuestionSource,
  QuestionStatus,
} from '../generated/prisma/client';
import { assertLearner } from '../practice/learner-access';
import { PracticeService } from '../practice/practice.service';
import { StatsService } from '../practice/stats.service';
import { PrismaService } from '../prisma/prisma.service';
import { validateOptions } from '../questions/question-rules';
import {
  AI_CLIENT,
  type AiClient,
  AiUnavailableError,
  type AiUsageInfo,
} from './ai-client';
import { GenerateQuestionsDto } from './dto/ai.dto';
import { fallbackAdvice, pickWeaknessQuestions } from './weakness';

// Lượt gọi AI tối đa mỗi người trong 24 giờ (đổi bằng biến môi trường)
const DEFAULT_LIMITS: Record<AiFeature, number> = {
  GENERATE_QUESTIONS: 20,
  EXPLAIN: 30,
  ADVICE: 10,
};
const MAX_SOURCE_CHARS = 60_000;
const RECOMMEND_COUNT = 10;

export interface ExplainResult {
  source: 'AI' | 'FALLBACK';
  content: string;
  /** Lý do dùng dự phòng, để hiện cho học viên */
  note?: string;
}

@Injectable()
export class AiService {
  private readonly limits: Record<AiFeature, number>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly stats: StatsService,
    private readonly practice: PracticeService,
    @Inject(AI_CLIENT) private readonly ai: AiClient,
    config: ConfigService,
  ) {
    const num = (key: string, d: number) => Number(config.get(key) ?? d) || d;
    this.limits = {
      GENERATE_QUESTIONS: num(
        'AI_LIMIT_GENERATE',
        DEFAULT_LIMITS.GENERATE_QUESTIONS,
      ),
      EXPLAIN: num('AI_LIMIT_EXPLAIN', DEFAULT_LIMITS.EXPLAIN),
      ADVICE: num('AI_LIMIT_ADVICE', DEFAULT_LIMITS.ADVICE),
    };
  }

  // ---------- 1. Sinh câu hỏi từ tài liệu ----------

  /**
   * AI đề xuất câu hỏi từ tài liệu (PDF/txt/md tải lên, hoặc nội dung một bài
   * học). Câu hợp lệ được lưu ở trạng thái DRAFT để giảng viên duyệt; câu sai
   * định dạng bị bỏ. AI không phản hồi thì báo lỗi rõ ràng (giảng viên soạn tay).
   */
  async generateQuestions(
    actor: JwtPayload,
    courseId: string,
    dto: GenerateQuestionsDto,
    file?: Express.Multer.File,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    if (!canManageCourse(course, actor)) {
      throw new ForbiddenException(
        'Bạn không phải giảng viên của khóa học này',
      );
    }
    const topic = await this.prisma.topic.findFirst({
      where: { id: dto.topicId, courseId },
    });
    if (!topic)
      throw new BadRequestException('Chủ đề không thuộc khóa học này');

    // Kiểm tra cả khi tải file: lessonId vẫn được gắn vào câu hỏi sinh ra
    const lesson = dto.lessonId
      ? await this.prisma.lesson.findFirst({
          where: { id: dto.lessonId, chapter: { courseId } },
        })
      : null;
    if (dto.lessonId && !lesson) {
      throw new BadRequestException('Bài học không thuộc khóa học này');
    }

    let text: string | undefined;
    let pdfBase64: string | undefined;
    if (file) {
      if (file.originalname.toLowerCase().endsWith('.pdf')) {
        pdfBase64 = file.buffer.toString('base64');
      } else {
        text = file.buffer.toString('utf8');
      }
    } else if (lesson) {
      text = `${lesson.title}\n\n${lesson.content}`;
    } else if (dto.text?.trim()) {
      text = dto.text;
    }
    if (!pdfBase64 && !text?.trim()) {
      throw new BadRequestException(
        'Cần tài liệu: tải file, chọn bài học hoặc dán nội dung',
      );
    }
    if (text && text.length > MAX_SOURCE_CHARS) {
      throw new BadRequestException(
        `Tài liệu dài quá ${MAX_SOURCE_CHARS.toLocaleString('vi-VN')} ký tự, hãy chia nhỏ`,
      );
    }

    await this.assertQuota(actor.sub, AiFeature.GENERATE_QUESTIONS);
    let result;
    try {
      result = await this.ai.generateQuestions({
        topicName: topic.name,
        difficulty: dto.difficulty,
        count: dto.count,
        text,
        pdfBase64,
      });
    } catch (e) {
      await this.log(
        actor.sub,
        AiFeature.GENERATE_QUESTIONS,
        AiCallStatus.FAILED,
        undefined,
        e,
      );
      if (e instanceof AiUnavailableError) {
        throw new ServiceUnavailableException(
          `${e.message}. Bạn vẫn có thể soạn câu hỏi thủ công hoặc thử lại sau.`,
        );
      }
      throw e;
    }

    const valid = result.questions.filter(
      (q) => q.content.trim() && validateOptions(q.type, q.options) === null,
    );
    await this.prisma.$transaction(
      valid.map((q) =>
        this.prisma.question.create({
          data: {
            courseId,
            topicId: topic.id,
            lessonId: dto.lessonId ?? null,
            createdById: actor.sub,
            type: q.type,
            difficulty: dto.difficulty,
            content: q.content.trim(),
            explanation: q.explanation.trim(),
            source: QuestionSource.AI,
            // Chờ giảng viên duyệt mới vào ngân hàng chính thức
            status: QuestionStatus.DRAFT,
            options: {
              create: q.options.map((o, position) => ({
                content: o.content.trim(),
                isCorrect: o.isCorrect,
                position,
              })),
            },
          },
        }),
      ),
    );
    await this.log(
      actor.sub,
      AiFeature.GENERATE_QUESTIONS,
      AiCallStatus.SUCCESS,
      result.usage,
    );
    return {
      created: valid.length,
      skipped: result.questions.length - valid.length,
    };
  }

  // ---------- 2. Giải thích đáp án ----------

  /**
   * Giải thích một câu học viên đã làm (ôn tập/thi thử, không áp dụng thi
   * chính thức). Dựa trên bài học gắn với câu hỏi; dùng chung cache cho mọi
   * học viên. AI không phản hồi hoặc hết lượt thì trả giải thích của giảng
   * viên kèm trích đoạn bài học.
   */
  async explain(user: JwtPayload, questionId: string): Promise<ExplainResult> {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: {
        options: { orderBy: { position: 'asc' } },
        lesson: { select: { title: true, content: true } },
        course: { select: { instructorId: true } },
        aiExplanation: true,
      },
    });
    if (!question) throw new NotFoundException('Không tìm thấy câu hỏi');
    const answered = await this.prisma.practiceAnswer.findFirst({
      where: {
        questionId,
        isCorrect: { not: null },
        attempt: { userId: user.sub },
      },
      select: { questionId: true },
    });
    // Chỉ giải thích câu đã được chấm, để không lộ đáp án câu chưa làm
    if (!answered && !canManageCourse(question.course, user)) {
      throw new ForbiddenException(
        'Bạn cần làm câu này trước khi xem giải thích',
      );
    }

    // Chỉ dùng lại giải thích của đúng model đang chạy: đổi model (vd. AI trên máy sang Claude) thì giải thích lại
    if (question.aiExplanation?.model === this.ai.model) {
      return { source: 'AI', content: question.aiExplanation.content };
    }
    const fallback = (note: string): ExplainResult => ({
      source: 'FALLBACK',
      note,
      content: [
        question.explanation || 'Câu hỏi chưa có giải thích của giảng viên.',
        question.lesson
          ? `Xem lại bài "${question.lesson.title}": ${excerpt(question.lesson.content)}`
          : '',
      ]
        .filter(Boolean)
        .join('\n\n'),
    });

    if (!(await this.withinQuota(user.sub, AiFeature.EXPLAIN))) {
      return fallback('Bạn đã dùng hết lượt giải thích AI hôm nay');
    }
    try {
      const result = await this.ai.explain({
        question: question.content,
        options: question.options.map((o) => ({
          content: o.content,
          isCorrect: o.isCorrect,
        })),
        teacherExplanation: question.explanation,
        lesson: question.lesson ?? undefined,
      });
      const cached = { content: result.text, model: this.ai.model };
      await this.prisma.aiExplanation.upsert({
        where: { questionId },
        create: { questionId, ...cached },
        update: cached,
      });
      await this.log(
        user.sub,
        AiFeature.EXPLAIN,
        AiCallStatus.SUCCESS,
        result.usage,
      );
      return { source: 'AI', content: result.text };
    } catch (e) {
      if (!(e instanceof AiUnavailableError)) throw e;
      await this.log(
        user.sub,
        AiFeature.EXPLAIN,
        AiCallStatus.FALLBACK,
        undefined,
        e,
      );
      return fallback(e.message);
    }
  }

  // ---------- 3. Gợi ý ôn theo điểm yếu ----------

  /** Chủ đề yếu, số câu sẽ ôn và lời khuyên (AI, hoặc soạn sẵn khi AI không phản hồi). */
  async recommendation(user: JwtPayload, courseId: string) {
    await assertLearner(this.prisma, user, courseId);
    const [course, weakness] = await Promise.all([
      this.prisma.course.findUniqueOrThrow({
        where: { id: courseId },
        select: { title: true },
      }),
      this.weakness(user, courseId),
    ]);
    const { overview, questionIds } = weakness;
    const weakTopics = overview.byTopic
      .filter((t) => t.level === 'WEAK' || t.level === 'FAIR')
      .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0));
    const unresolvedWrong = weakness.unresolvedWrong.length;

    let advice: { source: 'AI' | 'FALLBACK'; text: string };
    const noData = overview.total.answered === 0;
    if (noData || !(await this.withinQuota(user.sub, AiFeature.ADVICE))) {
      advice = {
        source: 'FALLBACK',
        text: fallbackAdvice(weakTopics, unresolvedWrong),
      };
    } else {
      try {
        const r = await this.ai.advise({
          courseTitle: course.title,
          weakTopics: weakTopics.map((t) => ({
            name: t.name,
            accuracy: t.accuracy,
            answered: t.answered,
          })),
          unresolvedWrong,
        });
        await this.log(
          user.sub,
          AiFeature.ADVICE,
          AiCallStatus.SUCCESS,
          r.usage,
        );
        advice = { source: 'AI', text: r.text };
      } catch (e) {
        if (!(e instanceof AiUnavailableError)) throw e;
        await this.log(
          user.sub,
          AiFeature.ADVICE,
          AiCallStatus.FALLBACK,
          undefined,
          e,
        );
        advice = {
          source: 'FALLBACK',
          text: fallbackAdvice(weakTopics, unresolvedWrong),
        };
      }
    }
    return {
      weakTopics: weakTopics.map(({ id, name, accuracy, level, answered }) => ({
        id,
        name,
        accuracy,
        level,
        answered,
      })),
      unresolvedWrong,
      questionCount: questionIds.length,
      advice,
    };
  }

  async startRecommended(user: JwtPayload, courseId: string) {
    await assertLearner(this.prisma, user, courseId);
    return this.practice.startWeakness(
      user,
      courseId,
      (await this.weakness(user, courseId)).questionIds,
    );
  }

  // ---------- Hỗ trợ ----------

  /** Thống kê theo chủ đề, câu sai chưa sửa và bộ câu ôn chọn từ đó (mỗi truy vấn chạy một lần). */
  private async weakness(user: JwtPayload, courseId: string) {
    const [overview, unresolvedWrong, questions, correct] = await Promise.all([
      this.stats.overview(user, courseId),
      this.stats.unresolvedWrongIds(user.sub, courseId),
      this.prisma.question.findMany({
        where: { courseId, status: QuestionStatus.ACTIVE },
        select: { id: true, topicId: true },
      }),
      this.prisma.practiceAnswer.findMany({
        where: { isCorrect: true, attempt: { userId: user.sub, courseId } },
        select: { questionId: true },
      }),
    ]);
    const byTopic = new Map<string, string[]>();
    for (const q of questions)
      byTopic.set(q.topicId, [...(byTopic.get(q.topicId) ?? []), q.id]);
    const questionIds = pickWeaknessQuestions({
      unresolvedWrong,
      topics: overview.byTopic.map((t) => ({
        topicId: t.id,
        name: t.name,
        level: t.level,
        accuracy: t.accuracy,
        questionIds: byTopic.get(t.id) ?? [],
      })),
      answeredCorrect: new Set(correct.map((c) => c.questionId)),
      count: RECOMMEND_COUNT,
    });
    return { overview, unresolvedWrong, questionIds };
  }

  private async withinQuota(
    userId: string,
    feature: AiFeature,
  ): Promise<boolean> {
    // Chỉ lượt AI trả lời thành công mới bị trừ: AI lỗi hay chưa bật (dự phòng) thì không,
    // kẻo mỗi lần mở trang lúc AI tắt đã tiêu hết lượt của ngày
    const used = await this.prisma.aiUsage.count({
      where: {
        userId,
        feature,
        status: AiCallStatus.SUCCESS,
        createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
      },
    });
    return used < this.limits[feature];
  }

  private async assertQuota(userId: string, feature: AiFeature) {
    if (!(await this.withinQuota(userId, feature))) {
      throw new HttpException(
        `Bạn đã dùng hết ${this.limits[feature]} lượt AI trong 24 giờ, hãy thử lại sau`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  private async log(
    userId: string,
    feature: AiFeature,
    status: AiCallStatus,
    usage?: AiUsageInfo,
    error?: unknown,
  ) {
    await this.prisma.aiUsage.create({
      data: {
        userId,
        feature,
        status,
        inputTokens: usage?.inputTokens ?? 0,
        outputTokens: usage?.outputTokens ?? 0,
        error: error instanceof Error ? error.message.slice(0, 500) : undefined,
      },
    });
  }

  /** Trạng thái AI cho giao diện (có cấu hình không, model nào) */
  status() {
    return { available: this.ai.available, model: this.ai.model };
  }
}

/** Trích đoạn đầu bài học (bỏ ký hiệu markdown) làm gợi ý khi không có AI */
function excerpt(markdown: string, max = 400): string {
  const plain = markdown
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#*_`>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return plain.length > max ? `${plain.slice(0, max)}…` : plain;
}
