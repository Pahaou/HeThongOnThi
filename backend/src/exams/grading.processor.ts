import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { ExamGradingService, GRADING_QUEUE } from './exam-grading.service';

/** Worker chạy cùng tiến trình API; tách ra tiến trình riêng khi cần mở rộng. */
@Processor(GRADING_QUEUE, { concurrency: 8 })
export class GradingProcessor extends WorkerHost {
  constructor(private readonly grading: ExamGradingService) {
    super();
  }

  async process(job: Job<{ attemptId?: string }>): Promise<unknown> {
    if (job.name === 'sweep') return this.grading.sweep();
    if (job.name === 'grade' && job.data.attemptId) {
      return this.grading.grade(job.data.attemptId);
    }
    return undefined;
  }
}
