import { SetMetadata } from '@nestjs/common';
import { Role } from '../../generated/prisma/client';

export const ROLES_KEY = 'roles';

/** Chỉ cho phép các vai trò được liệt kê. Không gắn = mọi người đã đăng nhập. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
