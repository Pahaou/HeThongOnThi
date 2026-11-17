import { INestApplication, ValidationPipe } from '@nestjs/common';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';

/** Cấu hình dùng chung cho main.ts và e2e test. */
export function setupApp(app: INestApplication): void {
  app.setGlobalPrefix('api');
  // Header bảo mật (chống clickjacking, sniff MIME...); API chỉ trả JSON nên CSP mặc định là đủ
  app.use(helmet());
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
}
