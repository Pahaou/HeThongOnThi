import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { JwtPayload } from '../auth/auth.types';
import { canManageCourse } from '../courses/course-access';
import { PrismaService } from '../prisma/prisma.service';

/** Học viên đã ghi danh, hoặc người quản lý khóa học, mới được ôn tập và xem thống kê. */
export async function assertLearner(
  prisma: PrismaService,
  user: JwtPayload,
  courseId: string,
): Promise<void> {
  const course = await prisma.course.findUnique({ where: { id: courseId } });
  if (!course) throw new NotFoundException('Không tìm thấy khóa học');
  if (canManageCourse(course, user)) return;
  const enrollment = await prisma.enrollment.findUnique({
    where: { userId_courseId: { userId: user.sub, courseId } },
  });
  if (!enrollment) {
    throw new ForbiddenException('Bạn cần ghi danh khóa học để ôn tập');
  }
}
