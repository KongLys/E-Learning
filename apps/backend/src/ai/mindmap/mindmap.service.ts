import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../providers/gemini.service';
import {
  wrapUntrusted,
  neutralizeInline,
  UNTRUSTED_DATA_RULE,
} from '../guard/prompt-safety.util';
import {
  buildTree,
  ChunkInput,
  ContentGroup,
  GroupSummary,
  groupByHeading,
  groupSequential,
  toMarkmap,
  toMermaid,
  toXmind,
} from './mindmap-builder';
import { MINDMAP_QUEUE, GenerateMindmapJob } from './mindmap.queue';
import { kmeans } from '../common/clustering.util';

/** Cap on summarised leaves → bounds LLM calls & keeps the map readable. */
const MAX_GROUPS = 80;
/** No-heading fallback: how many sequential/clustered topics to form. */
const FALLBACK_GROUPS = 12;
/** Per-group content cap (chars) fed to the LLM, to bound token cost. */
const GROUP_CONTENT_CAP = 4000;
/** Greedy batch budget (chars) — multiple small groups summarised in one call. */
const BATCH_CHAR_BUDGET = 6000;

/**
 * Mind map TOÀN KHÓA dựng từ phân vùng TOC của các bài học: mỗi chunk mang
 * đường dẫn "Phần > Bài > Đề mục" nên cây Khóa → Phần → Bài → đề mục được
 * tái tạo miễn phí từ heading path; AI chỉ tốn token ở bước tóm tắt nhóm.
 */
@Injectable()
export class MindmapService {
  private readonly logger = new Logger(MindmapService.name);

  constructor(
    private prisma: PrismaService,
    private gemini: GeminiService,
    @InjectQueue(MINDMAP_QUEUE) private queue: Queue<GenerateMindmapJob>,
  ) {}

  // ─── Access control (mirrors AiChatService: instructor owner or enrolled) ───

  private async assertAccess(
    courseId: string,
    userId: string,
  ): Promise<{ title: string }> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { instructorId: true, title: true },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId === userId) return { title: course.title };

    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId: userId, courseId } },
      select: { id: true },
    });
    if (!enrollment) {
      throw new ForbiddenException(
        'Bạn cần ghi danh khóa học để dùng tính năng này',
      );
    }
    return { title: course.title };
  }

  // ─── Read ───────────────────────────────────────────────────────────────────

  async getMindmap(courseId: string, userId: string) {
    await this.assertAccess(courseId, userId);
    const mm = await this.prisma.courseMindmap.findUnique({
      where: { courseId },
    });
    if (!mm) {
      return { status: 'pending' as const };
    }
    return {
      status: mm.status,
      title: mm.title,
      structure: mm.structure,
      markmap: mm.markmap,
      errorMsg: mm.errorMsg,
      updatedAt: mm.updatedAt,
    };
  }

  // ─── Trigger generation ──────────────────────────────────────────────────────

  async requestMindmap(courseId: string, userId: string, force = false) {
    const course = await this.assertAccess(courseId, userId);

    // Nguồn của mind map là các chunk bài học đã index (đã qua kiểm duyệt).
    const stats = await this.prisma.courseChunk.aggregate({
      where: { courseId },
      _count: { id: true },
      _max: { createdAt: true },
    });
    if (stats._count.id === 0) {
      throw new BadRequestException(
        'Khóa học chưa có nội dung bài học được xử lý cho AI (cần soạn nội dung hoặc đính kèm tài liệu và chờ index xong)',
      );
    }

    const sourceHash = `${stats._count.id}:${stats._max.createdAt?.getTime() ?? 0}`;
    const existing = await this.prisma.courseMindmap.findUnique({
      where: { courseId },
    });

    // Cache hit: same source & already built → no tokens spent.
    if (
      !force &&
      existing &&
      existing.status === 'ready' &&
      existing.sourceHash === sourceHash
    ) {
      return { status: 'ready' as const, cached: true };
    }
    // Already running → don't enqueue twice.
    if (!force && existing && existing.status === 'generating') {
      return { status: 'generating' as const };
    }

    await this.prisma.courseMindmap.upsert({
      where: { courseId },
      create: {
        courseId,
        title: course.title,
        structure: {},
        markmap: '',
        status: 'pending',
        sourceHash,
      },
      update: { status: 'pending', sourceHash, errorMsg: null },
    });

    await this.queue.add(
      'generate',
      { courseId },
      {
        jobId: `mindmap-${courseId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 8_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    );
    return { status: 'pending' as const };
  }

  // ─── Generation (called by the BullMQ processor) ─────────────────────────────

  async generate(courseId: string, onProgress?: (p: number) => Promise<void>) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true },
    });
    if (!course) throw new Error(`Course ${courseId} not found`);

    await this.prisma.courseMindmap.update({
      where: { courseId },
      data: { status: 'generating', errorMsg: null },
    });
    await onProgress?.(10);

    const chunks = await this.loadOrderedChunks(courseId);
    if (chunks.length === 0) {
      throw new Error('Khóa học chưa có nội dung đã xử lý (không có chunk)');
    }

    // Step 1 (0 token): form leaf groups — by heading, else by embedding clusters.
    const groups = await this.buildGroups(courseId, chunks);
    await onProgress?.(30);

    // Step 2 (AI): summarise each group, batching small ones together.
    const { summaries, tokenUsage } = await this.summarizeGroups(groups);
    await onProgress?.(80);

    // Step 3 (0 token): assemble canonical tree + derive export formats.
    const root = buildTree(
      course.title,
      groups.map((g, i) => ({
        path: g.path,
        summary: summaries[i],
      })),
    );
    const markmap = toMarkmap(root);
    const structure = {
      ...root,
      formats: { mermaid: toMermaid(root), xmind: toXmind(root) },
    } as unknown as Prisma.InputJsonValue;

    await this.prisma.courseMindmap.update({
      where: { courseId },
      data: {
        title: root.title,
        structure,
        markmap,
        status: 'ready',
        tokenUsage,
        errorMsg: null,
      },
    });
    await onProgress?.(100);
    this.logger.log(
      `Mindmap ready for course ${courseId}: ${groups.length} groups, ~${tokenUsage} tokens`,
    );
  }

  async markFailed(courseId: string, message: string) {
    await this.prisma.courseMindmap
      .update({
        where: { courseId },
        data: { status: 'failed', errorMsg: message.slice(0, 500) },
      })
      .catch(() => undefined);
  }

  /**
   * Chunks của cả khóa, sắp theo đúng trình tự giáo trình
   * (Phần.orderIndex → Bài.orderIndex → chunkIndex trong bài) rồi đánh lại
   * chỉ số tuần tự toàn cục để các bước nhóm/đọc giữ thứ tự tự nhiên.
   */
  private async loadOrderedChunks(courseId: string): Promise<ChunkInput[]> {
    const sections = await this.prisma.section.findMany({
      where: { courseId },
      orderBy: { orderIndex: 'asc' },
      select: {
        lessons: { orderBy: { orderIndex: 'asc' }, select: { id: true } },
      },
    });
    const lessonOrder = sections.flatMap((s) => s.lessons.map((l) => l.id));

    const rows = await this.prisma.courseChunk.findMany({
      where: { courseId },
      orderBy: { chunkIndex: 'asc' },
      select: {
        lessonId: true,
        sectionTitle: true,
        content: true,
        chunkIndex: true,
      },
    });
    const byLesson = new Map<string, typeof rows>();
    for (const r of rows) {
      const key = r.lessonId ?? '';
      if (!byLesson.has(key)) byLesson.set(key, []);
      byLesson.get(key)!.push(r);
    }

    const ordered: ChunkInput[] = [];
    const push = (rs: typeof rows | undefined) => {
      for (const r of rs ?? []) {
        ordered.push({
          sectionTitle: r.sectionTitle,
          content: r.content,
          chunkIndex: ordered.length,
        });
      }
    };
    for (const lessonId of lessonOrder) {
      push(byLesson.get(lessonId));
      byLesson.delete(lessonId);
    }
    // Chunk mồ côi (bài đã đổi chỗ/xóa giữa chừng) — nối cuối cho đủ dữ liệu.
    for (const rs of byLesson.values()) push(rs);
    return ordered;
  }

  // ─── Grouping ────────────────────────────────────────────────────────────────

  private async buildGroups(
    courseId: string,
    chunks: ChunkInput[],
  ): Promise<ContentGroup[]> {
    const byHeading = groupByHeading(chunks, MAX_GROUPS);
    if (byHeading) return byHeading;

    // No headings → cluster on the embeddings we already stored (0 extra tokens).
    try {
      const clustered = await this.clusterByEmbedding(courseId, chunks);
      if (clustered) return clustered;
    } catch (err) {
      this.logger.warn(
        `Embedding cluster failed, using sequential split: ${(err as Error).message}`,
      );
    }
    return groupSequential(chunks, FALLBACK_GROUPS);
  }

  /** k-means over persisted chunk embeddings; topics ordered by first appearance. */
  private async clusterByEmbedding(
    courseId: string,
    chunks: ChunkInput[],
  ): Promise<ContentGroup[] | null> {
    const rows = await this.prisma.$queryRaw<
      Array<{ chunk_index: number; content: string; embedding: string | null }>
    >(Prisma.sql`
      SELECT chunk_index, content, embedding::text AS embedding
      FROM course_chunks
      WHERE course_id = ${courseId}
      ORDER BY chunk_index ASC
    `);
    const vectors: number[][] = [];
    const valid: { content: string; idx: number }[] = [];
    for (const r of rows) {
      if (!r.embedding) continue;
      const vec = r.embedding
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(Number);
      if (vec.length === 0 || vec.some(Number.isNaN)) continue;
      vectors.push(vec);
      valid.push({ content: r.content, idx: r.chunk_index });
    }
    if (vectors.length < 2) return null;

    const k = Math.max(2, Math.min(FALLBACK_GROUPS, vectors.length));
    const assign = kmeans(vectors, k);

    // Bucket content per cluster, keep clusters in order of first appearance.
    const order: number[] = [];
    const buckets = new Map<number, string[]>();
    for (let i = 0; i < valid.length; i++) {
      const c = assign[i];
      if (!buckets.has(c)) {
        buckets.set(c, []);
        order.push(c);
      }
      buckets.get(c)!.push(valid[i].content);
    }
    return order.map((c, i) => ({
      path: [`Chủ đề ${i + 1}`],
      content: buckets.get(c)!.join('\n\n'),
    }));
  }

  // ─── Summarisation (the only token-spending step) ────────────────────────────

  private async summarizeGroups(
    groups: ContentGroup[],
  ): Promise<{ summaries: GroupSummary[]; tokenUsage: number }> {
    const summaries: GroupSummary[] = new Array(groups.length);
    let tokenUsage = 0;

    // Greedily batch small groups together to cut down on the number of calls.
    let i = 0;
    while (i < groups.length) {
      const batch: { index: number; group: ContentGroup }[] = [];
      let budget = 0;
      while (i < groups.length) {
        const g = groups[i];
        const size = Math.min(g.content.length, GROUP_CONTENT_CAP);
        if (batch.length > 0 && budget + size > BATCH_CHAR_BUDGET) break;
        batch.push({ index: i, group: g });
        budget += size;
        i++;
        if (size >= BATCH_CHAR_BUDGET) break; // a single large group fills a call
      }

      const { prompt, chars } = buildBatchPrompt(batch);
      tokenUsage += Math.ceil(chars / 3.5);
      let parsed: Record<number, GroupSummary> = {};
      try {
        const raw = await this.gemini.generate(prompt, {
          temperature: 0.2,
          maxOutputTokens: 2048,
          systemInstruction: SUMMARY_SYSTEM,
        });
        tokenUsage += Math.ceil(raw.length / 3.5);
        parsed = parseSummaryArray(raw);
      } catch (err) {
        this.logger.warn(
          `Summary batch failed, using heading fallback: ${(err as Error).message}`,
        );
      }

      for (const { index, group } of batch) {
        const local = index - batch[0].index;
        summaries[index] = parsed[local] ?? fallbackSummary(group);
      }
    }

    return { summaries, tokenUsage };
  }
}

// ─── Prompt building & parsing ─────────────────────────────────────────────────

const SUMMARY_SYSTEM =
  'Bạn là trợ lý tạo sơ đồ tư duy từ tài liệu học (lĩnh vực CNTT). ' +
  'Tóm tắt mỗi phần thành một node ngắn gọn, giữ nguyên thuật ngữ kỹ thuật, bằng tiếng Việt. ' +
  'Chỉ trả về DUY NHẤT một mảng JSON hợp lệ, không kèm giải thích hay markdown. ' +
  UNTRUSTED_DATA_RULE;

function buildBatchPrompt(batch: { index: number; group: ContentGroup }[]): {
  prompt: string;
  chars: number;
} {
  const parts: string[] = [
    'Tóm tắt các phần dưới đây. Trả về mảng JSON, mỗi phần tử đúng dạng:',
    '{"id": <số>, "title": "<tiêu đề ≤8 từ>", "summary": "<≤25 từ>", "main_points": ["<≤5 ý, mỗi ý ≤12 từ>"], "keywords": ["<≤6 từ khóa>"]}',
    '',
  ];
  let chars = 0;
  batch.forEach(({ group }, local) => {
    const heading = group.path.join(' > ') || 'Tài liệu';
    const content = group.content.slice(0, GROUP_CONTENT_CAP);
    chars += content.length;
    parts.push(`Phần [id=${local}] "${neutralizeInline(heading, 200)}":`);
    parts.push(wrapUntrusted(content));
    parts.push('');
  });
  return { prompt: parts.join('\n'), chars };
}

function parseSummaryArray(raw: string): Record<number, GroupSummary> {
  const out: Record<number, GroupSummary> = {};
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end <= start) return out;
  let arr: unknown;
  try {
    arr = JSON.parse(raw.slice(start, end + 1));
  } catch {
    return out;
  }
  if (!Array.isArray(arr)) return out;
  for (const item of arr) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const id = Number(o.id);
    if (!Number.isInteger(id)) continue;
    out[id] = {
      title: typeof o.title === 'string' ? o.title : undefined,
      summary: typeof o.summary === 'string' ? o.summary : undefined,
      main_points: toStringArray(o.main_points),
      keywords: toStringArray(o.keywords),
    };
  }
  return out;
}

function toStringArray(v: unknown): string[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out = v
    .filter((x): x is string => typeof x === 'string')
    .map((s) => s.trim())
    .filter(Boolean);
  return out.length ? out : undefined;
}

function fallbackSummary(group: ContentGroup): GroupSummary {
  const title = group.path[group.path.length - 1] ?? 'Nội dung';
  return { title };
}
