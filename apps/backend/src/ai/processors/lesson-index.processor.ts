import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { LlamaParseService } from '../chunking/llama-parse.service';
import { MarkdownChunkerService } from '../chunking/markdown-chunker.service';
import { htmlToMarkdown } from '../chunking/html-to-markdown.util';
import { buildToc } from '../chunking/toc.util';
import { GeminiService } from '../gemini.service';
import {
  VectorStoreService,
  ChunkSourceType,
} from '../vector/vector-store.service';
import { ModerationService } from '../../moderation/moderation.service';

export const LESSON_INDEX_QUEUE = 'lesson-indexing';

export interface IndexLessonJob {
  lessonId: string;
}

interface PendingChunk {
  content: string;
  sectionTitle: string;
  tokenCount: number;
  sourceType: ChunkSourceType;
}

const DOCX_MIME =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/**
 * Vector hóa toàn bộ tri thức của một bài học vào course_chunks:
 *  - nội dung soạn tay (description + contentHtml → markdown giữ heading) → 'lesson_content'
 *  - file tài liệu PDF/DOCX đính kèm (LlamaParse → markdown, cache MinIO)   → 'lesson_file'
 *  - script video giảng viên đăng tải (chương + transcript đã có sẵn)       → 'lesson_video'
 *
 * Trước khi chunk, nội dung được phân vùng dạng TOC: mỗi chunk mang đường dẫn
 * "Tên phần > Tên bài > Đề mục..." (cột sectionTitle) + sectionId/lessonId để
 * truy vấn theo từng phần và dựng mind map toàn khóa; mục lục gộp lưu vào
 * DocumentAsset.tocJson. Nội dung phải qua kiểm duyệt AI trước khi index.
 *
 * Nguồn video chỉ lấy từ VideoAsset do giảng viên upload (có videoUrl +
 * transcriptStatus='ready') — KHÔNG dùng video AI tự sinh (LessonVideoAsset).
 */
@Processor(LESSON_INDEX_QUEUE, { concurrency: 2 })
export class LessonIndexProcessor extends WorkerHost {
  private readonly logger = new Logger(LessonIndexProcessor.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private llamaParse: LlamaParseService,
    private chunker: MarkdownChunkerService,
    private gemini: GeminiService,
    private vector: VectorStoreService,
    private moderation: ModerationService,
    private events: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<IndexLessonJob>): Promise<void> {
    const { lessonId } = job.data;
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        section: {
          include: { course: { select: { id: true, instructorId: true } } },
        },
        documentAsset: true,
        videoAsset: true,
      },
    });
    if (!lesson) {
      this.logger.warn(`Lesson ${lessonId} not found — skip indexing`);
      return;
    }
    const courseId = lesson.section.courseId;
    const asset = lesson.documentAsset;

    // Dọn chunk cũ trước (idempotent — nội dung bị từ chối cũng được gỡ khỏi RAG ngay).
    await this.vector.deleteByLesson(lessonId);

    try {
      // ── Nguồn 1: nội dung bài — giữ heading để phân vùng TOC
      const contentMd = [
        lesson.description?.trim() ?? '',
        htmlToMarkdown(asset?.contentHtml),
      ]
        .filter((p) => p.length > 0)
        .join('\n\n')
        .trim();

      // ── Nguồn 2: file tài liệu của bài → markdown (LlamaParse, cache theo markdownUrl)
      let fileMd = '';
      if (asset?.fileUrl) {
        fileMd = await this.loadOrParseFile(
          asset.id,
          asset.fileUrl,
          asset.fileType,
          asset.markdownUrl,
          lesson.title,
          lessonId,
        );
      }

      // ── Phân vùng TOC trước khi chunk: lưu mục lục gộp của bài
      if (asset) {
        const toc = buildToc([contentMd, fileMd].filter(Boolean).join('\n\n'));
        await this.prisma.documentAsset.update({
          where: { id: asset.id },
          data: { tocJson: toc as unknown as Prisma.InputJsonValue },
        });
      }

      // ── Chunk từng nguồn, prefix đường dẫn "Phần > Bài > [đề mục trong tài liệu]"
      const pathPrefix = [lesson.section.title, lesson.title];
      const rows: PendingChunk[] = [];
      const pushChunks = (markdown: string, sourceType: ChunkSourceType) => {
        for (const c of this.chunker.chunk(markdown)) {
          rows.push({
            content: c.content,
            sectionTitle: [
              ...pathPrefix,
              ...(c.sectionTitle ? [c.sectionTitle] : []),
            ].join(' > '),
            tokenCount: c.tokenCount,
            sourceType,
          });
        }
      };
      if (contentMd) pushChunks(contentMd, 'lesson_content');
      if (fileMd) pushChunks(fileMd, 'lesson_file');

      // ── Nguồn 3: script video giảng viên đăng tải (chương + transcript)
      const videoMd = this.buildVideoMarkdown(lesson.videoAsset, lesson.title);
      if (videoMd) pushChunks(videoMd, 'lesson_video');

      if (rows.length === 0) {
        if (asset) {
          await this.prisma.documentAsset.update({
            where: { id: asset.id },
            data: { chunkCount: 0 },
          });
        }
        this.logger.log(
          `Lesson ${lessonId} has no indexable content — cleared chunks only`,
        );
        return;
      }

      // ── Kiểm duyệt AI trước khi tốn chi phí embed/index
      if (lesson.moderationStatus === 'pending') {
        const sampled = this.moderation
          .sampleChunks(rows)
          .map((c) => c.content);
        this.moderation.debugLog('lesson — moderating', {
          lessonId,
          sampled: sampled.length,
          ofTotal: rows.length,
        });
        const outcome = await this.moderation.evaluate(
          sampled,
          `bài học "${lesson.title}" (id=${lessonId}, ${sampled.length}/${rows.length} đoạn)`,
        );
        if (outcome.status !== 'approved') {
          await this.prisma.lesson.update({
            where: { id: lessonId },
            data: {
              moderationStatus: outcome.status, // 'rejected' | 'pending'
              moderationLabel: outcome.label ?? null,
              moderationScore: outcome.score ?? null,
              moderationReason: outcome.reason ?? null,
              moderatedAt: new Date(),
            },
          });
          if (asset) {
            await this.prisma.documentAsset.update({
              where: { id: asset.id },
              data: { chunkCount: 0 },
            });
          }
          this.events.emit('moderation.rejected', {
            ownerId: lesson.section.course.instructorId,
            contentType: 'lesson',
            contentId: lessonId,
            title: lesson.title,
            courseId,
            status: outcome.status,
            reason: outcome.reason,
          });
          this.logger.warn(
            `Lesson ${lessonId} not approved (${outcome.status}/${outcome.label}) — skipping index`,
          );
          return;
        }
        await this.prisma.lesson.update({
          where: { id: lessonId },
          data: {
            moderationStatus: 'approved',
            moderationLabel: outcome.label ?? 'it',
            moderationScore: outcome.score ?? null,
            moderationReason: null,
            moderatedAt: new Date(),
          },
        });
        this.moderation.debugLog('lesson — approved, indexing', {
          lessonId,
          label: outcome.label,
        });
      } else if (lesson.moderationStatus !== 'approved') {
        // Guard: rejected/appealing/locked không bao giờ được vào vector store.
        this.logger.warn(
          `Lesson ${lessonId} has moderationStatus=${lesson.moderationStatus} — skipping index`,
        );
        return;
      }

      // ── Embed + index
      const embeddings = await this.gemini.embedBatch(
        rows.map((r) => r.content),
      );
      await this.vector.upsertChunks(
        rows.map((r, i) => ({
          courseId,
          sectionId: lesson.sectionId,
          lessonId,
          sourceType: r.sourceType,
          sectionTitle: r.sectionTitle,
          pageNumber: null,
          chunkIndex: i,
          content: r.content,
          tokenCount: r.tokenCount,
          embedding: embeddings[i],
          metadata: { source: lesson.title },
        })),
      );

      if (asset) {
        await this.prisma.documentAsset.update({
          where: { id: asset.id },
          data: {
            chunkCount: rows.length,
            // 'ready' chỉ khi pipeline file đi trọn vẹn; parse lỗi giữ 'failed' để UI hiển thị
            ...(asset.fileUrl && fileMd
              ? { parseStatus: 'ready' as const, errorMsg: null }
              : {}),
          },
        });
      }
      this.logger.log(
        `Indexed lesson ${lessonId}: ${rows.length} chunks (${contentMd ? 'content' : ''}${contentMd && fileMd ? '+' : ''}${fileMd ? 'file' : ''})`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Failed to index lesson ${lessonId}: ${msg}`);
      if (asset) {
        await this.prisma.documentAsset
          .update({
            where: { id: asset.id },
            data: { errorMsg: msg.slice(0, 500) },
          })
          .catch(() => undefined);
      }
      throw err;
    }
  }

  /**
   * Dựng markdown từ script video do giảng viên đăng tải để vector hóa.
   * Chỉ áp dụng cho VideoAsset có file upload (videoUrl) đã transcribe xong
   * (transcriptStatus='ready'); bỏ qua bài chưa transcribe / video AI tự sinh.
   *
   * Mỗi chương (segmentsJson) thành một heading "## tên chương" + dòng tóm tắt
   * sẵn có, kèm phần transcript (cuesJson) rơi trong khung thời gian của chương.
   * Không có chương thì fallback dùng heading bài + toàn bộ lời thoại.
   */
  private buildVideoMarkdown(
    video:
      | {
          videoUrl: string | null;
          transcriptStatus: string;
          segmentsJson: unknown;
          cuesJson: unknown;
        }
      | null
      | undefined,
    lessonTitle: string,
  ): string {
    if (!video?.videoUrl || video.transcriptStatus !== 'ready') return '';

    const chapters = Array.isArray(video.segmentsJson)
      ? (video.segmentsJson as Array<{
          startSec?: number;
          endSec?: number;
          title?: string;
          summary?: string;
        }>)
      : [];
    const cues = Array.isArray(video.cuesJson)
      ? (video.cuesJson as Array<{
          startSec?: number;
          endSec?: number;
          text?: string;
        }>)
      : [];

    const cueTextInRange = (start: number, end: number): string =>
      cues
        .filter((c) => {
          const s = typeof c.startSec === 'number' ? c.startSec : -1;
          return s >= start && s < end && c.text;
        })
        .map((c) => c.text!.trim())
        .join(' ')
        .trim();

    const blocks: string[] = [];
    if (chapters.length > 0) {
      for (const ch of chapters) {
        const title = ch.title?.trim();
        if (!title) continue;
        const start = typeof ch.startSec === 'number' ? ch.startSec : 0;
        const end =
          typeof ch.endSec === 'number' ? ch.endSec : Number.MAX_SAFE_INTEGER;
        const parts = [`## ${title}`];
        const summary = ch.summary?.trim();
        if (summary) parts.push(summary);
        const transcript = cueTextInRange(start, end);
        if (transcript) parts.push(transcript);
        blocks.push(parts.join('\n\n'));
      }
    }

    // Không có chương dùng được nhưng vẫn có lời thoại → gộp toàn bộ transcript.
    if (blocks.length === 0) {
      const full = cues
        .map((c) => c.text?.trim())
        .filter((t): t is string => !!t)
        .join(' ')
        .trim();
      if (!full) return '';
      blocks.push(`## ${lessonTitle}\n\n${full}`);
    }

    return blocks.join('\n\n').trim();
  }

  /**
   * Lấy markdown của file tài liệu: ưu tiên bản cache trên MinIO (markdownUrl);
   * chưa có thì parse bằng LlamaParse rồi cache lại. Parse lỗi KHÔNG chặn việc
   * index nội dung soạn tay — trả về chuỗi rỗng và ghi nhận trạng thái failed.
   */
  private async loadOrParseFile(
    assetId: string,
    fileUrl: string,
    fileType: string,
    markdownUrl: string | null,
    lessonTitle: string,
    lessonId: string,
  ): Promise<string> {
    if (markdownUrl) {
      try {
        const buf = await this.storage.downloadFile(
          this.storage.extractKeyFromUrl(markdownUrl),
        );
        return buf.toString('utf-8');
      } catch (err) {
        this.logger.warn(
          `Cached markdown for lesson ${lessonId} unavailable — re-parsing: ${(err as Error).message}`,
        );
      }
    }

    await this.prisma.documentAsset.update({
      where: { id: assetId },
      data: { parseStatus: 'parsing', errorMsg: null },
    });
    try {
      const fileBuf = await this.storage.downloadFile(
        this.storage.extractKeyFromUrl(fileUrl),
      );
      const mimeType = fileType === 'pdf' ? 'application/pdf' : DOCX_MIME;
      const jobId = await this.llamaParse.submitJob(
        fileBuf,
        `${lessonTitle}.${fileType}`,
        mimeType,
      );
      await this.prisma.documentAsset.update({
        where: { id: assetId },
        data: { llamaParseJobId: jobId },
      });
      await this.llamaParse.pollUntilDone(jobId);
      const markdown = await this.llamaParse.getMarkdown(jobId);

      const mdKey = `markdown/lessons/${lessonId}.md`;
      const mdUrl = await this.storage.uploadFile(
        mdKey,
        Buffer.from(markdown, 'utf-8'),
        'text/markdown; charset=utf-8',
      );
      await this.prisma.documentAsset.update({
        where: { id: assetId },
        data: { markdownUrl: mdUrl, parseStatus: 'parsed' },
      });
      return markdown;
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.warn(
        `LlamaParse failed for lesson ${lessonId}: ${msg} — indexing authored content only`,
      );
      await this.prisma.documentAsset
        .update({
          where: { id: assetId },
          data: { parseStatus: 'failed', errorMsg: msg.slice(0, 500) },
        })
        .catch(() => undefined);
      return '';
    }
  }
}
