import { Injectable, NotFoundException } from '@nestjs/common';
import { JwtPayload } from '../auth/auth.types';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canManageCourse } from './course-access';
import { ListCoursesQuery } from './dto/course.dto';
import { EnrollmentService } from './enrollment.service';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly enrollments: EnrollmentService,
  ) {}

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
    const canManage = !!course && canManageCourse(course, viewer);
    if (!course || (!course.published && !canManage)) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }
    const enrollment = viewer
      ? await this.enrollments.find(viewer.sub, course.id)
      : null;
    return {
      ...course,
      canManage,
      enrollment: enrollment
        ? await this.enrollments.summary(enrollment)
        : null,
    };
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
    if (!lesson) throw new NotFoundException('Không tìm thấy bài học');
    const enrollment = await this.enrollments.assertCanLearn(
      lesson.chapter.course,
      viewer,
      'Không tìm thấy bài học',
    );
    const progress = enrollment
      ? await this.prisma.lessonProgress.findUnique({
          where: {
            enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId },
          },
        })
      : null;
    return {
      ...lesson,
      progress: progress && {
        positionSec: progress.positionSec,
        completed: progress.completedAt !== null,
      },
    };
  }

  async attachment(attachmentId: string, viewer: JwtPayload) {
    const attachment = await this.prisma.attachment.findUnique({
      where: { id: attachmentId },
      include: {
        lesson: { select: { chapter: { select: { course: true } } } },
      },
    });
    if (!attachment) throw new NotFoundException('Không tìm thấy tài liệu');
    await this.enrollments.assertCanLearn(
      attachment.lesson.chapter.course,
      viewer,
      'Không tìm thấy tài liệu',
    );
    return attachment;
  }
}
