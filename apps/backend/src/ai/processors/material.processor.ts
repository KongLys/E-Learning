import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { LlamaParseService } from '../chunking/llama-parse.service';
import { MarkdownChunkerService } from '../chunking/markdown-chunker.service';
import { GeminiService } from '../gemini.service';
import { VectorStoreService } from '../vector/vector-store.service';
import { ModerationService } from '../../moderation/moderation.service';

export const MATERIAL_QUEUE = 'material-processing';

export interface ProcessMaterialJob {
  materialId: string;
}

@Processor(MATERIAL_QUEUE, { concurrency: 2 })
export class MaterialProcessor extends WorkerHost {
  private readonly logger = new Logger(MaterialProcessor.name);

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

  async process(job: Job<ProcessMaterialJob>): Promise<void> {
    const { materialId } = job.data;
    this.logger.log(`Processing material ${materialId} (attempt ${job.attemptsMade + 1})`);

    try {
      // Load material + clear previous chunks if retrying
      const material = await this.prisma.courseMaterial.findUnique({
        where: { id: materialId },
        include: { course: { select: { instructorId: true } } },
      });
      if (!material) throw new Error(`Material ${materialId} not found`);
      await this.vector.deleteByMaterial(materialId);

      // Step 1: download file from MinIO and submit to LlamaParse
      await this.updateStatus(materialId, 'parsing');
      const fileBuf = await this.storage.downloadFile(
        this.storage.extractKeyFromUrl(material.fileUrl),
      );
      const mimeType =
        material.fileType === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
      const jobId = await this.llamaParse.submitJob(fileBuf, material.fileName, mimeType);
      await this.prisma.courseMaterial.update({
        where: { id: materialId },
        data: { llamaParseJobId: jobId },
      });
      await job.updateProgress(20);

      this.moderation.debugLog('material step 1 — parse submitted', { materialId, jobId, fileType: material.fileType });

      // Step 2: poll until LlamaParse finishes
      await this.llamaParse.pollUntilDone(jobId);
      const markdown = await this.llamaParse.getMarkdown(jobId);
      await job.updateProgress(50);
      this.moderation.debugLog('material step 2 — parsed', { materialId, markdownChars: markdown.length });

      // Step 3: upload markdown to MinIO for later re-chunking
      const mdKey = `markdown/${materialId}.md`;
      const mdUrl = await this.storage.uploadFile(
        mdKey,
        Buffer.from(markdown, 'utf-8'),
        'text/markdown; charset=utf-8',
      );
      await this.prisma.courseMaterial.update({
        where: { id: materialId },
        data: { markdownUrl: mdUrl, status: 'parsed' },
      });

      // Step 4: chunk
      const chunks = this.chunker.chunk(markdown);
      if (chunks.length === 0) {
        throw new Error('No chunks extracted from markdown');
      }
      this.moderation.debugLog('material step 3 — chunked', { materialId, chunks: chunks.length });

      // Step 4b: content moderation (only when not already approved by an admin).
      // Sample representative chunks and classify before spending on embeddings.
      if (material.moderationStatus === 'pending') {
        const sampledChunks = this.moderation.sampleChunks(chunks);
        const sampled = sampledChunks.map((c) => c.content);
        this.moderation.debugLog('material step 4 — moderating', {
          materialId,
          sampled: sampled.length,
          ofTotal: chunks.length,
        });
        const outcome = await this.moderation.evaluate(sampled);
        if (outcome.status !== 'approved') {
          await this.prisma.courseMaterial.update({
            where: { id: materialId },
            data: {
              status: 'parsed',
              chunkCount: 0,
              moderationStatus: outcome.status, // 'rejected' | 'pending'
              moderationLabel: outcome.label ?? null,
              moderationScore: outcome.score ?? null,
              moderationReason: outcome.reason ?? null,
              moderatedAt: new Date(),
            },
          });
          this.events.emit('moderation.rejected', {
            ownerId: material.course.instructorId,
            contentType: 'material',
            contentId: materialId,
            title: material.fileName,
            courseId: material.courseId,
            status: outcome.status,
            reason: outcome.reason,
          });
          this.logger.warn(`Material ${materialId} not approved (${outcome.status}/${outcome.label}) — skipping index`);
          return;
        }
        await this.prisma.courseMaterial.update({
          where: { id: materialId },
          data: {
            moderationStatus: 'approved',
            moderationLabel: outcome.label ?? 'it',
            moderationScore: outcome.score ?? null,
            moderatedAt: new Date(),
          },
        });
        this.moderation.debugLog('material step 4 — approved, indexing', { materialId, label: outcome.label });
      } else if (material.moderationStatus !== 'approved') {
        // Safety guard: only 'approved' content may be embedded/indexed. No current
        // path re-enqueues a rejected/appealing/locked material, but guard defensively
        // so such content can never leak into the vector store / RAG.
        this.logger.warn(
          `Material ${materialId} has moderationStatus=${material.moderationStatus} — skipping index`,
        );
        this.moderation.debugLog('material step 4 — skipping index (not approved)', {
          materialId,
          moderationStatus: material.moderationStatus,
        });
        return;
      } else {
        this.moderation.debugLog('material step 4 — moderation skipped (admin-approved)', {
          materialId,
          moderationStatus: material.moderationStatus,
        });
      }

      // Step 5: embed
      const embeddings = await this.gemini.embedBatch(chunks.map((c) => c.content));
      await job.updateProgress(80);

      // Step 6: bulk insert
      await this.vector.upsertChunks(
        chunks.map((c, i) => ({
          courseId: material.courseId,
          materialId,
          lessonId: null,
          sourceType: 'material' as const,
          sectionTitle: c.sectionTitle,
          pageNumber: null,
          chunkIndex: c.chunkIndex,
          content: c.content,
          tokenCount: c.tokenCount,
          embedding: embeddings[i],
          metadata: { source: material.fileName },
        })),
      );

      await this.prisma.courseMaterial.update({
        where: { id: materialId },
        data: { status: 'ready', chunkCount: chunks.length, errorMsg: null },
      });
      await job.updateProgress(100);
      this.moderation.debugLog('material step 5/6 — embedded + indexed → ready', { materialId, chunks: chunks.length });
      this.logger.log(`Material ${materialId} processed: ${chunks.length} chunks`);
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Failed to process material ${materialId}: ${msg}`);
      await this.prisma.courseMaterial.update({
        where: { id: materialId },
        data: { status: 'failed', errorMsg: msg.slice(0, 500) },
      });
      throw err;
    }
  }

  private async updateStatus(materialId: string, status: 'parsing' | 'parsed' | 'ready' | 'failed') {
    await this.prisma.courseMaterial.update({
      where: { id: materialId },
      data: { status },
    });
  }
}
