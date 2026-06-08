import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { MarkdownChunkerService } from '../chunking/markdown-chunker.service';
import { GeminiService } from '../gemini.service';
import { VectorStoreService } from '../vector/vector-store.service';
import { stripHtml } from '../../common/sanitize-html.util';

export const LESSON_INDEX_QUEUE = 'lesson-indexing';

export interface IndexLessonJob {
  lessonId: string;
}

/**
 * Vector hóa nội dung text mà giảng viên soạn trực tiếp trong bài học
 * (mô tả + nội dung đọc rich text) vào chung kho course_chunks để AI tutor
 * truy xuất cùng với các file tài liệu của khóa học.
 */
@Processor(LESSON_INDEX_QUEUE, { concurrency: 2 })
export class LessonIndexProcessor extends WorkerHost {
  private readonly logger = new Logger(LessonIndexProcessor.name);

  constructor(
    private prisma: PrismaService,
    private chunker: MarkdownChunkerService,
    private gemini: GeminiService,
    private vector: VectorStoreService,
  ) {
    super();
  }

  async process(job: Job<IndexLessonJob>): Promise<void> {
    const { lessonId } = job.data;
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { section: true, documentAsset: true },
    });
    if (!lesson) {
      this.logger.warn(`Lesson ${lessonId} not found — skip indexing`);
      return;
    }

    // Dọn chunk cũ của bài này trước (idempotent — lưu lại không nhân bản).
    await this.vector.deleteByLesson(lessonId);

    const parts = [
      lesson.description?.trim() ?? '',
      stripHtml(lesson.documentAsset?.contentHtml ?? ''),
    ].filter((p) => p.length > 0);
    const text = parts.join('\n\n').trim();

    if (text.length === 0) {
      this.logger.log(`Lesson ${lessonId} has no text content — cleared chunks only`);
      return;
    }

    const chunks = this.chunker.chunk(text);
    if (chunks.length === 0) return;

    const embeddings = await this.gemini.embedBatch(chunks.map((c) => c.content));
    await this.vector.upsertChunks(
      chunks.map((c, i) => ({
        courseId: lesson.section.courseId,
        materialId: null,
        lessonId,
        sourceType: 'lesson_document' as const,
        sectionTitle: lesson.section.title,
        pageNumber: null,
        chunkIndex: c.chunkIndex,
        content: c.content,
        tokenCount: c.tokenCount,
        embedding: embeddings[i],
        metadata: { source: lesson.title },
      })),
    );
    this.logger.log(`Indexed lesson ${lessonId}: ${chunks.length} chunks`);
  }
}
