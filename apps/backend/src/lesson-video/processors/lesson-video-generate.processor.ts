import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { createReadStream } from 'fs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { GoogleTtsService } from '../../ai/media/google-tts.service';
import {
  RemotionRenderService,
  VideoSectionInput,
} from '../../ai/media/remotion-render.service';
import { LessonVideoService } from '../lesson-video.service';
import {
  LESSON_VIDEO_QUEUE,
  GenerateLessonVideoJob,
} from '../lesson-video.queue';

const FPS = 30;
const MIN_SECTION_SEC = 3; // mỗi section tối thiểu vài giây để bullet kịp hiển thị

/**
 * Chạy nền sau khi khóa được duyệt xuất bản (AI_VIDEO_ENABLED=true):
 *  - LLM Ollama tóm tắt bài → kịch bản các section
 *  - Google TTS đọc từng section → đo thời lượng
 *  - Remotion render MP4 có timeline section → upload R2
 */
@Processor(LESSON_VIDEO_QUEUE, { concurrency: 1 })
export class LessonVideoGenerateProcessor extends WorkerHost {
  private readonly logger = new Logger(LessonVideoGenerateProcessor.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private tts: GoogleTtsService,
    private remotion: RemotionRenderService,
    private lessonVideo: LessonVideoService,
  ) {
    super();
  }

  async process(job: Job<GenerateLessonVideoJob>): Promise<void> {
    const { lessonId } = job.data;
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { documentAsset: { select: { contentHtml: true } } },
    });
    if (!lesson) {
      this.logger.warn(`Lesson ${lessonId} not found — skip video`);
      return;
    }

    await this.prisma.lessonVideoAsset.update({
      where: { lessonId },
      data: { status: 'processing', errorMsg: null },
    });

    const sectionAudioKeys: string[] = [];
    let cleanupVideo: (() => void) | null = null;
    try {
      const source = this.lessonVideo.collectContent(lesson);
      const sections = await this.lessonVideo.buildVideoScript(
        lesson.title,
        source,
      );

      // TTS từng section + đo thời lượng để dựng timeline chính xác.
      const sectionInputs: VideoSectionInput[] = [];
      const timeline: { title: string; startSec: number; endSec: number }[] = [];
      let cursorSec = 0;
      for (const sec of sections) {
        const { audio: buf } = await this.tts.synthesize(sec.narration);
        const durSec = Math.max(MIN_SECTION_SEC, await this.audioDuration(buf));
        const key = `lesson-videos/${lessonId}/sections/${randomUUID()}.mp3`;
        const audioSrc = await this.storage.uploadFile(key, buf, 'audio/mpeg');
        sectionAudioKeys.push(key);

        sectionInputs.push({
          title: sec.title,
          bullets: sec.bullets,
          narrationText: sec.narration,
          audioSrc,
          durationInFrames: Math.round(durSec * FPS),
        });
        timeline.push({
          title: sec.title,
          startSec: Math.round(cursorSec),
          endSec: Math.round(cursorSec + durSec),
        });
        cursorSec += durSec;
      }

      const { filePath, cleanup } = await this.remotion.render({
        lessonTitle: lesson.title,
        sections: sectionInputs,
        fps: FPS,
      });
      cleanupVideo = cleanup;

      const videoKey = `lesson-videos/${lessonId}/${randomUUID()}.mp4`;
      const videoUrl = await this.storage.uploadFile(
        videoKey,
        createReadStream(filePath),
        'video/mp4',
      );

      await this.prisma.lessonVideoAsset.update({
        where: { lessonId },
        data: {
          status: 'ready',
          videoUrl,
          durationSec: Math.round(cursorSec),
          sectionsJson: timeline,
          model: 'ollama+remotion',
          errorMsg: null,
        },
      });
      this.logger.log(
        `Generated AI video for lesson ${lessonId}: ${sections.length} sections (~${Math.round(cursorSec)}s)`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`AI video failed for lesson ${lessonId}: ${msg}`);
      await this.prisma.lessonVideoAsset
        .update({
          where: { lessonId },
          data: { status: 'failed', errorMsg: msg.slice(0, 500) },
        })
        .catch(() => undefined);
      throw err;
    } finally {
      if (cleanupVideo) cleanupVideo();
      // Dọn audio tạm của từng section (chỉ cần trong lúc render).
      for (const key of sectionAudioKeys) {
        await this.storage.deleteFile(key).catch(() => undefined);
      }
    }
  }

  /** Đo thời lượng MP3 (giây) bằng music-metadata (ESM → dynamic import). */
  private async audioDuration(buf: Buffer): Promise<number> {
    try {
      const mm = await import('music-metadata');
      const meta = await mm.parseBuffer(buf, { mimeType: 'audio/mpeg' });
      return meta.format.duration ?? 0;
    } catch (err) {
      this.logger.warn(`Đo thời lượng audio lỗi: ${(err as Error).message}`);
      return 0;
    }
  }
}
