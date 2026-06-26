import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { GraphExtractionService } from './graph-extraction.service';
import {
  GRAPH_EXTRACTION_QUEUE,
  ExtractGraphJob,
} from './graph-extraction.queue';

// concurrency=1: tránh tranh chấp upsert entity (dedup theo course) khi nhiều bài
// cùng khóa được index song song. Đồ thị là phụ trợ — fail không chặn vector RAG.
@Processor(GRAPH_EXTRACTION_QUEUE, { concurrency: 1 })
export class GraphExtractionProcessor extends WorkerHost {
  private readonly logger = new Logger(GraphExtractionProcessor.name);

  constructor(private extraction: GraphExtractionService) {
    super();
  }

  async process(job: Job<ExtractGraphJob>): Promise<void> {
    const { lessonId } = job.data;
    this.logger.log(
      `Extracting knowledge graph for lesson ${lessonId} (attempt ${job.attemptsMade + 1})`,
    );
    await this.extraction.extractLesson(lessonId);
  }
}
