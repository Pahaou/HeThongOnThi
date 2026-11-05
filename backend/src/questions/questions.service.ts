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
  Prisma,
  QuestionSource,
  QuestionStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateQuestionDto,
  ListQuestionsQuery,
  OptionDto,
  TopicDto,
  UpdateQuestionDto,
} from './dto/question.dto';
import { parseRow, ParsedQuestion } from './excel-import';
import { ImportFileError, readQuestionRows } from './excel-workbook';
import { validateOptions } from './question-rules';

const QUESTION_INCLUDE = {
  topic: { select: { id: true, name: true } },
  lesson: { select: { id: true, title: true } },
  options: {
    orderBy: { position: 'asc' },
    select: { id: true, content: true, isCorrect: true, position: true },
  },
} satisfies Prisma.QuestionInclude;

export interface ImportResult {
  created: number;
  createdTopics: string[];
  errors: { row: number; message: string }[];
}

@Injectable()
export class QuestionsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Chủ đề ----------

  async listTopics(actor: JwtPayload, courseId: string) {
    await this.assertCourse(actor, courseId);
    const topics = await this.prisma.topic.findMany({
      where: { courseId },
      orderBy: { name: 'asc' },
      include: {
        _count: {
          select: { questions: { where: { status: QuestionStatus.ACTIVE } } },
        },
      },
    });
    return topics.map(({ _count, ...t }) => ({
      ...t,
      questionCount: _count.questions,
    }));
  }

  async createTopic(actor: JwtPayload, courseId: string, dto: TopicDto) {
    await this.assertCourse(actor, courseId);
    return this.saveTopic(() =>
      this.prisma.topic.create({ data: { courseId, name: dto.name.trim() } }),
    );
  }

  async renameTopic(actor: JwtPayload, topicId: string, dto: TopicDto) {
    await this.assertTopic(actor, topicId);
    return this.saveTopic(() =>
      this.prisma.topic.update({
        where: { id: topicId },
        data: { name: dto.name.trim() },
      }),
    );
  }

  async deleteTopic(actor: JwtPayload, topicId: string) {
    await this.assertTopic(actor, topicId);
    const count = await this.prisma.question.count({ where: { topicId } });
    if (count > 0) {
      throw new BadRequestException(
        `Chủ đề còn ${count} câu hỏi, hãy chuyển hoặc xóa câu hỏi trước`,
      );
    }
    await this.prisma.topic.delete({ where: { id: topicId } });
  }

  private async saveTopic<T>(save: () => Promise<T>): Promise<T> {
    try {
      return await save();
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === 'P2002'
      ) {
        throw new ConflictException('Khóa học đã có chủ đề cùng tên');
      }
      throw e;
    }
  }

  // ---------- Câu hỏi ----------

  async list(actor: JwtPayload, courseId: string, query: ListQuestionsQuery) {
    await this.assertCourse(actor, courseId);
    const where: Prisma.QuestionWhereInput = {
      courseId,
      topicId: query.topicId,
      type: query.type,
      difficulty: query.difficulty,
      // Mặc định ẩn câu đã lưu trữ
      status: query.status ?? { not: QuestionStatus.ARCHIVED },
      content: query.q ? { contains: query.q, mode: 'insensitive' } : undefined,
    };
    const [total, items] = await Promise.all([
      this.prisma.question.count({ where }),
      this.prisma.question.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: QUESTION_INCLUDE,
      }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items };
  }

  async get(actor: JwtPayload, questionId: string) {
    await this.assertQuestion(actor, questionId);
    return this.prisma.question.findUniqueOrThrow({
      where: { id: questionId },
      include: QUESTION_INCLUDE,
    });
  }

  async create(actor: JwtPayload, courseId: string, dto: CreateQuestionDto) {
    await this.assertCourse(actor, courseId);
    await this.assertRefs(courseId, dto.topicId, dto.lessonId);
    assertOptions(dto.type, dto.options);

    return this.prisma.question.create({
      data: {
        courseId,
        topicId: dto.topicId,
        lessonId: dto.lessonId ?? null,
        createdById: actor.sub,
        type: dto.type,
        difficulty: dto.difficulty,
        content: dto.content.trim(),
        explanation: dto.explanation?.trim() ?? '',
        options: {
          create: dto.options.map((o, position) => ({
            content: o.content.trim(),
            isCorrect: o.isCorrect,
            position,
          })),
        },
      },
      include: QUESTION_INCLUDE,
    });
  }

  async update(actor: JwtPayload, questionId: string, dto: UpdateQuestionDto) {
    const question = await this.assertQuestion(actor, questionId);
    await this.assertRefs(question.courseId, dto.topicId, dto.lessonId);

    const type = dto.type ?? question.type;
    const options =
      dto.options ??
      (await this.prisma.questionOption.findMany({
        where: { questionId },
        orderBy: { position: 'asc' },
      }));
    // Đổi loại câu hỏi mà không gửi phương án mới thì vẫn phải hợp lệ
    assertOptions(type, options);

    const data: Prisma.QuestionUncheckedUpdateInput = {
      topicId: dto.topicId,
      lessonId: dto.lessonId,
      type,
      difficulty: dto.difficulty,
      content: dto.content?.trim(),
      explanation: dto.explanation?.trim(),
      status: dto.status,
    };

    if (!dto.options) {
      await this.prisma.question.update({ where: { id: questionId }, data });
    } else {
      const keep = dto.options.filter((o) => o.id).map((o) => o.id!);
      const existing = await this.prisma.questionOption.findMany({
        where: { questionId },
        select: { id: true },
      });
      const existingIds = new Set(existing.map((o) => o.id));
      if (keep.some((id) => !existingIds.has(id))) {
        throw new BadRequestException('Phương án không thuộc câu hỏi này');
      }
      await this.prisma.$transaction([
        this.prisma.question.update({ where: { id: questionId }, data }),
        this.prisma.questionOption.deleteMany({
          where: { questionId, id: { notIn: keep } },
        }),
        ...dto.options.map((o, position) =>
          o.id
            ? this.prisma.questionOption.update({
                where: { id: o.id },
                data: {
                  content: o.content.trim(),
                  isCorrect: o.isCorrect,
                  position,
                },
              })
            : this.prisma.questionOption.create({
                data: {
                  questionId,
                  content: o.content.trim(),
                  isCorrect: o.isCorrect,
                  position,
                },
              }),
        ),
      ]);
    }
    return this.get(actor, questionId);
  }

  async remove(actor: JwtPayload, questionId: string) {
    await this.assertQuestion(actor, questionId);
    await this.prisma.question.delete({ where: { id: questionId } });
  }

  // ---------- Import Excel ----------

  /**
   * Nhập theo kiểu "tất cả hoặc không": có dòng lỗi thì không nhập dòng nào
   * và trả về lỗi theo số dòng để giảng viên sửa file rồi nhập lại.
   */
  async importExcel(
    actor: JwtPayload,
    courseId: string,
    file: Express.Multer.File | undefined,
  ): Promise<ImportResult> {
    await this.assertCourse(actor, courseId);
    if (!file) throw new BadRequestException('Chưa chọn file');

    let rows;
    try {
      rows = await readQuestionRows(file.buffer);
    } catch (e) {
      if (e instanceof ImportFileError)
        throw new BadRequestException(e.message);
      throw e;
    }

    const parsed: ParsedQuestion[] = [];
    const errors: ImportResult['errors'] = [];
    for (const row of rows) {
      const result = parseRow(row.cells);
      if (result.ok) parsed.push(result.value);
      else errors.push({ row: row.rowNumber, message: result.error });
    }
    if (errors.length > 0) return { created: 0, createdTopics: [], errors };

    // Khớp chủ đề không phân biệt hoa thường; chưa có thì tạo mới
    const existing = await this.prisma.topic.findMany({ where: { courseId } });
    const topicIds = new Map(existing.map((t) => [t.name.toLowerCase(), t.id]));
    const newNames = [
      ...new Map(
        parsed
          .filter((q) => !topicIds.has(q.topicName.toLowerCase()))
          .map((q) => [q.topicName.toLowerCase(), q.topicName]),
      ).values(),
    ];

    await this.prisma.$transaction(
      async (tx) => {
        for (const name of newNames) {
          const topic = await tx.topic.create({ data: { courseId, name } });
          topicIds.set(name.toLowerCase(), topic.id);
        }
        for (const q of parsed) {
          await tx.question.create({
            data: {
              courseId,
              topicId: topicIds.get(q.topicName.toLowerCase())!,
              createdById: actor.sub,
              type: q.type,
              difficulty: q.difficulty,
              content: q.content,
              explanation: q.explanation,
              source: QuestionSource.IMPORT,
              options: {
                create: q.options.map((o, position) => ({ ...o, position })),
              },
            },
          });
        }
      },
      { timeout: 60_000 },
    );

    return { created: parsed.length, createdTopics: newNames, errors: [] };
  }

  // ---------- Kiểm tra quyền và tham chiếu ----------

  private async assertCourse(actor: JwtPayload, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    if (!canManageCourse(course, actor)) {
      throw new ForbiddenException(
        'Bạn không phải giảng viên của khóa học này',
      );
    }
    return course;
  }

  private async assertTopic(actor: JwtPayload, topicId: string) {
    const topic = await this.prisma.topic.findUnique({
      where: { id: topicId },
    });
    if (!topic) throw new NotFoundException('Không tìm thấy chủ đề');
    await this.assertCourse(actor, topic.courseId);
    return topic;
  }

  private async assertQuestion(actor: JwtPayload, questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question) throw new NotFoundException('Không tìm thấy câu hỏi');
    await this.assertCourse(actor, question.courseId);
    return question;
  }

  /** Chủ đề và bài học gắn với câu hỏi phải cùng khóa học. */
  private async assertRefs(
    courseId: string,
    topicId: string | undefined,
    lessonId: string | null | undefined,
  ) {
    if (topicId) {
      const topic = await this.prisma.topic.findFirst({
        where: { id: topicId, courseId },
      });
      if (!topic)
        throw new BadRequestException('Chủ đề không thuộc khóa học này');
    }
    if (lessonId) {
      const lesson = await this.prisma.lesson.findFirst({
        where: { id: lessonId, chapter: { courseId } },
      });
      if (!lesson)
        throw new BadRequestException('Bài học không thuộc khóa học này');
    }
  }
}

function assertOptions(
  type: Parameters<typeof validateOptions>[0],
  options: Pick<OptionDto, 'content' | 'isCorrect'>[],
) {
  const error = validateOptions(type, options);
  if (error) throw new BadRequestException(error);
}
