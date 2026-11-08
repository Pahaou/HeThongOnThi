import { Module } from '@nestjs/common';
import { ExamGradingService } from './exam-grading.service';
import { ExamManageService } from './exam-manage.service';
import { ExamTakeService } from './exam-take.service';
import { ExamsController, ManageExamsController } from './exams.controller';

@Module({
  controllers: [ExamsController, ManageExamsController],
  providers: [ExamManageService, ExamTakeService, ExamGradingService],
})
export class ExamsModule {}
