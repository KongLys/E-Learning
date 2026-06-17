import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { GeminiService } from '../ai/gemini.service';
import { StorageService } from '../storage/storage.service';
import { PODCAST_QUEUE, GeneratePodcastJob } from './podcast.queue';

const MIN_SOURCE_CHARS = 200;
const MAX_SOURCE_CHARS = 12000;
const SIGNED_URL_TTL = 4 * 60 * 60; // 4h, giống tài liệu

interface PodcastLesson {
  id: string;
  title: string;
  description: string | null;
  type: string;
  isPreview: boolean;
  documentAsset: { contentHtml: string | null } | null;
  section: { course: { id: string; instructorId: string } };
}

@Injectable()
export class PodcastService {
  constructor(
    private prisma: PrismaService,
    private gemini: GeminiService,
    private storage: StorageService,
    @InjectQueue(PODCAST_QUEUE) private queue: Queue<GeneratePodcastJob>,
  ) {}

  // ─── Public API ──────────────────────────────────────────────────────────────

  /** Lấy podcast của bài học (kèm URL audio đã ký nếu sẵn sàng), hoặc null. */
  async getPodcast(lessonId: string, userId: string, userRole: string) {
    const lesson = await this.assertLessonAccess(lessonId, userId, userRole);
    const asset = await this.prisma.podcastAsset.findUnique({
      where: { lessonId },
    });
    if (!asset) return null;

    let audioUrl = asset.audioUrl;
    if (asset.status === 'ready' && asset.audioUrl) {
      const isOwner =
        lesson.section.course.instructorId === userId || userRole === 'admin';
      // Bài preview / chủ sở hữu / admin dùng URL công khai; còn lại ký tạm thời.
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

  /** Đưa bài học vào hàng đợi tạo (hoặc tạo lại) podcast bằng AI. */
  async generate(lessonId: string, userId: string, userRole: string) {
    const lesson = await this.assertLessonAccess(lessonId, userId, userRole);
    const source = await this.collectLessonContent(lessonId, lesson);
    if (source.length < MIN_SOURCE_CHARS) {
      throw new UnprocessableEntityException(
        'Bài học chưa có đủ nội dung để tạo podcast',
      );
    }

    await this.prisma.podcastAsset.upsert({
      where: { lessonId },
      update: { status: 'pending', errorMsg: null },
      create: { lessonId, status: 'pending' },
    });
    await this.queue.add(
      'generate',
      { lessonId },
      { removeOnComplete: true, removeOnFail: 50 },
    );
    return { status: 'pending' };
  }

  // ─── Helpers (dùng chung với processor) ───────────────────────────────────────

  /** Chỉ cho bài dạng đọc (document); giảng viên sở hữu/admin hoặc học viên đang học. */
  async assertLessonAccess(
    lessonId: string,
    userId: string,
    userRole: string,
  ): Promise<PodcastLesson> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        section: { include: { course: true } },
        documentAsset: true,
      },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    if (lesson.type !== 'document') {
      throw new UnprocessableEntityException(
        'Chỉ bài đọc (tài liệu) mới hỗ trợ tạo podcast',
      );
    }

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
    return lesson as unknown as PodcastLesson;
  }

  /** Gom nội dung nguồn: chunk đã index > nội dung tài liệu thô. */
  async collectLessonContent(
    lessonId: string,
    lesson: {
      title: string;
      description: string | null;
      documentAsset: { contentHtml: string | null } | null;
    },
  ): Promise<string> {
    const parts: string[] = [];
    if (lesson.title) parts.push(lesson.title);
    if (lesson.description) parts.push(lesson.description);

    const chunks = await this.prisma.courseChunk.findMany({
      where: { lessonId },
      orderBy: { chunkIndex: 'asc' },
      select: { content: true },
    });
    for (const c of chunks) parts.push(c.content);

    if (lesson.documentAsset?.contentHtml) {
      parts.push(this.stripHtml(lesson.documentAsset.contentHtml));
    }

    return parts
      .map((p) => p.trim())
      .filter(Boolean)
      .join('\n\n')
      .slice(0, MAX_SOURCE_CHARS);
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Sinh kịch bản lời dẫn podcast (văn xuôi thuần) từ nội dung bài học. */
  async generateScript(lessonTitle: string, source: string): Promise<string> {
    const systemInstruction =
      'Bạn là người dẫn một podcast giáo dục bằng tiếng Việt. ' +
      'Viết kịch bản lời dẫn tự nhiên, mạch lạc, dễ nghe, chỉ dựa trên nội dung bài học được cung cấp. ' +
      'CHỈ trả về văn xuôi thuần để đọc thành tiếng: KHÔNG markdown, KHÔNG tiêu đề, KHÔNG ký hiệu *,#,- hay nhãn người nói.';

    const prompt = `Hãy viết kịch bản cho một tập podcast ngắn (khoảng 2–4 phút khi đọc) tóm tắt và giảng lại nội dung bài học dưới đây cho người nghe.

Yêu cầu:
- Mở đầu chào người nghe và giới thiệu chủ đề.
- Trình bày các ý chính theo trình tự dễ hiểu, có ví dụ/giải thích ngắn nếu cần.
- Kết thúc bằng phần tóm tắt nhanh các điểm cần nhớ.
- Văn nói tự nhiên, một người dẫn duy nhất, KHÔNG dùng markdown hay ký hiệu định dạng.
- Chỉ dùng thông tin có trong nội dung bài học.

Tiêu đề bài học: ${lessonTitle}

Nội dung bài học:
"""
${source}
"""`;

    const raw = await this.gemini.generate(prompt, {
      temperature: 0.6,
      maxOutputTokens: 2048,
      systemInstruction,
    });
    return this.cleanScript(raw);
  }

  /** Loại bỏ markdown/ký hiệu còn sót để giọng đọc không phát ra ký tự thừa. */
  private cleanScript(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/[*_#`>]/g, '')
      .replace(/^\s*[-•]\s+/gm, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }
}
