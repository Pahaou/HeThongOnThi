import { JwtPayload } from '../auth/auth.types';
import { Role } from '../generated/prisma/client';

/** Admin hoặc giảng viên sở hữu khóa học thì được quản lý / xem bản nháp. */
export function canManageCourse(
  course: { instructorId: string },
  user: JwtPayload | undefined,
): boolean {
  return (
    !!user && (user.role === Role.ADMIN || user.sub === course.instructorId)
  );
}
