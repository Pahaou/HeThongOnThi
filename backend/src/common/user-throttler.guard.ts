import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { JwtPayload } from '../auth/auth.types';

/**
 * Giới hạn theo người dùng khi đã đăng nhập, theo IP khi chưa. Cả phòng thi
 * thường dùng chung một IP (NAT), giới hạn theo IP sẽ chặn oan thí sinh.
 * Chạy sau JwtAuthGuard nên req.user đã có.
 */
@Injectable()
export class UserThrottlerGuard extends ThrottlerGuard {
  protected getTracker(req: Record<string, unknown>): Promise<string> {
    const user = req.user as JwtPayload | undefined;
    return Promise.resolve(user ? `user:${user.sub}` : `ip:${String(req.ip)}`);
  }
}
