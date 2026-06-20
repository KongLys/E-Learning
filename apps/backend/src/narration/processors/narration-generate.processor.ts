import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { GoogleTtsService } from '../../ai/google-tts.service';
import { NarrationService } from '../narration.service';
import { NARRATION_QUEUE, GenerateNarrationJob } from '../narration.queue';

// Ước lượng thời lượng đọc tiếng Việt ~150 từ/phút (chỉ để hiển thị; thẻ <audio>
// tự hiển thị thời lượng thật khi tải file).
const WORDS_PER_MINUTE = 150;

/**
 * Chạy nền sau khi khóa được duyệt xuất bản: đọc TRUNG THỰC nội dung bài đọc
 * (không qua LLM) → Google Cloud TTS đọc thành MP3 → upload R2. Hiển thị dưới
 * tiêu đề & tự phát khi status='ready'.
 */
@Processor(NARRATION_QUEUE, { concurrency: 1 })
export class NarrationGenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(NarrationGenerateProcessor.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private tts: GoogleTtsService,
    private narration: NarrationService,
  ) {
    super();
  }

  async process(job: Job<GenerateNarrationJob>): Promise<void> {
    const { lessonId } = job.data;
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { documentAsset: { select: { contentHtml: true } } },
    });
    if (!lesson) {
      this.logger.warn(`Lesson ${lessonId} not found — skip narration`);
      return;
    }

    await this.prisma.narrationAsset.update({
      where: { lessonId },
      data: { status: 'processing', errorMsg: null },
    });

    try {
      const source = this.narration.collectReadingContent(lesson);
      const audio = await this.tts.synthesize(source);

      const key = `narrations/${lessonId}/${randomUUID()}.mp3`;
      const audioUrl = await this.storage.uploadFile(key, audio, 'audio/mpeg');

      const wordCount = source.split(/\s+/).filter(Boolean).length;
      const durationSec = Math.round((wordCount / WORDS_PER_MINUTE) * 60);

      await this.prisma.narrationAsset.update({
        where: { lessonId },
        data: {
          status: 'ready',
          audioUrl,
          durationSec,
          voice: this.tts.voice,
          errorMsg: null,
        },
      });
      this.logger.log(
        `Generated narration for lesson ${lessonId}: ${wordCount} words (~${durationSec}s)`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Narration failed for lesson ${lessonId}: ${msg}`);
      await this.prisma.narrationAsset
        .update({
          where: { lessonId },
          data: { status: 'failed', errorMsg: msg.slice(0, 500) },
        })
        .catch(() => undefined);
      throw err;
    }
  }
}
