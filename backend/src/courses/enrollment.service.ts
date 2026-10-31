import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { JwtPayload } from '../auth/auth.types';
import { Enrollment } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { canManageCourse } from './course-access';
import { ProgressDto } from './dto/progress.dto';

export interface EnrollmentSummary {
  enrolledAt: Date;
  lastLessonId: string | null;
  completedLessonIds: string[];
  totalLessons: number;
  progressPercent: number;
}

function percent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

@Injectable()
export class EnrollmentService {
  constructor(private readonly prisma: PrismaService) {}

  /** Ghi danh; gọi lại nhiều lần vẫn chỉ có một bản ghi. */
  async enroll(user: JwtPayload, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course || (!course.published && !canManageCourse(course, user))) {
      throw new NotFoundException('Không tìm thấy khóa học');
    }
    const enrollment = await this.prisma.enrollment.upsert({
      where: { userId_courseId: { userId: user.sub, courseId } },
      update: {},
      create: { userId: user.sub, courseId },
    });
    return this.summary(enrollment);
  }

  find(userId: string, courseId: string) {
    return this.prisma.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
  }

  /**
   * Chủ khóa học và admin luôn xem được. Người khác cần khóa đã công bố
   * và đã ghi danh. Trả về bản ghi ghi danh (null nếu là người quản lý).
   */
  async assertCanLearn(
    course: { id: string; published: boolean; instructorId: string },
    viewer: JwtPayload,
    notFoundMessage: string,
  ): Promise<Enrollment | null> {
    const enrollment = await this.find(viewer.sub, course.id);
    if (enrollment || canManageCourse(course, viewer)) return enrollment;
    if (!course.published) throw new NotFoundException(notFoundMessage);
    throw new ForbiddenException('Bạn cần ghi danh khóa học để xem bài này');
  }

  async summary(enrollment: Enrollment): Promise<EnrollmentSummary> {
    const [totalLessons, completed] = await Promise.all([
      this.prisma.lesson.count({
        where: { chapter: { courseId: enrollment.courseId } },
      }),
      this.prisma.lessonProgress.findMany({
        where: { enrollmentId: enrollment.id, completedAt: { not: null } },
        select: { lessonId: true },
      }),
    ]);
    return {
      enrolledAt: enrollment.enrolledAt,
      lastLessonId: enrollment.lastLessonId,
      completedLessonIds: completed.map((p) => p.lessonId),
      totalLessons,
      progressPercent: percent(completed.length, totalLessons),
    };
  }

  /**
   * Ghi vị trí xem và/hoặc trạng thái hoàn thành, đồng thời đánh dấu
   * đây là bài học gần nhất. Gọi với body rỗng khi vừa mở bài.
   */
  async updateProgress(viewer: JwtPayload, lessonId: string, dto: ProgressDto) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { chapter: { select: { courseId: true } } },
    });
    if (!lesson) throw new NotFoundException('Không tìm thấy bài học');
    const enrollment = await this.find(viewer.sub, lesson.chapter.courseId);
    if (!enrollment) {
      throw new ForbiddenException('Bạn cần ghi danh khóa học để lưu tiến độ');
    }

    const key = { enrollmentId: enrollment.id, lessonId };
    const existing = await this.prisma.lessonProgress.findUnique({
      where: { enrollmentId_lessonId: key },
    });
    // Đã hoàn thành thì giữ mốc thời gian đầu tiên; completed=false thì bỏ đánh dấu
    const completedAt =
      dto.completed === undefined
        ? existing?.completedAt
        : dto.completed
          ? (existing?.completedAt ?? new Date())
          : null;

    const [progress] = await this.prisma.$transaction([
      this.prisma.lessonProgress.upsert({
        where: { enrollmentId_lessonId: key },
        create: { ...key, positionSec: dto.positionSec ?? 0, completedAt },
        update: { positionSec: dto.positionSec, completedAt },
      }),
      this.prisma.enrollment.update({
        where: { id: enrollment.id },
        data: { lastLessonId: lessonId },
      }),
    ]);
    return {
      positionSec: progress.positionSec,
      completed: progress.completedAt !== null,
    };
  }

  /** Các khóa đã ghi danh, mới học gần đây xếp trước. */
  async myCourses(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      include: {
        course: {
          select: {
            id: true,
            slug: true,
            title: true,
            thumbnailUrl: true,
            instructor: { select: { id: true, fullName: true } },
            chapters: { select: { _count: { select: { lessons: true } } } },
          },
        },
        _count: {
          select: { progress: { where: { completedAt: { not: null } } } },
        },
      },
    });
    return enrollments.map(({ course, _count, ...e }) => {
      const { chapters, ...info } = course;
      const totalLessons = chapters.reduce((s, c) => s + c._count.lessons, 0);
      return {
        ...info,
        enrolledAt: e.enrolledAt,
        lastLessonId: e.lastLessonId,
        completedLessons: _count.progress,
        totalLessons,
        progressPercent: percent(_count.progress, totalLessons),
      };
    });
  }
}
