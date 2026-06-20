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
import {
  wrapUntrusted,
  neutralizeInline,
  UNTRUSTED_DATA_RULE,
} from '../ai/prompt-safety.util';
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
  ) { }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /**
   * Danh sách podcast (theo bài học) đã tạo trong khoá — mới nhất trước.
   * Podcast dùng chung mỗi bài, không gắn user nên trả về theo khoá.
   * Không ký URL audio ở đây (tránh ký N lần) — bấm nghe sẽ gọi getPodcast.
   */
  async listByCourse(courseId: string, userId: string, userRole: string) {
    await this.assertCourseAccess(courseId, userId, userRole);
    const assets = await this.prisma.podcastAsset.findMany({
      where: { lesson: { section: { courseId } } },
      orderBy: { updatedAt: 'desc' },
      select: {
        lessonId: true,
        status: true,
        durationSec: true,
        errorMsg: true,
        createdAt: true,
        updatedAt: true,
        lesson: { select: { title: true } },
      },
    });
    return assets.map((a) => ({
      lessonId: a.lessonId,
      lessonTitle: a.lesson?.title ?? '',
      status: a.status,
      durationSec: a.durationSec,
      errorMsg: a.errorMsg,
      updatedAt: a.updatedAt,
    }));
  }

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

  /** Cho phép giảng viên sở hữu / admin HOẶC học viên đang theo học khoá đó. */
  private async assertCourseAccess(
    courseId: string,
    userId: string,
    userRole: string,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, instructorId: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId === userId || userRole === 'admin') return;

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId: userId, courseId, status: 'active' },
    });
    if (!enrollment) {
      throw new ForbiddenException('Not enrolled in this course');
    }
  }

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
  async generateScript(
    lessonTitle: string,
    source: string,
    raptorSummary?: string | null,
  ): Promise<string> {
    const systemInstruction =
      'You are the host of a Vietnamese-language educational podcast. ' +
      'Write a natural, fluent narration script based solely on the provided lesson content. ' +
      'Output ONLY plain prose ready to be read aloud in Vietnamese: NO markdown, NO headings, NO symbols like *,#,-, and NO speaker labels. ' +
      UNTRUSTED_DATA_RULE;

    const overviewBlock = raptorSummary
      ? `\nLesson overview (use as structural guide):\n${wrapUntrusted(raptorSummary, 'overview')}\n`
      : '';

    const prompt = `Write a podcast script (approximately 3–4 minutes when read aloud) that walks through the main content of the lesson below for a Vietnamese-speaking audience.

Requirements:
- Open by greeting the listener and briefly introducing the topic.
- After the introduction, identify the real-world problems or challenges that this lesson addresses — explain concretely what goes wrong without this knowledge, or what question/need motivates the topic. Only mention problems that are explicitly or implicitly present in the lesson content.
- Guide the listener through the lesson's concepts in the order they appear, using natural spoken transitions between them (e.g. "Từ đó dẫn đến…", "Liên quan đến điều này…", "Một điểm quan trọng khác là…"). Do NOT announce numbered sections, headings, or labels like "Phần 1", "Ý thứ hai", "Tiếp theo chúng ta có mục…". The flow must feel like a continuous conversation, not a structured list.
- For each concept: name it naturally within the flow of speech, then explain the actual mechanism or process — how it works step by step, what its internal logic is, what conditions apply. Include concrete examples or numbers from the content where available.
- DEPTH RULE: Every explanation must go into the actual "how" and "why", not just state that something exists or is important. If the lesson explains a process, describe that process. If it explains a formula or algorithm, walk through it. If it compares options, state the differences and trade-offs.
- FORBIDDEN patterns — never write sentences of these forms:
  • "Sau khi học xong / đọc xong bài này, bạn sẽ…"
  • "Bài học giúp bạn hiểu / nắm được / áp dụng được…"
  • "Nội dung này trang bị cho bạn…"
  • Any sentence that promises future understanding instead of delivering the explanation right now.
  Instead, deliver the explanation immediately and directly.
- IGNORE peripheral material that is not part of the core lesson: author bios, publication dates, "further reading" lists, references, footnotes, acknowledgements, and any section that is purely administrative.
- Close with a brief recap that names the key points covered — do not introduce new information here.
- Use natural spoken Vietnamese, a single host voice, NO markdown or formatting symbols.
- Use ONLY information found in the lesson content. Do not add outside knowledge.
- The entire output must be in Vietnamese.

Lesson title: ${neutralizeInline(lessonTitle, 300)}
${overviewBlock}
Lesson content:
${wrapUntrusted(source, 'lesson')}`;

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
