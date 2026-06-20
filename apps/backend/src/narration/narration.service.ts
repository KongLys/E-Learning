import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { stripHtml } from '../common/sanitize-html.util';
import { NARRATION_QUEUE, GenerateNarrationJob } from './narration.queue';

// Dưới ngưỡng này coi như bài chỉ có file đính kèm / chưa có nội dung để đọc.
const MIN_SOURCE_CHARS = 100;
const MAX_SOURCE_CHARS = 20000;
const SIGNED_URL_TTL = 4 * 60 * 60; // 4h, giống tài liệu

interface NarrationLesson {
  id: string;
  title: string;
  description: string | null;
  type: string;
  isPreview: boolean;
  documentAsset: { contentHtml: string | null } | null;
  section: { course: { id: string; instructorId: string } };
}

@Injectable()
export class NarrationService {
  private readonly logger = new Logger(NarrationService.name);

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    @InjectQueue(NARRATION_QUEUE) private queue: Queue<GenerateNarrationJob>,
  ) {}

  // ─── Public API ──────────────────────────────────────────────────────────────

  /** Lấy giọng đọc của bài (kèm URL audio đã ký nếu sẵn sàng), hoặc null. */
  async getNarration(lessonId: string, userId: string, userRole: string) {
    const lesson = await this.assertLessonAccess(lessonId, userId, userRole);
    const asset = await this.prisma.narrationAsset.findUnique({
      where: { lessonId },
    });
    if (!asset) return null;

    let audioUrl = asset.audioUrl;
    if (asset.status === 'ready' && asset.audioUrl) {
      const isOwner =
        lesson.section.course.instructorId === userId || userRole === 'admin';
      if (!isOwner && !lesson.isPreview) {
        const key = this.storage.extractKeyFromUrl(asset.audioUrl);
        audioUrl = await this.storage.getSignedUrl(key, SIGNED_URL_TTL);
      }
    }
    return {
      status: asset.status,
      audioUrl,
      durationSec: asset.durationSec,
      errorMsg: asset.errorMsg,
      updatedAt: asset.updatedAt,
    };
  }

  /** Đưa vào hàng đợi tạo (hoặc tạo lại) giọng đọc cho 1 bài đọc. */
  async enqueueForLesson(lessonId: string): Promise<boolean> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { documentAsset: { select: { contentHtml: true } } },
    });
    if (!lesson || lesson.type !== 'document') return false;

    const source = this.collectReadingContent(lesson);
    if (source.length < MIN_SOURCE_CHARS) {
      this.logger.log(
        `Lesson ${lessonId} không đủ nội dung đọc — bỏ qua tạo giọng đọc`,
      );
      return false;
    }

    await this.prisma.narrationAsset.upsert({
      where: { lessonId },
      update: { status: 'pending', errorMsg: null },
      create: { lessonId, status: 'pending' },
    });
    await this.queue.add(
      'generate',
      { lessonId },
      { removeOnComplete: true, removeOnFail: 50 },
    );
    return true;
  }

  /** Khi khóa được duyệt xuất bản: tạo giọng đọc cho mọi bài đọc trong khóa. */
  async enqueueForCourse(courseId: string): Promise<void> {
    const lessons = await this.prisma.lesson.findMany({
      where: { type: 'document', section: { courseId } },
      select: { id: true },
    });
    for (const l of lessons) {
      await this.enqueueForLesson(l.id).catch((err) =>
        this.logger.warn(
          `enqueue narration ${l.id} lỗi: ${(err as Error).message}`,
        ),
      );
    }
  }

  // ─── Helpers (dùng chung với processor) ───────────────────────────────────────

  async assertLessonAccess(
    lessonId: string,
    userId: string,
    userRole: string,
  ): Promise<NarrationLesson> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        section: { include: { course: true } },
        documentAsset: true,
      },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const course = lesson.section.course;
    const isOwner = course.instructorId === userId || userRole === 'admin';
    if (!isOwner) {
      const enrollment = await this.prisma.enrollment.findFirst({
        where: { studentId: userId, courseId: course.id, status: 'active' },
      });
      if (!enrollment) {
        throw new ForbiddenException('Not enrolled in this course');
      }
    }
    return lesson as unknown as NarrationLesson;
  }

  /**
   * Gom nội dung ĐỌC TRUNG THỰC: tiêu đề + mô tả + thân RichText (đã bóc HTML).
   * KHÔNG đưa file đính kèm / tài liệu tham khảo / lời chào-chúc mừng.
   */
  collectReadingContent(lesson: {
    title: string;
    description: string | null;
    documentAsset: { contentHtml: string | null } | null;
  }): string {
    const parts: string[] = [];
    if (lesson.title) parts.push(lesson.title);
    if (lesson.description) parts.push(lesson.description);
    if (lesson.documentAsset?.contentHtml) {
      parts.push(stripHtml(lesson.documentAsset.contentHtml));
    }
    return parts
      .map((p) => p.trim())
      .filter(Boolean)
      .join('\n\n')
      .slice(0, MAX_SOURCE_CHARS);
  }
}
