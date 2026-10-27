import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtPayload } from '../auth/auth.types';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canManageCourse } from './course-access';
import { ListCoursesQuery } from './dto/course.dto';

@Injectable()
export class CatalogService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListCoursesQuery) {
    const where: Prisma.CourseWhereInput = { published: true };
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ];
    }

    const [total, courses] = await Promise.all([
      this.prisma.course.count({ where }),
      this.prisma.course.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
        include: {
          instructor: { select: { id: true, fullName: true } },
          chapters: {
            select: { lessons: { select: { durationSec: true } } },
          },
        },
      }),
    ]);

    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: courses.map(({ chapters, ...course }) => {
        const lessons = chapters.flatMap((c) => c.lessons);
        return {
          ...course,
          lessonCount: lessons.length,
          totalDurationSec: lessons.reduce((s, l) => s + l.durationSec, 0),
        };
      }),
    };
  }

  /** Thông tin khóa học và mục lục; không kèm nội dung bài học. */
  async detail(slug: string, viewer: JwtPayload | undefined) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        instructor: { select: { id: true, fullName: true } },
        chapters: {
          orderBy: { position: 'asc' },
          select: {
            id: true,
            title: true,
            position: true,
            lessons: {
              orderBy: { position: 'asc' },
              select: {
                id: true,
                title: true,
                type: true,
                durationSec: true,
                position: true,
              },
            },
          },
        },
      },
    });
    if (!course || (!course.published && !canManageCourse(course, viewer))) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }
    return course;
  }

  async lesson(lessonId: string, viewer: JwtPayload) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        attachments: {
          select: { id: true, fileName: true, mimeType: true, size: true },
          orderBy: { createdAt: 'asc' },
        },
        chapter: {
          select: {
            id: true,
            title: true,
            course: {
              select: {
                id: true,
                slug: true,
                title: true,
                published: true,
                instructorId: true,
              },
            },
          },
        },
      },
    });
    if (!lesson || !this.canView(lesson.chapter.course, viewer)) {
      throw new NotFoundException('Không tìm thấy bài học');
    }
    return lesson;
  }

  async attachment(attachmentId: string, viewer: JwtPayload) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        lesson: { select: { chapter: { select: { course: true } } } },
      },
    });
    if (
      !attachment ||
      !this.canView(attachment.lesson.chapter.course, viewer)
    ) {
      throw new NotFoundException('Không tìm thấy tài liệu');
    }
    return attachment;
  }

  private canView(
    course: { published: boolean; instructorId: string },
    viewer: JwtPayload,
  ): boolean {
    return course.published || canManageCourse(course, viewer);
  }
}
