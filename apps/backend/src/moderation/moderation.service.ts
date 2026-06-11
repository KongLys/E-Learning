import {
  Injectable,
  Logger,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';

export type ModerationLabel = 'it' | 'spam_toxic' | 'others';
export type ContentType = 'course' | 'lesson';

interface ClassifyResponse {
  label: ModerationLabel;
  allowed: boolean;
  scores: Record<string, number>;
  perSegment?: unknown[];
}

export interface ModerationOutcome {
  status: 'approved' | 'rejected' | 'pending';
  label?: ModerationLabel;
  score?: number;
  reason?: string;
}

const REASONS: Record<ModerationLabel, string | null> = {
  it: null,
  spam_toxic: 'Nội dung không phù hợp — bị phát hiện là spam hoặc có nội dung độc hại.',
  others:
    'Nội dung không phù hợp — không thuộc lĩnh vực Công nghệ thông tin nên không được duyệt.',
};

const PENDING_REASON =
  'Đang chờ kiểm duyệt thủ công (dịch vụ kiểm duyệt tạm thời không khả dụng).';

@Injectable()
export class ModerationService {
  private readonly logger = new Logger(ModerationService.name);
  private readonly enabled: boolean;
  private readonly serviceUrl: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly failOpen: boolean;
  private readonly debugEnabled: boolean;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private events: EventEmitter2,
  ) {
    this.enabled = config.get<string>('MODERATION_ENABLED', 'true') === 'true';
    this.serviceUrl = config.get<string>(
      'MODERATION_SERVICE_URL',
      'http://localhost:8000',
    );
    this.apiKey = config.get<string>('MODERATION_API_KEY', '');
    this.timeoutMs = config.get<number>('MODERATION_TIMEOUT_MS', 15000);
    this.failOpen =
      config.get<string>('MODERATION_FAIL_OPEN', 'true') === 'true';
    this.debugEnabled =
      config.get<string>('MODERATION_DEBUG', 'false') === 'true';
  }

  /**
   * Verbose step-by-step logging, toggled by the `MODERATION_DEBUG` env flag.
   * Use this everywhere in the moderation flow so the whole process can be
   * followed in the backend logs without changing code.
   */
  debugLog(message: string, data?: Record<string, unknown>) {
    if (!this.debugEnabled) return;
    this.logger.log(
      data
        ? `[moderation] ${message} ${JSON.stringify(data)}`
        : `[moderation] ${message}`,
    );
  }

  // ─── Classification ──────────────────────────────────────────────────────

  /**
   * Sample representative chunks for classification: 2 first + 5 random middle
   * + 2 last. With <= 9 chunks, all are used.
   */
  sampleChunks<T>(chunks: T[]): T[] {
    const n = chunks.length;
    if (n <= 9) return [...chunks];
    const picked = new Set<number>([0, 1, n - 2, n - 1]);
    const middle: number[] = [];
    for (let i = 2; i < n - 2; i++) middle.push(i);
    // Fisher–Yates partial shuffle to pick 5 distinct middle indices.
    for (let i = middle.length - 1; i > 0 && picked.size < 9; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [middle[i], middle[j]] = [middle[j], middle[i]];
    }
    for (let i = 0; i < middle.length && picked.size < 9; i++)
      picked.add(middle[i]);
    return [...picked].sort((a, b) => a - b).map((idx) => chunks[idx]);
  }

  /** Calls the Python service. Returns null when the service is unavailable. */
  private async classify(segments: string[]): Promise<ClassifyResponse | null> {
    const clean = segments.map((s) => (s ?? '').trim()).filter(Boolean);
    if (clean.length === 0) {
      this.debugLog('classify skipped — no non-empty segments');
      return null;
    }

    this.debugLog('→ calling classifier service', {
      url: `${this.serviceUrl}/v1/classify`,
      segments: clean.length,
      totalChars: clean.reduce((n, s) => n + s.length, 0),
    });

    const startedAt = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await fetch(`${this.serviceUrl}/v1/classify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(this.apiKey ? { 'X-Api-Key': this.apiKey } : {}),
        },
        body: JSON.stringify({ segments: clean }),
        signal: controller.signal,
      });
      if (!res.ok) {
        this.logger.warn(`Moderation service returned ${res.status}`);
        return null;
      }
      const json = (await res.json()) as unknown;
      if (!this.isValidClassifyResponse(json)) {
        this.logger.warn('Moderation service returned a malformed response');
        return null;
      }
      this.debugLog('← classifier response', {
        label: json.label,
        allowed: json.allowed,
        scores: json.scores,
        ms: Date.now() - startedAt,
      });
      return json;
    } catch (err) {
      this.logger.warn(
        `Moderation service call failed: ${(err as Error).message}`,
      );
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Runtime shape check so a malformed service response is treated as "unavailable". */
  private isValidClassifyResponse(v: unknown): v is ClassifyResponse {
    if (!v || typeof v !== 'object') return false;
    const r = v as Record<string, unknown>;
    return (
      (r.label === 'it' || r.label === 'spam_toxic' || r.label === 'others') &&
      typeof r.allowed === 'boolean' &&
      typeof r.scores === 'object' &&
      r.scores !== null
    );
  }

  /** Classify text and map to a stored moderation outcome. */
  async evaluate(segments: string[]): Promise<ModerationOutcome> {
    if (!this.enabled) {
      this.debugLog(
        'evaluate skipped — MODERATION_ENABLED=false → auto-approve',
      );
      return { status: 'approved' };
    }

    const result = await this.classify(segments);
    let outcome: ModerationOutcome;
    if (!result) {
      // Service down: fail-open keeps content pending for manual review;
      // fail-closed rejects outright.
      outcome = this.failOpen
        ? { status: 'pending', reason: PENDING_REASON }
        : {
            status: 'rejected',
            label: 'others',
            reason: REASONS.others ?? undefined,
          };
      this.debugLog('evaluate → service unavailable', {
        failOpen: this.failOpen,
        status: outcome.status,
      });
      return outcome;
    }

    const score = result.scores?.[result.label];
    if (result.allowed) {
      outcome = { status: 'approved', label: result.label, score };
    } else {
      outcome = {
        status: 'rejected',
        label: result.label,
        score,
        reason: REASONS[result.label] ?? REASONS.others ?? undefined,
      };
    }
    this.debugLog('evaluate → outcome', {
      status: outcome.status,
      label: outcome.label,
      score: outcome.score,
    });
    return outcome;
  }

  /**
   * Classify a course's title/description, persist the verdict, and notify the
   * instructor on rejection. Called synchronously from course create/update.
   */
  async moderateCourse(
    courseId: string,
    instructorId: string,
    title: string,
    description?: string | null,
  ): Promise<ModerationOutcome> {
    this.debugLog('moderateCourse: start', {
      courseId,
      titleLen: title.length,
    });
    const text = [title, description].filter(Boolean).join('\n');
    const outcome = await this.evaluate([text]);
    await this.prisma.course.update({
      where: { id: courseId },
      data: {
        moderationStatus: outcome.status,
        moderationLabel: outcome.label ?? null,
        moderationScore: outcome.score ?? null,
        moderationReason: outcome.reason ?? null,
        appealReason: null,
        moderatedAt: new Date(),
      },
    });
    if (outcome.status !== 'approved') {
      this.events.emit('moderation.rejected', {
        ownerId: instructorId,
        contentType: 'course' as ContentType,
        contentId: courseId,
        title,
        status: outcome.status,
        reason: outcome.reason,
      });
    }
    this.debugLog('moderateCourse: done', {
      courseId,
      status: outcome.status,
      label: outcome.label,
    });
    return outcome;
  }

  // ─── Instructor appeal flow ──────────────────────────────────────────────

  async appealCourse(
    courseId: string,
    userId: string,
    role: string,
    reason?: string,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    this.assertOwner(course.instructorId, userId, role);
    if (course.moderationStatus !== 'rejected') {
      throw new BadRequestException(
        'Chỉ nội dung bị từ chối mới có thể kiến nghị duyệt lại',
      );
    }
    const updated = await this.prisma.course.update({
      where: { id: courseId },
      data: { moderationStatus: 'appealing', appealReason: reason ?? null },
    });
    this.events.emit('moderation.appeal', {
      contentType: 'course' as ContentType,
      contentId: courseId,
      title: course.title,
    });
    this.debugLog('appealCourse', { courseId, by: userId });
    return this.serializeCourse(updated);
  }

  async appealLesson(
    lessonId: string,
    userId: string,
    role: string,
    reason?: string,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        section: { select: { course: { select: { instructorId: true } } } },
      },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    this.assertOwner(lesson.section.course.instructorId, userId, role);
    if (lesson.moderationStatus !== 'rejected') {
      throw new BadRequestException(
        'Chỉ bài học bị từ chối mới có thể kiến nghị duyệt lại',
      );
    }
    const updated = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: { moderationStatus: 'appealing', appealReason: reason ?? null },
    });
    this.events.emit('moderation.appeal', {
      contentType: 'lesson' as ContentType,
      contentId: lessonId,
      title: lesson.title,
    });
    this.debugLog('appealLesson', { lessonId, by: userId });
    return { id: updated.id, moderationStatus: updated.moderationStatus };
  }

  // ─── Admin review flow ───────────────────────────────────────────────────

  async listForReview(query: { status?: string; type?: ContentType }) {
    const statuses = (
      query.status ? [query.status] : ['pending', 'rejected', 'appealing']
    ) as ('pending' | 'rejected' | 'appealing')[];
    const where = { moderationStatus: { in: statuses } };

    const wantCourses = !query.type || query.type === 'course';
    const wantLessons = !query.type || query.type === 'lesson';

    const [courses, lessons] = await Promise.all([
      wantCourses
        ? this.prisma.course.findMany({
            where,
            orderBy: { moderatedAt: 'desc' },
            include: {
              instructor: { select: { id: true, fullName: true, email: true } },
            },
          })
        : Promise.resolve([]),
      wantLessons
        ? this.prisma.lesson.findMany({
            // Chỉ đưa vào hàng chờ những bài đã có kết quả phân lớp / kiến nghị,
            // bỏ qua 'pending' thuần (chưa từng index) để admin không bị ngợp.
            where: { ...where, moderatedAt: { not: null } },
            orderBy: { moderatedAt: 'desc' },
            include: {
              documentAsset: { select: { markdownUrl: true } },
              section: {
                select: {
                  title: true,
                  course: {
                    select: {
                      id: true,
                      title: true,
                      instructor: {
                        select: { id: true, fullName: true, email: true },
                      },
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve([]),
    ]);

    return {
      courses: courses.map((c) => this.serializeCourse(c)),
      lessons: lessons.map((l) => ({
        id: l.id,
        title: l.title,
        courseId: l.section.course.id,
        courseTitle: l.section.course.title,
        sectionTitle: l.section.title,
        markdownUrl: l.documentAsset?.markdownUrl ?? null,
        instructor: l.section.course.instructor,
        moderationStatus: l.moderationStatus,
        moderationLabel: l.moderationLabel,
        moderationScore: l.moderationScore,
        moderationReason: l.moderationReason,
        appealReason: l.appealReason,
        moderatedAt: l.moderatedAt,
      })),
    };
  }

  async approve(type: ContentType, id: string) {
    this.debugLog('admin approve', { type, id });
    if (type === 'course') {
      const course = await this.prisma.course.update({
        where: { id },
        data: {
          moderationStatus: 'approved',
          moderationReason: null,
          moderatedAt: new Date(),
        },
      });
      this.emitResolved(
        course.instructorId,
        'course',
        id,
        course.title,
        'approved',
      );
      return { id, moderationStatus: 'approved' };
    }
    const lesson = await this.prisma.lesson.update({
      where: { id },
      data: {
        moderationStatus: 'approved',
        moderationReason: null,
        moderatedAt: new Date(),
      },
      include: {
        section: { select: { course: { select: { instructorId: true } } } },
      },
    });
    this.emitResolved(
      lesson.section.course.instructorId,
      'lesson',
      id,
      lesson.title,
      'approved',
    );
    // Re-run indexing now that the lesson is allowed (handled by LessonService listener).
    this.events.emit('moderation.lesson.reindex', { lessonId: id });
    return { id, moderationStatus: 'approved' };
  }

  async reject(type: ContentType, id: string, reason?: string) {
    this.debugLog('admin reject (lock)', { type, id });
    const finalReason =
      reason ?? 'Nội dung không phù hợp với quy định của hệ thống.';
    if (type === 'course') {
      const course = await this.prisma.course.update({
        where: { id },
        data: {
          moderationStatus: 'locked',
          moderationReason: finalReason,
          moderatedAt: new Date(),
        },
      });
      this.emitResolved(
        course.instructorId,
        'course',
        id,
        course.title,
        'locked',
        finalReason,
      );
      return { id, moderationStatus: 'locked' };
    }
    const lesson = await this.prisma.lesson.update({
      where: { id },
      data: {
        moderationStatus: 'locked',
        moderationReason: finalReason,
        moderatedAt: new Date(),
      },
      include: {
        section: { select: { course: { select: { instructorId: true } } } },
      },
    });
    // Bài bị khóa không được phép tồn tại trong vector store (kể cả khi đã index trước đó).
    await this.prisma.courseChunk.deleteMany({ where: { lessonId: id } });
    this.emitResolved(
      lesson.section.course.instructorId,
      'lesson',
      id,
      lesson.title,
      'locked',
      finalReason,
    );
    return { id, moderationStatus: 'locked' };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────

  private emitResolved(
    ownerId: string,
    contentType: ContentType,
    contentId: string,
    title: string,
    decision: 'approved' | 'locked',
    reason?: string,
  ) {
    this.events.emit('moderation.resolved', {
      ownerId,
      contentType,
      contentId,
      title,
      decision,
      reason,
    });
  }

  private assertOwner(ownerId: string, userId: string, role: string) {
    if (role !== 'admin' && ownerId !== userId) {
      throw new ForbiddenException('Access denied');
    }
  }

  private serializeCourse(c: {
    id: string;
    title: string;
    instructorId: string;
    moderationStatus: string;
    moderationLabel: string | null;
    moderationScore: number | null;
    moderationReason: string | null;
    appealReason: string | null;
    moderatedAt: Date | null;
    instructor?: { id: string; fullName: string; email: string };
  }) {
    return {
      id: c.id,
      title: c.title,
      instructorId: c.instructorId,
      instructor: c.instructor,
      moderationStatus: c.moderationStatus,
      moderationLabel: c.moderationLabel,
      moderationScore: c.moderationScore,
      moderationReason: c.moderationReason,
      appealReason: c.appealReason,
      moderatedAt: c.moderatedAt,
    };
  }
}
