import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { GeminiService } from '../ai/gemini.service';
import {
  wrapUntrusted,
  neutralizeInline,
  UNTRUSTED_DATA_RULE,
} from '../ai/prompt-safety.util';
import { stripHtml } from '../common/sanitize-html.util';
import {
  LESSON_VIDEO_QUEUE,
  GenerateLessonVideoJob,
} from './lesson-video.queue';

const MIN_SOURCE_CHARS = 100;
const MAX_SOURCE_CHARS = 16000;
const SIGNED_URL_TTL = 4 * 60 * 60;

export interface VideoSection {
  title: string;
  narration: string;
  bullets: string[];
}

interface VideoLesson {
  id: string;
  title: string;
  description: string | null;
  type: string;
  isPreview: boolean;
  documentAsset: { contentHtml: string | null } | null;
  section: { course: { id: string; instructorId: string } };
}

@Injectable()
export class LessonVideoService {
  private readonly logger = new Logger(LessonVideoService.name);
  private readonly enabled: boolean;
  private readonly targetSec: number;
  private readonly model: string;

  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private gemini: GeminiService,
    config: ConfigService,
    @InjectQueue(LESSON_VIDEO_QUEUE)
    private queue: Queue<GenerateLessonVideoJob>,
  ) {
    this.enabled = config.get<string>('AI_VIDEO_ENABLED', 'false') === 'true';
    this.targetSec = config.get<number>('AI_VIDEO_TARGET_SEC', 150);
    this.model = config.get<string>('AI_VIDEO_MODEL', '');
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  /** Lấy video AI của bài (kèm URL đã ký nếu sẵn sàng), hoặc null. */
  async getVideo(lessonId: string, userId: string, userRole: string) {
    const lesson = await this.assertLessonAccess(lessonId, userId, userRole);
    const asset = await this.prisma.lessonVideoAsset.findUnique({
      where: { lessonId },
    });
    if (!asset) return null;

    let videoUrl = asset.videoUrl;
    if (asset.status === 'ready' && asset.videoUrl) {
      const isOwner =
        lesson.section.course.instructorId === userId || userRole === 'admin';
      if (!isOwner && !lesson.isPreview) {
        const key = this.storage.extractKeyFromUrl(asset.videoUrl);
        videoUrl = await this.storage.getSignedUrl(key, SIGNED_URL_TTL);
      }
    }
    return {
      status: asset.status,
      videoUrl,
      durationSec: asset.durationSec,
      sections: asset.sectionsJson,
      errorMsg: asset.errorMsg,
      updatedAt: asset.updatedAt,
    };
  }

  /** Đưa vào hàng đợi tạo (hoặc tạo lại) video cho 1 bài đọc. */
  async enqueueForLesson(lessonId: string): Promise<boolean> {
    if (!this.enabled) return false;
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { documentAsset: { select: { contentHtml: true } } },
    });
    if (!lesson || lesson.type !== 'document') return false;
    if (this.collectContent(lesson).length < MIN_SOURCE_CHARS) {
      this.logger.log(`Lesson ${lessonId} không đủ nội dung — bỏ qua tạo video`);
      return false;
    }

    await this.prisma.lessonVideoAsset.upsert({
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

  /** Khi khóa được duyệt xuất bản: tạo video cho mọi bài đọc trong khóa. */
  async enqueueForCourse(courseId: string): Promise<void> {
    if (!this.enabled) {
      this.logger.log('AI_VIDEO_ENABLED=false — bỏ qua tạo video cho khóa');
      return;
    }
    const lessons = await this.prisma.lesson.findMany({
      where: { type: 'document', section: { courseId } },
      select: { id: true },
    });
    for (const l of lessons) {
      await this.enqueueForLesson(l.id).catch((err) =>
        this.logger.warn(
          `enqueue video ${l.id} lỗi: ${(err as Error).message}`,
        ),
      );
    }
  }

  // ─── Helpers (dùng chung với processor) ───────────────────────────────────────

  async assertLessonAccess(
    lessonId: string,
    userId: string,
    userRole: string,
  ): Promise<VideoLesson> {
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
    return lesson as unknown as VideoLesson;
  }

  collectContent(lesson: {
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

  /**
   * LLM Ollama tóm tắt bài → kịch bản chia section (JSON). Mỗi section có lời dẫn
   * (narration) để TTS đọc + bullet hiển thị trên màn hình. Tổng thời lượng ~target.
   */
  async buildVideoScript(
    lessonTitle: string,
    source: string,
  ): Promise<VideoSection[]> {
    // ~140 từ/phút tiếng Việt → số từ mục tiêu cho cả video.
    const targetWords = Math.round((this.targetSec / 60) * 140);
    const sectionCount = Math.min(
      12,
      Math.max(6, Math.round(this.targetSec / 18)),
    );

    const systemInstruction =
      'You are a Vietnamese educational video scriptwriter AND a careful translator. ' +
      'The lesson content may be written in another language (e.g. English). ' +
      'Translate its MEANING accurately into natural Vietnamese — never mistranslate, ' +
      'never confuse two distinct concepts, and keep the original technical term in ' +
      'parentheses when it helps clarity. Always fill the "reasoning" field FIRST ' +
      '(think before writing the sections). Return ONLY the JSON object. ' +
      UNTRUSTED_DATA_RULE;

    // Structured output (Ollama) ⇒ JSON luôn hợp lệ. Field "reasoning" buộc model
    // SUY LUẬN trước (đặt đầu schema) rồi mới điền "sections".
    const schema = {
      type: 'object',
      properties: {
        reasoning: { type: 'string' },
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              narration: { type: 'string' },
              bullets: { type: 'array', items: { type: 'string' } },
            },
            required: ['title', 'narration', 'bullets'],
          },
        },
      },
      required: ['reasoning', 'sections'],
    };

    const prompt = `Tạo kịch bản video giảng giải ngắn (~${this.targetSec} giây, ~${targetWords} từ lời dẫn) cho bài học dưới đây, dành cho người Việt. Trả về JSON đúng schema.

BƯỚC 1 — "reasoning" (suy luận, BẮT BUỘC điền trước): phân tích nội dung bài:
- Liệt kê các khái niệm/ý chính theo đúng thứ tự xuất hiện.
- Với mỗi khái niệm, ghi NGHĨA TIẾNG VIỆT CHÍNH XÁC. Nếu nguồn là tiếng Anh, dịch đúng nghĩa và PHÂN BIỆT RÕ các khái niệm gần giống nhau (vd "Usable" = dễ sử dụng, KHÁC "Useful" = hữu ích; không dịch trùng).
- Tự kiểm tra: không bịa thông tin ngoài bài, không dịch sai ý.

BƯỚC 2 — "sections" (dựa trên reasoning ở trên):
- Khoảng ${sectionCount} section nối mạch theo trình tự nội dung bài.
- "title": tiêu đề ngắn (3–7 từ); thuật ngữ chuyên ngành nên kèm gốc trong ngoặc, vd "Dễ sử dụng (Usable)".
- "narration": lời dẫn văn xuôi để đọc thành tiếng (2–4 câu), dịch SÁT NGHĨA gốc, KHÔNG ký hiệu markdown.
- "bullets": 2–4 ý ngắn (mỗi ý ≤ 12 từ).
- KHÔNG gộp hai khái niệm khác nhau vào cùng một section.
- Chỉ dùng thông tin trong bài. Toàn bộ tiếng Việt (trừ thuật ngữ gốc trong ngoặc).

Tiêu đề bài: ${neutralizeInline(lessonTitle, 300)}

Nội dung bài:
${wrapUntrusted(source, 'lesson')}`;

    const raw = await this.gemini.generate(prompt, {
      provider: 'ollama',
      ...(this.model ? { model: this.model } : {}),
      temperature: 0.4,
      maxOutputTokens: 6144,
      systemInstruction,
      format: schema,
    });

    return this.parseSections(raw);
  }

  private parseSections(raw: string): VideoSection[] {
    let text = raw.trim();
    // Bỏ phần SUY LUẬN (thinking) trước marker ===JSON=== — chỉ giữ phần kết quả.
    const markerMatches = [...text.matchAll(/===\s*JSON\s*===/gi)];
    if (markerMatches.length > 0) {
      const last = markerMatches[markerMatches.length - 1];
      text = text.slice(last.index! + last[0].length).trim();
    }
    // Bóc code fence nếu model lỡ thêm.
    text = text.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    // Lấy đúng object JSON cân bằng dấu ngoặc đầu tiên (model nhỏ hay thừa '}' /
    // thêm lời dẫn ở cuối → không dùng lastIndexOf được).
    const json = this.extractBalancedJson(text);
    if (json) text = json;

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      this.logger.warn(
        `Kịch bản video không phải JSON hợp lệ (raw len=${raw.length}): ${raw.slice(0, 300)}`,
      );
      throw new Error('LLM không trả về JSON kịch bản hợp lệ');
    }
    const sections = (parsed as { sections?: unknown }).sections;
    if (!Array.isArray(sections) || sections.length === 0) {
      throw new Error('Kịch bản video rỗng');
    }
    const cleaned: VideoSection[] = [];
    for (const s of sections) {
      const sec = s as Record<string, unknown>;
      const title = String(sec.title ?? '').trim();
      const narration = String(sec.narration ?? '').trim();
      const bullets = Array.isArray(sec.bullets)
        ? sec.bullets.map((b) => String(b).trim()).filter(Boolean).slice(0, 5)
        : [];
      if (narration) {
        cleaned.push({ title: title || 'Nội dung', narration, bullets });
      }
    }
    if (cleaned.length === 0) throw new Error('Kịch bản video không có lời dẫn');
    return cleaned;
  }

  /** Trả về object JSON đầu tiên có dấu ngoặc cân bằng (bỏ qua '{' '}' trong chuỗi). */
  private extractBalancedJson(text: string): string | null {
    const start = text.indexOf('{');
    if (start < 0) return null;
    let depth = 0;
    let inStr = false;
    let esc = false;
    for (let i = start; i < text.length; i++) {
      const ch = text[i];
      if (inStr) {
        if (esc) esc = false;
        else if (ch === '\\') esc = true;
        else if (ch === '"') inStr = false;
      } else if (ch === '"') {
        inStr = true;
      } else if (ch === '{') {
        depth++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) return text.slice(start, i + 1);
      }
    }
    return null;
  }
}
