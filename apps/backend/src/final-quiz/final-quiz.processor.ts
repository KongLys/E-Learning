import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { FinalQuizService } from './final-quiz.service';
import { FINAL_QUIZ_QUEUE, GenerateFinalQuizJob } from './final-quiz.queue';

/** Chạy nền: sinh quiz cuối khóa bằng AI khi khóa được duyệt xuất bản. */
@Processor(FINAL_QUIZ_QUEUE, { concurrency: 1 })
export class FinalQuizProcessor extends WorkerHost {
  private readonly logger = new Logger(FinalQuizProcessor.name);

  constructor(private finalQuiz: FinalQuizService) {
    super();
  }

  async process(job: Job<GenerateFinalQuizJob>): Promise<void> {
    await this.finalQuiz.generateForCourse(job.data.courseId);
  }
}
