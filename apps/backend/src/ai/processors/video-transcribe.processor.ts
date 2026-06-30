import { Logger } from '@nestjs/common';
import { Processor, WorkerHost, InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { AssemblyAiService } from '../media/assemblyai.service';
import {
  SubtitleLang,
  TranscriptTranslateService,
} from '../media/transcript-translate.service';
import {
  TranscriptCue,
  TranscriptChapter,
} from '../providers/gemini.service';
import { LESSON_INDEX_QUEUE, IndexLessonJob } from './lesson-index.processor';

export const VIDEO_TRANSCRIBE_QUEUE = 'video-transcription';

export interface TranscribeVideoJob {
  lessonId: string;
}

/**
 * Sau khi giảng viên upload video, job này chạy nền để:
 *  - tạo phụ đề có timestamp (cues, lưu kèm bản WebVTT vào transcript)
 *  - phân tích nội dung theo khung thời gian (segments/chapters)
 * Dùng AssemblyAI (nhận dạng giọng nói) + LLM cục bộ (phân chương). Không chặn
 * playback — video xem được ngay, phụ đề/nội dung xuất hiện khi transcriptStatus='ready'.
 */
@Processor(VIDEO_TRANSCRIBE_QUEUE, { concurrency: 1 })
export class VideoTranscribeProcessor extends WorkerHost {
  private readonly logger = new Logger(VideoTranscribeProcessor.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private assemblyai: AssemblyAiService,
    private translate: TranscriptTranslateService,
    @InjectQueue(LESSON_INDEX_QUEUE)
    private lessonIndexQueue: Queue<IndexLessonJob>,
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

    await this.prisma.videoAsset.update({
      where: { lessonId },
      data: { transcriptStatus: 'processing', transcriptError: null },
    });

    try {
      // AssemblyAI tự tải media về từ URL — cấp presigned URL (1h) cho object riêng tư.
      const mediaUrl = await this.storage.getSignedUrl(key, 60 * 60);
      const result = await this.assemblyai.transcribeMedia(mediaUrl);

      // Phụ đề song ngữ để HIỂN THỊ: luôn dựng đủ track Việt + Anh. Track trùng
      // ngôn ngữ gốc dùng thẳng bản gốc (khỏi gọi LLM); track còn lại được dịch.
      // cuesJson/segmentsJson VẪN giữ bản gốc — nguồn duy nhất để embed.
      const { cuesVi, cuesEn, segmentsVi, segmentsEn } =
        await this.buildBilingualTracks(
          result.language,
          result.cues,
          result.chapters,
        );

      await this.prisma.videoAsset.update({
        where: { lessonId },
        data: {
          transcriptStatus: 'ready',
          transcriptLang: result.language,
          transcriptError: null,
          transcript: this.toVtt(result.cues),
          cuesJson: result.cues as unknown as Prisma.InputJsonValue,
          segmentsJson: result.chapters as unknown as Prisma.InputJsonValue,
          cuesViJson: cuesVi as unknown as Prisma.InputJsonValue,
          cuesEnJson: cuesEn as unknown as Prisma.InputJsonValue,
          segmentsViJson: segmentsVi as unknown as Prisma.InputJsonValue,
          segmentsEnJson: segmentsEn as unknown as Prisma.InputJsonValue,
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

      try {
        await this.lessonIndexQueue.add(
          'index',
          { lessonId },
          { removeOnComplete: true, removeOnFail: 50 },
        );
      } catch (err) {
        this.logger.warn(
          `Enqueue lesson-index after transcript failed for ${lessonId}: ${(err as Error).message}`,
        );
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
    }
  }

  /**
   * Dựng đủ 2 track phụ đề (Việt + Anh) từ kết quả gốc. Track cùng ngôn ngữ gốc
   * dùng thẳng bản gốc; track còn lại được dịch (best-effort, lỗi → giữ bản gốc).
   */
  private async buildBilingualTracks(
    language: string,
    cues: TranscriptCue[],
    chapters: TranscriptChapter[],
  ): Promise<{
    cuesVi: TranscriptCue[];
    cuesEn: TranscriptCue[];
    segmentsVi: TranscriptChapter[];
    segmentsEn: TranscriptChapter[];
  }> {
    const base = (language ?? '').toLowerCase().split(/[-_]/)[0];

    const cuesFor = (target: SubtitleLang): Promise<TranscriptCue[]> =>
      base === target
        ? Promise.resolve(cues)
        : this.translate.translateCues(cues, target, language);
    const segmentsFor = (target: SubtitleLang): Promise<TranscriptChapter[]> =>
      base === target
        ? Promise.resolve(chapters)
        : this.translate.translateChapters(chapters, target, language);

    const [cuesVi, cuesEn, segmentsVi, segmentsEn] = await Promise.all([
      cuesFor('vi'),
      cuesFor('en'),
      segmentsFor('vi'),
      segmentsFor('en'),
    ]);
    return { cuesVi, cuesEn, segmentsVi, segmentsEn };
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
