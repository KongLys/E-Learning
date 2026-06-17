import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { GoogleTtsService } from '../../ai/google-tts.service';
import { PodcastService } from '../podcast.service';
import { PODCAST_QUEUE, GeneratePodcastJob } from '../podcast.queue';

// Ước lượng thời lượng đọc tiếng Việt ~150 từ/phút (chỉ để hiển thị danh sách;
// thẻ <audio> tự hiển thị thời lượng thật khi tải file).
const WORDS_PER_MINUTE = 150;

/**
 * Chạy nền sau khi học viên/giảng viên yêu cầu tạo podcast cho bài đọc:
 *  - gom nội dung bài học → LLM viết kịch bản lời dẫn
 *  - Google Cloud TTS đọc thành MP3 → upload R2
 * Không chặn việc đọc bài; UI hiển thị khi status='ready'.
 */
@Processor(PODCAST_QUEUE, { concurrency: 1 })
export class PodcastGenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(PodcastGenerateProcessor.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private tts: GoogleTtsService,
    private podcast: PodcastService,
  ) {
    super();
  }

  async process(job: Job<GeneratePodcastJob>): Promise<void> {
    const { lessonId } = job.data;
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { documentAsset: true },
    });
    if (!lesson) {
      this.logger.warn(`Lesson ${lessonId} not found — skip podcast`);
      return;
    }

    await this.prisma.podcastAsset.update({
      where: { lessonId },
      data: { status: 'processing', errorMsg: null },
    });

    try {
      const source = await this.podcast.collectLessonContent(lessonId, lesson);
      const script = await this.podcast.generateScript(lesson.title, source);
      const audio = await this.tts.synthesize(script);

      const key = `podcasts/${lessonId}/${randomUUID()}.mp3`;
      const audioUrl = await this.storage.uploadFile(key, audio, 'audio/mpeg');

      const wordCount = script.split(/\s+/).filter(Boolean).length;
      const durationSec = Math.round((wordCount / WORDS_PER_MINUTE) * 60);

      await this.prisma.podcastAsset.update({
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
        `Generated podcast for lesson ${lessonId}: ${wordCount} words (~${durationSec}s)`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Podcast generation failed for lesson ${lessonId}: ${msg}`);
      await this.prisma.podcastAsset
        .update({
          where: { lessonId },
          data: { status: 'failed', errorMsg: msg.slice(0, 500) },
        })
        .catch(() => undefined);
      throw err;
    }
  }
}
