import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { RaptorService } from './raptor.service';
import { RAPTOR_BUILD_QUEUE, BuildRaptorJob } from './raptor.queue';

@Processor(RAPTOR_BUILD_QUEUE, { concurrency: 1 })
export class RaptorProcessor extends WorkerHost {
  private readonly logger = new Logger(RaptorProcessor.name);

  constructor(private raptor: RaptorService) {
    super();
  }

  async process(job: Job<BuildRaptorJob>): Promise<void> {
    const { courseId } = job.data;
    this.logger.log(
      `Building RAPTOR tree for course ${courseId} (attempt ${job.attemptsMade + 1})`,
    );
    try {
      await this.raptor.generate(courseId, (p) => job.updateProgress(p));
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`RAPTOR build failed for course ${courseId}: ${msg}`);
      await this.raptor.markFailed(courseId, msg);
      throw err;
    }
  }
}
