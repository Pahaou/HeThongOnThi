import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Role } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { toPublicUser } from '../auth/auth.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    const users = await this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return users.map(toPublicUser);
  }

  async updateRole(actorId: string, userId: string, role: Role) {
    // Không cho admin tự hạ quyền mình, tránh hệ thống mất admin cuối cùng
    if (actorId === userId) {
      throw new BadRequestException('Không thể đổi vai trò của chính mình');
    }
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException();
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role },
    });
    return toPublicUser(updated);
  }
}
