import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { GeminiService, TranscriptCue } from '../gemini.service';

export const VIDEO_TRANSCRIBE_QUEUE = 'video-transcription';

export interface TranscribeVideoJob {
  lessonId: string;
}

/**
 * Sau khi giảng viên upload video, job này chạy nền để:
 *  - tạo phụ đề có timestamp (cues, lưu kèm bản WebVTT vào transcript)
 *  - phân tích nội dung theo khung thời gian (segments/chapters)
 * Dùng Gemini File API. Không chặn playback — video xem được ngay,
 * phụ đề/nội dung xuất hiện khi transcriptStatus='ready'.
 */
@Processor(VIDEO_TRANSCRIBE_QUEUE, { concurrency: 1 })
export class VideoTranscribeProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoTranscribeProcessor.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private gemini: GeminiService,
  ) {
    super();
  }

  async process(job: Job<TranscribeVideoJob>): Promise<void> {
    const { lessonId } = job.data;
    const asset = await this.prisma.videoAsset.findUnique({
      where: { lessonId },
      include: { lesson: { select: { sectionId: true, durationSec: true } } },
    });
    if (!asset?.videoUrl) {
      this.logger.warn(`Lesson ${lessonId} has no video — skip transcription`);
      return;
    }

    const key = this.storage.extractKeyFromUrl(asset.videoUrl);
    const mimeType = key.endsWith('.webm') ? 'video/webm' : 'video/mp4';
    const ext = key.endsWith('.webm') ? 'webm' : 'mp4';
    const tmpPath = join(tmpdir(), `transcribe-${lessonId}-${randomUUID()}.${ext}`);

    await this.prisma.videoAsset.update({
      where: { lessonId },
      data: { transcriptStatus: 'processing', transcriptError: null },
    });

    try {
      await this.storage.downloadToFile(key, tmpPath);
      const result = await this.gemini.transcribeMedia(tmpPath, mimeType);

      await this.prisma.videoAsset.update({
        where: { lessonId },
        data: {
          transcriptStatus: 'ready',
          transcriptLang: result.language,
          transcriptError: null,
          transcript: this.toVtt(result.cues),
          cuesJson: result.cues as unknown as Prisma.InputJsonValue,
          segmentsJson: result.chapters as unknown as Prisma.InputJsonValue,
          // Duration trước đây luôn = 0 (chưa từng được điền) — lấy từ media.
          ...(result.durationSec > 0
            ? { durationSec: result.durationSec }
            : {}),
        },
      });

      // Cập nhật thời lượng bài học + thống kê khóa học nếu lần đầu có duration.
      if (result.durationSec > 0 && asset.lesson.durationSec !== result.durationSec) {
        await this.prisma.lesson.update({
          where: { id: lessonId },
          data: { durationSec: result.durationSec },
        });
        await this.updateCourseStats(asset.lesson.sectionId);
      }

      this.logger.log(
        `Transcribed lesson ${lessonId}: ${result.cues.length} cues, ${result.chapters.length} chapters (${result.language})`,
      );
    } catch (err) {
      const msg = (err as Error).message;
      this.logger.error(`Transcription failed for lesson ${lessonId}: ${msg}`);
      await this.prisma.videoAsset
        .update({
          where: { lessonId },
          data: {
            transcriptStatus: 'failed',
            transcriptError: msg.slice(0, 500),
          },
        })
        .catch(() => undefined);
      throw err;
    } finally {
      await unlink(tmpPath).catch(() => undefined);
    }
  }

  /** Đồng bộ totalLessons/totalDurationSec của khóa học (mirror LessonService.updateCourseStats). */
  private async updateCourseStats(sectionId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
    });
    if (!section) return;
    const stats = await this.prisma.lesson.aggregate({
      where: { section: { courseId: section.courseId } },
      _count: { id: true },
      _sum: { durationSec: true },
    });
    await this.prisma.course.update({
      where: { id: section.courseId },
      data: {
        totalLessons: stats._count.id,
        totalDurationSec: stats._sum.durationSec ?? 0,
      },
    });
  }

  /** Chuyển danh sách cue thành chuỗi WebVTT chuẩn để lưu / tải về. */
  private toVtt(cues: TranscriptCue[]): string {
    const fmt = (sec: number) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = Math.floor(sec % 60);
      const ms = Math.round((sec - Math.floor(sec)) * 1000);
      const p = (n: number, l = 2) => String(n).padStart(l, '0');
      return `${p(h)}:${p(m)}:${p(s)}.${p(ms, 3)}`;
    };
    const body = cues
      .map((c, i) => `${i + 1}\n${fmt(c.startSec)} --> ${fmt(c.endSec)}\n${c.text}`)
      .join('\n\n');
    return `WEBVTT\n\n${body}\n`;
  }
}
