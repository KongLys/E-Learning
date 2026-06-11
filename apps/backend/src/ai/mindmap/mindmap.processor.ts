import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { MindmapService } from './mindmap.service';
import { MINDMAP_QUEUE, GenerateMindmapJob } from './mindmap.queue';

@Processor(MINDMAP_QUEUE, { concurrency: 2 })
export class MindmapProcessor extends WorkerHost {
  private readonly logger = new Logger(MindmapProcessor.name);

  constructor(private mindmap: MindmapService) {
    super();
  }

  async process(job: Job<GenerateMindmapJob>): Promise<void> {
    const { courseId } = job.data;
    this.logger.log(
      `Generating mindmap for course ${courseId} (attempt ${job.attemptsMade + 1})`,
    );
    try {
      await this.mindmap.generate(courseId, (p) => job.updateProgress(p));
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(
        `Mindmap generation failed for course ${courseId}: ${msg}`,
      );
      await this.mindmap.markFailed(courseId, msg);
      throw err;
    }
  }
}
