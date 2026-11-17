import { INestApplication, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/** Cấu hình dùng chung cho main.ts và e2e test. */
export function setupApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  // Sau reverse proxy (Caddy) phải tin X-Forwarded-For, nếu không mọi người chung IP
  // của proxy và chung giới hạn đăng nhập. Chỉ bật khi có proxy, kẻo client tự giả IP.
  const proxyHops = Number(process.env.TRUST_PROXY);
  if (proxyHops > 0) {
    (app as NestExpressApplication).set('trust proxy', proxyHops);
  }
  // Header bảo mật (chống clickjacking, sniff MIME...); API chỉ trả JSON nên CSP mặc định là đủ
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
}
