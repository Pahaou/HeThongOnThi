import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  setupApp(app);
  app.enableCors({
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  });
  // Hàng đợi kết nối TCP lớn hơn mặc định (511) để đợt hàng trăm thí sinh vào thi
  // cùng lúc không bị từ chối kết nối
  await app.init();
  const port = Number(process.env.PORT ?? 3000);
  await new Promise<void>((resolve) =>
    (app.getHttpServer() as import('node:http').Server).listen(
      { port, backlog: 4096 },
      resolve,
    ),
  );
}
void bootstrap();
