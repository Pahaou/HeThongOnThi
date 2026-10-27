import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { CookieOptions, Request, Response } from 'express';
import { AuthResult, AuthService } from './auth.service';
import type { JwtPayload } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

export const REFRESH_COOKIE = 'refresh_token';
// Giới hạn chặt cho các route dễ bị dò mật khẩu
const AUTH_THROTTLE = { default: { limit: 10, ttl: 60_000 } };

@Controller('auth')
export class AuthController {
  private readonly cookieBase: CookieOptions;

  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.cookieBase = {
      httpOnly: true,
      sameSite: 'strict',
      secure: config.get('NODE_ENV') === 'production',
      path: '/api/auth',
    };
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('register')
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(await this.auth.register(dto), res);
  }

  @Public()
  @Throttle(AUTH_THROTTLE)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(await this.auth.login(dto), res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      return this.respond(await this.auth.refresh(this.cookie(req)), res);
    } catch (e) {
      res.clearCookie(REFRESH_COOKIE, this.cookieBase);
      throw e;
    }
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(this.cookie(req));
    res.clearCookie(REFRESH_COOKIE, this.cookieBase);
  }

  @Get('me')
  me(@CurrentUser() user: JwtPayload) {
    return this.auth.me(user.sub);
  }

  private cookie(req: Request): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[
      REFRESH_COOKIE
    ];
  }

  private respond(result: AuthResult, res: Response) {
    res.cookie(REFRESH_COOKIE, result.refreshToken, {
      ...this.cookieBase,
      expires: result.refreshExpiresAt,
    });
    return { accessToken: result.accessToken, user: result.user };
  }
}
