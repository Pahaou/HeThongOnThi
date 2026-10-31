import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { JwtPayload } from '../auth/auth.types';
import { canManageCourse } from '../courses/course-access';
import { slugify } from '../courses/slug';
import { Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePathDto,
  SetPathCoursesDto,
  UpdatePathDto,
} from './dto/path.dto';

const COURSE_CARD_SELECT = {
  id: true,
  slug: true,
  title: true,
  description: true,
  thumbnailUrl: true,
  published: true,
  instructorId: true,
  instructor: { select: { id: true, fullName: true } },
  chapters: { select: { _count: { select: { lessons: true } } } },
} as const;

function canManagePath(path: { createdById: string }, user: JwtPayload) {
  return user.role === Role.ADMIN || user.sub === path.createdById;
}

function percent(done: number, total: number): number {
  return total === 0 ? 0 : Math.round((done / total) * 100);
}

@Injectable()
export class PathsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------- Công khai ----------

  async list() {
    const paths = await this.prisma.learningPath.findMany({
      where: { published: true },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        courses: {
          where: { course: { published: true } },
          select: { courseId: true },
        },
      },
    });
    return paths.map(({ courses, ...path }) => ({
      ...path,
      courseCount: courses.length,
    }));
  }

  /**
   * Lộ trình kèm các khóa theo thứ tự. Khách và học viên chỉ thấy khóa đã
   * công bố; người đăng nhập thấy thêm tiến độ của mình trên từng khóa.
   */
  async detail(slug: string, viewer: JwtPayload | undefined) {
    const path = await this.prisma.learningPath.findUnique({
      where: { slug },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        courses: {
          orderBy: { position: 'asc' },
          include: { course: { select: COURSE_CARD_SELECT } },
        },
      },
    });
    const canManage = !!path && !!viewer && canManagePath(path, viewer);
    if (!path || (!path.published && !canManage)) {
      throw new NotFoundException('Không tìm thấy lộ trình');
    }

    const visible = path.courses
      .map((pc) => pc.course)
      .filter((c) => c.published || canManageCourse(c, viewer));
    const progress = viewer
      ? await this.progressByCourse(
          viewer.sub,
          visible.map((c) => c.id),
        )
      : new Map<string, { enrolled: boolean; completed: number }>();

    let totalLessons = 0;
    let completedLessons = 0;
    const courses = visible.map(({ chapters, instructorId: _, ...course }) => {
      const lessons = chapters.reduce((s, c) => s + c._count.lessons, 0);
      const p = progress.get(course.id);
      totalLessons += lessons;
      completedLessons += p?.completed ?? 0;
      return {
        ...course,
        totalLessons: lessons,
        enrolled: p?.enrolled ?? false,
        completedLessons: p?.completed ?? 0,
        progressPercent: percent(p?.completed ?? 0, lessons),
      };
    });

    const { courses: _courses, ...info } = path;
    return {
      ...info,
      canManage,
      courses,
      totalLessons,
      completedLessons,
      progressPercent: viewer ? percent(completedLessons, totalLessons) : null,
    };
  }

  private async progressByCourse(userId: string, courseIds: string[]) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId, courseId: { in: courseIds } },
      select: {
        courseId: true,
        _count: {
          select: { progress: { where: { completedAt: { not: null } } } },
        },
      },
    });
    return new Map(
      enrollments.map((e) => [
        e.courseId,
        { enrolled: true, completed: e._count.progress },
      ]),
    );
  }

  // ---------- Quản lý ----------

  listManaged(actor: JwtPayload) {
    return this.prisma.learningPath.findMany({
      where: actor.role === Role.ADMIN ? {} : { createdById: actor.sub },
      orderBy: { updatedAt: 'desc' },
      include: {
        createdBy: { select: { id: true, fullName: true } },
        _count: { select: { courses: true } },
      },
    });
  }

  async create(actor: JwtPayload, dto: CreatePathDto) {
    return this.prisma.learningPath.create({
      data: {
        createdById: actor.sub,
        title: dto.title.trim(),
        description: dto.description ?? '',
        slug: await this.uniqueSlug(dto.title),
      },
    });
  }

  async getManaged(actor: JwtPayload, pathId: string) {
    await this.assertPath(actor, pathId);
    return this.prisma.learningPath.findUniqueOrThrow({
      where: { id: pathId },
      include: {
        courses: {
          orderBy: { position: 'asc' },
          include: {
            course: {
              select: {
                id: true,
                slug: true,
                title: true,
                published: true,
                instructor: { select: { id: true, fullName: true } },
              },
            },
          },
        },
      },
    });
  }

  async update(actor: JwtPayload, pathId: string, dto: UpdatePathDto) {
    await this.assertPath(actor, pathId);
    if (dto.published) {
      const count = await this.prisma.learningPathCourse.count({
        where: { pathId, course: { published: true } },
      });
      if (count === 0) {
        throw new BadRequestException(
          'Lộ trình cần ít nhất một khóa học đã công bố trước khi công bố',
        );
      }
    }
    return this.prisma.learningPath.update({
      where: { id: pathId },
      data: {
        title: dto.title?.trim(),
        description: dto.description,
        published: dto.published,
      },
    });
  }

  async remove(actor: JwtPayload, pathId: string) {
    await this.assertPath(actor, pathId);
    await this.prisma.learningPath.delete({ where: { id: pathId } });
  }

  /**
   * Thay toàn bộ danh sách khóa theo thứ tự mới. Chỉ được thêm khóa đã
   * công bố, hoặc khóa nháp của chính mình (admin thì mọi khóa).
   */
  async setCourses(actor: JwtPayload, pathId: string, dto: SetPathCoursesDto) {
    await this.assertPath(actor, pathId);
    const courses = await this.prisma.course.findMany({
      where: { id: { in: dto.courseIds } },
      select: { id: true, published: true, instructorId: true },
    });
    const allowed = new Set(
      courses
        .filter((c) => c.published || canManageCourse(c, actor))
        .map((c) => c.id),
    );
    const invalid = dto.courseIds.filter((id) => !allowed.has(id));
    if (invalid.length > 0) {
      throw new BadRequestException(
        `Không thêm được ${invalid.length} khóa học (không tồn tại hoặc chưa công bố)`,
      );
    }

    await this.prisma.$transaction([
      this.prisma.learningPathCourse.deleteMany({ where: { pathId } }),
      this.prisma.learningPathCourse.createMany({
        data: dto.courseIds.map((courseId, position) => ({
          pathId,
          courseId,
          position,
        })),
      }),
      // Cập nhật updatedAt để lộ trình vừa sửa lên đầu danh sách quản lý
      this.prisma.learningPath.update({
        where: { id: pathId },
        data: { updatedAt: new Date() },
      }),
    ]);
    return this.getManaged(actor, pathId);
  }

  private async uniqueSlug(title: string): Promise<string> {
    const base = slugify(title) || 'lo-trinh';
    let slug = base;
    while (await this.prisma.learningPath.findUnique({ where: { slug } })) {
      slug = `${base}-${randomBytes(3).toString('hex')}`;
    }
    return slug;
  }

  private async assertPath(actor: JwtPayload, pathId: string) {
    const path = await this.prisma.learningPath.findUnique({
      where: { id: pathId },
    });
    if (!path) throw new NotFoundException('Không tìm thấy lộ trình');
    if (!canManagePath(path, actor)) {
      throw new ForbiddenException('Bạn không phải người tạo lộ trình này');
    }
    return path;
  }
}
