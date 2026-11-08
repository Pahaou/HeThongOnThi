import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ExamGradingService, GRADING_QUEUE } from './exam-grading.service';
import { ExamManageService } from './exam-manage.service';
import { ExamTakeService } from './exam-take.service';
import { ExamsController, ManageExamsController } from './exams.controller';
import { GradingProcessor } from './grading.processor';

/** "redis://:pass@host:6379/0" -> tùy chọn kết nối cho BullMQ */
function redisConnection(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: u.pathname.length > 1 ? Number(u.pathname.slice(1)) : undefined,
  };
}

@Module({
  imports: [
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: redisConnection(
          config.get<string>('REDIS_URL') ?? 'redis://localhost:6379',
        ),
        prefix: config.get<string>('QUEUE_PREFIX') ?? 'hton',
      }),
    }),
    BullModule.registerQueue({ name: GRADING_QUEUE }),
  ],
  controllers: [ExamsController, ManageExamsController],
  providers: [
    ExamManageService,
    ExamTakeService,
    ExamGradingService,
    GradingProcessor,
  ],
})
export class ExamsModule {}
