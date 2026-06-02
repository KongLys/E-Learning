import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { LlamaParseService } from '../chunking/llama-parse.service';
import { MarkdownChunkerService } from '../chunking/markdown-chunker.service';
import { GeminiService } from '../gemini.service';
import { VectorStoreService } from '../vector/vector-store.service';

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
  ) {
    super();
  }

  async process(job: Job<ProcessMaterialJob>): Promise<void> {
    const { materialId } = job.data;
    this.logger.log(`Processing material ${materialId} (attempt ${job.attemptsMade + 1})`);

    try {
      // Load material + clear previous chunks if retrying
      const material = await this.prisma.courseMaterial.findUnique({ where: { id: materialId } });
      if (!material) throw new Error(`Material ${materialId} not found`);
      await this.vector.deleteByMaterial(materialId);

      // Step 1: download file from MinIO and submit to LlamaParse
      await this.updateStatus(materialId, 'parsing');
      const fileBuf = await this.downloadFromUrl(material.fileUrl);
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

      // Step 2: poll until LlamaParse finishes
      await this.llamaParse.pollUntilDone(jobId);
      const markdown = await this.llamaParse.getMarkdown(jobId);
      await job.updateProgress(50);

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

      // Step 4: chunk + embed
      const chunks = this.chunker.chunk(markdown);
      if (chunks.length === 0) {
        throw new Error('No chunks extracted from markdown');
      }
      const embeddings = await this.gemini.embedBatch(chunks.map((c) => c.content));
      await job.updateProgress(80);

      // Step 5: bulk insert
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

  private async downloadFromUrl(url: string): Promise<Buffer> {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Cannot download file (${res.status})`);
    return Buffer.from(await res.arrayBuffer());
  }
}
