import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { JwtPayload } from '../auth/auth.types';
import { LessonType, Prisma, Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canManageCourse } from './course-access';
import { ChapterDto } from './dto/chapter.dto';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { CreateLessonDto, UpdateLessonDto } from './dto/lesson.dto';
import { slugify } from './slug';
import { StorageService } from './storage.service';

const ATTACHMENT_SELECT = {
  id: true,
  fileName: true,
  mimeType: true,
  size: true,
  createdAt: true,
} satisfies Prisma.AttachmentSelect;

const COURSE_TREE_INCLUDE = {
  instructor: { select: { id: true, fullName: true } },
  chapters: {
    orderBy: { position: 'asc' },
    include: {
      lessons: {
        orderBy: { position: 'asc' },
        include: {
          attachments: {
            select: ATTACHMENT_SELECT,
            orderBy: { createdAt: 'asc' },
          },
        },
      },
    },
  },
} satisfies Prisma.CourseInclude;

@Injectable()
export class ManageService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ---------- Khóa học ----------

  listCourses(actor: JwtPayload) {
    return this.prisma.course.findMany({
      where: actor.role === Role.ADMIN ? {} : { instructorId: actor.sub },
      orderBy: { updatedAt: 'desc' },
      include: {
        instructor: { select: { id: true, fullName: true } },
        _count: { select: { chapters: true } },
      },
    });
  }

  async createCourse(actor: JwtPayload, dto: CreateCourseDto) {
    return this.prisma.course.create({
      data: {
        instructorId: actor.sub,
        title: dto.title.trim(),
        description: dto.description ?? '',
        thumbnailUrl: dto.thumbnailUrl,
        slug: await this.uniqueSlug(dto.title),
      },
    });
  }

  async getCourse(actor: JwtPayload, courseId: string) {
    await this.assertCourse(actor, courseId);
    return this.prisma.course.findUniqueOrThrow({
      where: { id: courseId },
      include: COURSE_TREE_INCLUDE,
    });
  }

  async updateCourse(
    actor: JwtPayload,
    courseId: string,
    dto: UpdateCourseDto,
  ) {
    await this.assertCourse(actor, courseId);
    if (dto.published) {
      const lessons = await this.prisma.lesson.count({
        where: { chapter: { courseId } },
      });
      if (lessons === 0) {
        throw new BadRequestException(
          'Khóa học cần ít nhất một bài học trước khi công bố',
        );
      }
    }
    // Không đổi slug khi đổi tên để link cũ vẫn dùng được
    return this.prisma.course.update({
      where: { id: courseId },
      data: {
        title: dto.title?.trim(),
        description: dto.description,
        thumbnailUrl: dto.thumbnailUrl,
        published: dto.published,
      },
    });
  }

  async deleteCourse(actor: JwtPayload, courseId: string) {
    await this.assertCourse(actor, courseId);
    const keys = await this.storageKeys({ chapter: { courseId } });
    await this.prisma.course.delete({ where: { id: courseId } });
    await this.storage.remove(keys);
  }

  // ---------- Chương ----------

  async addChapter(actor: JwtPayload, courseId: string, dto: ChapterDto) {
    await this.assertCourse(actor, courseId);
    const last = await this.prisma.chapter.aggregate({
      where: { courseId },
      _max: { position: true },
    });
    return this.prisma.chapter.create({
      data: {
        courseId,
        title: dto.title.trim(),
        position: (last._max.position ?? -1) + 1,
      },
    });
  }

  async updateChapter(actor: JwtPayload, chapterId: string, dto: ChapterDto) {
    await this.assertChapter(actor, chapterId);
    return this.prisma.chapter.update({
      where: { id: chapterId },
      data: { title: dto.title.trim() },
    });
  }

  async deleteChapter(actor: JwtPayload, chapterId: string) {
    await this.assertChapter(actor, chapterId);
    const keys = await this.storageKeys({ chapterId });
    await this.prisma.chapter.delete({ where: { id: chapterId } });
    await this.storage.remove(keys);
  }

  async reorderChapters(actor: JwtPayload, courseId: string, ids: string[]) {
    await this.assertCourse(actor, courseId);
    const current = await this.prisma.chapter.findMany({
      where: { courseId },
      select: { id: true },
    });
    assertSameSet(
      current.map((c) => c.id),
      ids,
    );
    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.chapter.update({ where: { id }, data: { position } }),
      ),
    );
  }

  // ---------- Bài học ----------

  async addLesson(actor: JwtPayload, chapterId: string, dto: CreateLessonDto) {
    await this.assertChapter(actor, chapterId);
    assertVideoUrl(dto.type, dto.videoUrl);
    const last = await this.prisma.lesson.aggregate({
      where: { chapterId },
      _max: { position: true },
    });
    return this.prisma.lesson.create({
      data: {
        chapterId,
        type: dto.type,
        title: dto.title.trim(),
        videoUrl: dto.type === LessonType.VIDEO ? dto.videoUrl : null,
        content: dto.content ?? '',
        durationSec: dto.durationSec ?? 0,
        position: (last._max.position ?? -1) + 1,
      },
    });
  }

  async updateLesson(
    actor: JwtPayload,
    lessonId: string,
    dto: UpdateLessonDto,
  ) {
    const lesson = await this.assertLesson(actor, lessonId);
    const type = dto.type ?? lesson.type;
    const videoUrl =
      dto.videoUrl === undefined ? lesson.videoUrl : dto.videoUrl;
    assertVideoUrl(type, videoUrl);
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        type,
        title: dto.title?.trim(),
        videoUrl: type === LessonType.VIDEO ? videoUrl : null,
        content: dto.content,
        durationSec: dto.durationSec,
      },
    });
  }

  async deleteLesson(actor: JwtPayload, lessonId: string) {
    await this.assertLesson(actor, lessonId);
    const keys = await this.storageKeys({ id: lessonId });
    await this.prisma.lesson.delete({ where: { id: lessonId } });
    await this.storage.remove(keys);
  }

  async reorderLessons(actor: JwtPayload, chapterId: string, ids: string[]) {
    await this.assertChapter(actor, chapterId);
    const current = await this.prisma.lesson.findMany({
      where: { chapterId },
      select: { id: true },
    });
    assertSameSet(
      current.map((l) => l.id),
      ids,
    );
    await this.prisma.$transaction(
      ids.map((id, position) =>
        this.prisma.lesson.update({ where: { id }, data: { position } }),
      ),
    );
  }

  // ---------- Tài liệu đính kèm ----------

  async addAttachment(
    actor: JwtPayload,
    lessonId: string,
    file: Express.Multer.File | undefined,
  ) {
    if (!file) throw new BadRequestException('Chưa chọn file');
    try {
      await this.assertLesson(actor, lessonId);
      return await this.prisma.attachment.create({
        data: {
          lessonId,
          fileName: decodeFileName(file.originalname),
          storageKey: file.filename,
          mimeType: file.mimetype,
          size: file.size,
        },
        select: ATTACHMENT_SELECT,
      });
    } catch (e) {
      // File đã được multer ghi ra đĩa, phải dọn nếu không lưu được vào DB
      await this.storage.remove([file.filename]);
      throw e;
    }
  }

  async deleteAttachment(actor: JwtPayload, attachmentId: string) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        lesson: { include: { chapter: { include: { course: true } } } },
      },
    });
    if (!attachment) throw new NotFoundException();
    this.assertCanManage(actor, attachment.lesson.chapter.course);
    await this.prisma.attachment.delete({ where: { id: attachmentId } });
    await this.storage.remove([attachment.storageKey]);
  }

  // ---------- Hỗ trợ ----------

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title) || 'khoa-hoc';
    let slug = base;
    while (await this.prisma.course.findUnique({ where: { slug } })) {
      slug = `${base}-${randomBytes(3).toString('hex')}`;
    }
    return slug;
  }

  private async storageKeys(where: Prisma.LessonWhereInput) {
    const rows = await this.prisma.attachment.findMany({
      where: { lesson: where },
      select: { storageKey: true },
    });
    return rows.map((r) => r.storageKey);
  }

  private assertCanManage(
    actor: JwtPayload,
    course: { instructorId: string },
  ): void {
    if (!canManageCourse(course, actor)) {
      throw new ForbiddenException(
        'Bạn không phải giảng viên của khóa học này',
      );
    }
  }

  private async assertCourse(actor: JwtPayload, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Không tìm thấy khóa học');
    this.assertCanManage(actor, course);
    return course;
  }

  private async assertChapter(actor: JwtPayload, chapterId: string) {
    const chapter = await this.prisma.chapter.findUnique({
      where: { id: chapterId },
      include: { course: true },
    });
    if (!chapter) throw new NotFoundException('Không tìm thấy chương');
    this.assertCanManage(actor, chapter.course);
    return chapter;
  }

  private async assertLesson(actor: JwtPayload, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { chapter: { include: { course: true } } },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài học');
    this.assertCanManage(actor, lesson.chapter.course);
    return lesson;
  }
}

function assertVideoUrl(type: LessonType, videoUrl: string | null | undefined) {
  if (type === LessonType.VIDEO && !videoUrl) {
    throw new BadRequestException('Bài học video cần có videoUrl');
  }
}

function assertSameSet(current: string[], next: string[]) {
  const set = new Set(current);
  if (next.length !== current.length || !next.every((id) => set.has(id))) {
    throw new BadRequestException(
      'Danh sách sắp xếp phải chứa đúng các phần tử hiện có',
    );
  }
}

/** Multer đọc tên file dạng latin1; đổi lại UTF-8 để giữ tên tiếng Việt. */
function decodeFileName(name: string): string {
  return Buffer.from(name, 'latin1').toString('utf8');
}
