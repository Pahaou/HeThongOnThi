import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { User } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { JwtPayload } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

const BCRYPT_ROUNDS = 10;
// Hash giả để so sánh khi email không tồn tại, giúp thời gian phản hồi
// giống nhau và không lộ email nào đã đăng ký.
const DUMMY_HASH = bcrypt.hashSync('dummy-password', BCRYPT_ROUNDS);

export type PublicUser = Omit<User, 'passwordHash'>;

export interface AuthResult {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: PublicUser;
}

export function toPublicUser(user: User): PublicUser {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { passwordHash, ...rest } = user;
  return rest;
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly refreshTtlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    const days = Number(config.get('JWT_REFRESH_TTL_DAYS') ?? 7);
    this.refreshTtlMs = days * 24 * 60 * 60 * 1000;
  }

  async register(dto: RegisterDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    const exists = await this.prisma.user.findUnique({ where: { email } });
    if (exists) throw new ConflictException('Email đã được sử dụng');

    const user = await this.prisma.user.create({
      data: {
        email,
        fullName: dto.fullName.trim(),
        passwordHash: await bcrypt.hash(dto.password, BCRYPT_ROUNDS),
      },
    });
    return this.issueTokens(user, randomUUID());
  }

  async login(dto: LoginDto): Promise<AuthResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    const ok = await bcrypt.compare(
      dto.password,
      user?.passwordHash ?? DUMMY_HASH,
    );
    if (!user || !ok) {
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng');
    }
    return this.issueTokens(user, randomUUID());
  }

  /**
   * Xoay vòng refresh token: token cũ bị thu hồi, token mới cùng familyId.
   * Nếu một token đã thu hồi bị dùng lại (có thể đã bị đánh cắp),
   * thu hồi toàn bộ chuỗi để buộc đăng nhập lại.
   */
  async refresh(refreshToken: string | undefined): Promise<AuthResult> {
    if (!refreshToken) throw new UnauthorizedException();

    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
      include: { user: true },
    });
    if (!stored) throw new UnauthorizedException();

    if (stored.revokedAt) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }
    if (stored.expiresAt <= new Date()) throw new UnauthorizedException();

    // updateMany có điều kiện revokedAt = null để hai request refresh
    // đồng thời không cùng dùng được một token.
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) {
      await this.revokeFamily(stored.familyId);
      throw new UnauthorizedException('Phiên đăng nhập không hợp lệ');
    }

    return this.issueTokens(stored.user, stored.familyId);
  }

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return;
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashToken(refreshToken) },
    });
    if (stored) await this.revokeFamily(stored.familyId);
  }

  async me(userId: string): Promise<PublicUser> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException();
    return toPublicUser(user);
  }

  private async revokeFamily(familyId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { familyId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  private async issueTokens(user: User, familyId: string): Promise<AuthResult> {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.refreshTtlMs);

    await this.prisma.refreshToken.create({
      data: {
        userId: user.id,
        familyId,
        tokenHash: hashToken(refreshToken),
        expiresAt: refreshExpiresAt,
      },
    });

    return {
      accessToken: await this.jwt.signAsync(payload),
      refreshToken,
      refreshExpiresAt,
      user: toPublicUser(user),
    };
  }
}
