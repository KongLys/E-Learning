import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../providers/gemini.service';
import { ChunkScope } from '../vector/vector-store.service';
import { kmeans } from '../common/clustering.util';
import { RAPTOR_BUILD_QUEUE, BuildRaptorJob } from './raptor.queue';
import { RAPTOR_SUMMARY_SYSTEM, buildNodeSummaryPrompt } from './raptor.prompts';

/** Trạng thái cây phục vụ luồng chat tóm tắt. */
export type RaptorReadiness = 'ready' | 'building' | 'empty';

/** Node tóm tắt rút gọn trả cho luồng tóm tắt. */
export interface RaptorNodeLite {
  id: string;
  title: string | null;
  content: string;
  sectionId: string | null;
  lessonId: string | null;
  childChunkIds: string[];
}

/** Phạm vi node được chọn cho một yêu cầu tóm tắt. */
export interface ScopeNodes {
  label: string;
  nodes: RaptorNodeLite[];
}

interface BuiltNode {
  id: string;
  courseId: string;
  sectionId: string | null;
  lessonId: string | null;
  level: number;
  title: string | null;
  content: string;
  childChunkIds: string[];
  childNodeIds: string[];
  tokenCount: number;
}

interface LessonGroup {
  sectionId: string | null;
  lessonId: string | null;
  pathLabel: string;
  chunkIds: string[];
  contents: string[];
}

/** Số node tối đa fed vào một bản tóm tắt khóa học (chặn token). */
const MAX_SCOPE_NODES = 24;
/** Giới hạn ký tự mỗi đoạn / tổng đoạn khi tóm tắt một node. */
const PART_CAP = 4000;
const TOTAL_CAP = 12000;
/** Fallback khi không có TOC: số cụm tạo bằng k-means. */
const FALLBACK_CLUSTERS = 12;
/** Trần số batch map cho một bài cực dài (chặn chi phí); vượt thì chấp nhận lược bớt. */
const MAX_MAP_BATCHES = 8; // ~8 × 12000 = 96000 ký tự được bao phủ
/**
 * Job 'generating'/'pending' không cập nhật quá ngưỡng này coi như treo (worker
 * chết giữa chừng / process restart). Khi đó enqueue lại thay vì kẹt mãi.
 */
const STALE_BUILD_MS = 15 * 60 * 1000;

/**
 * Dựng và truy vấn cây RAPTOR (tóm tắt phân cấp) cho một khóa học.
 * - Lá = course_chunks (đã embed). Node tóm tắt lưu ở raptor_nodes.
 * - Tầng 1 = mỗi bài học, tầng 2 = mỗi phần, tầng 3 = gốc khóa.
 * - Bám cấu trúc TOC (section/lesson) đã có; thiếu TOC thì cluster bằng k-means.
 * On-demand + cache theo source_hash (giống CourseMindmap).
 */
@Injectable()
export class RaptorService {
  private readonly logger = new Logger(RaptorService.name);

  constructor(
    private prisma: PrismaService,
    private gemini: GeminiService,
    @InjectQueue(RAPTOR_BUILD_QUEUE) private queue: Queue<BuildRaptorJob>,
  ) {}

  // ─── Trigger / cache ──────────────────────────────────────────────────────────

  private async sourceHash(courseId: string): Promise<string | null> {
    const stats = await this.prisma.courseChunk.aggregate({
      where: { courseId },
      _count: { id: true },
      _max: { createdAt: true },
    });
    if (stats._count.id === 0) return null;
    return `${stats._count.id}:${stats._max.createdAt?.getTime() ?? 0}`;
  }

  /**
   * Đảm bảo cây sẵn sàng cho luồng tóm tắt. 'ready' khi đã dựng đúng phiên bản
   * nội dung; nếu chưa/đã cũ thì enqueue build và trả 'building'. 'empty' khi
   * khóa chưa có chunk nào.
   */
  async ensureReady(courseId: string, force = false): Promise<RaptorReadiness> {
    const hash = await this.sourceHash(courseId);
    if (!hash) return 'empty';

    const existing = await this.prisma.courseRaptorTree.findUnique({
      where: { courseId },
    });
    if (
      !force &&
      existing?.status === 'ready' &&
      existing.sourceHash === hash
    ) {
      return 'ready';
    }
    // Job đang chạy còn "tươi" → để yên, tránh enqueue trùng. Nhưng nếu đã treo
    // quá lâu (worker chết) thì coi như hỏng và dựng lại bên dưới.
    const inProgress =
      existing?.status === 'generating' || existing?.status === 'pending';
    const stale =
      inProgress &&
      Date.now() - existing!.updatedAt.getTime() > STALE_BUILD_MS;
    if (!force && inProgress && !stale) {
      return 'building';
    }
    if (stale) {
      this.logger.warn(
        `RAPTOR build cho course ${courseId} treo ` +
          `${Math.round((Date.now() - existing!.updatedAt.getTime()) / 60000)} phút — enqueue lại`,
      );
    }

    await this.prisma.courseRaptorTree.upsert({
      where: { courseId },
      create: { courseId, status: 'pending', sourceHash: hash },
      update: { status: 'pending', sourceHash: hash, errorMsg: null },
    });
    // jobId cố định để chống enqueue trùng KHI đang chờ/chạy; nhưng job cũ đã
    // xong/thất bại vẫn được giữ lại (removeOnComplete/Fail count) nên add lần
    // sau bị dedupe âm thầm. Xóa bản ghi job cũ trước để chắc chắn add được.
    await this.queue.remove(`raptor-${courseId}`).catch(() => undefined);
    await this.queue.add(
      'build',
      { courseId },
      {
        jobId: `raptor-${courseId}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 8_000 },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 100 },
      },
    );
    return 'building';
  }

  async markFailed(courseId: string, message: string): Promise<void> {
    await this.prisma.courseRaptorTree
      .update({
        where: { courseId },
        data: { status: 'failed', errorMsg: message.slice(0, 500) },
      })
      .catch(() => undefined);
  }

  // ─── Build (gọi từ BullMQ processor) ──────────────────────────────────────────

  async generate(
    courseId: string,
    onProgress?: (p: number) => Promise<void>,
  ): Promise<void> {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { id: true, title: true },
    });
    if (!course) throw new Error(`Course ${courseId} not found`);

    await this.prisma.courseRaptorTree.update({
      where: { courseId },
      data: { status: 'generating', errorMsg: null },
    });
    await onProgress?.(10);

    const groups = await this.buildLessonGroups(courseId);
    if (groups.length === 0) {
      throw new Error('Khóa học chưa có nội dung đã xử lý (không có chunk)');
    }
    await onProgress?.(25);

    let tokenUsage = 0;
    const allNodes: BuiltNode[] = [];

    // ── Tầng 1: tóm tắt từng bài học ──
    const level1: BuiltNode[] = [];
    for (const g of groups) {
      const { title, content, tokens } = await this.summarizeGroup(
        g.pathLabel,
        g.contents,
      );
      tokenUsage += tokens;
      level1.push({
        id: randomUUID(),
        courseId,
        sectionId: g.sectionId,
        lessonId: g.lessonId,
        level: 1,
        title,
        content,
        childChunkIds: g.chunkIds,
        childNodeIds: [],
        tokenCount: Math.ceil(content.length / 3.5),
      });
    }
    allNodes.push(...level1);
    await onProgress?.(55);

    // ── Tầng 2: tóm tắt từng phần (gom node tầng 1 theo sectionId) ──
    const bySection = new Map<string, BuiltNode[]>();
    const looseLevel1: BuiltNode[] = [];
    for (const n of level1) {
      if (n.sectionId) {
        const arr = bySection.get(n.sectionId) ?? [];
        arr.push(n);
        bySection.set(n.sectionId, arr);
      } else {
        looseLevel1.push(n);
      }
    }
    const level2: BuiltNode[] = [];
    for (const [sectionId, nodes] of bySection) {
      const label = sectionLabel(nodes[0].title, nodes);
      let title: string | null;
      let content: string;
      if (nodes.length === 1) {
        // 1 bài/phần → không tốn token, dùng lại tóm tắt bài.
        title = nodes[0].title;
        content = nodes[0].content;
      } else {
        const res = await this.summarizeGroup(
          label,
          nodes.map((n) => n.content),
        );
        title = res.title;
        content = res.content;
        tokenUsage += res.tokens;
      }
      level2.push({
        id: randomUUID(),
        courseId,
        sectionId,
        lessonId: null,
        level: 2,
        title,
        content,
        childChunkIds: [],
        childNodeIds: nodes.map((n) => n.id),
        tokenCount: Math.ceil(content.length / 3.5),
      });
    }
    allNodes.push(...level2);
    await onProgress?.(70);

    // ── Tầng 3: gốc khóa (gom node tầng 2 + node tầng 1 mồ côi) ──
    const rootChildren = [...level2, ...looseLevel1];
    if (rootChildren.length > 0) {
      let title: string | null = course.title;
      let content: string;
      if (rootChildren.length === 1) {
        content = rootChildren[0].content;
      } else {
        const res = await this.summarizeGroup(
          course.title,
          rootChildren.map((n) => n.content),
        );
        title = res.title ?? course.title;
        content = res.content;
        tokenUsage += res.tokens;
      }
      allNodes.push({
        id: randomUUID(),
        courseId,
        sectionId: null,
        lessonId: null,
        level: 3,
        title,
        content,
        childChunkIds: [],
        childNodeIds: rootChildren.map((n) => n.id),
        tokenCount: Math.ceil(content.length / 3.5),
      });
    }
    await onProgress?.(80);

    // ── Embed toàn bộ node + lưu (swap nguyên tử) ──
    const embeddings = await this.gemini.embedBatch(
      allNodes.map((n) => n.content),
    );
    await this.persistNodes(courseId, allNodes, embeddings);

    await this.prisma.courseRaptorTree.update({
      where: { courseId },
      data: { status: 'ready', tokenUsage, errorMsg: null },
    });
    await onProgress?.(100);
    this.logger.log(
      `RAPTOR ready for course ${courseId}: ${allNodes.length} nodes (` +
        `${level1.length} bài / ${level2.length} phần), ~${tokenUsage} tokens`,
    );
  }

  // ─── Truy vấn cho luồng tóm tắt ───────────────────────────────────────────────

  /** Chọn node phù hợp phạm vi: bài → tầng 1, phần → tầng 2, cả khóa → gốc + phần. */
  async getScopeNodes(
    courseId: string,
    scope?: ChunkScope,
  ): Promise<ScopeNodes> {
    if (scope?.lessonId) {
      const nodes = await this.findNodes({
        courseId,
        lessonId: scope.lessonId,
        level: 1,
      });
      return { label: 'bài học hiện tại', nodes };
    }
    if (scope?.sectionId) {
      let nodes = await this.findNodes({
        courseId,
        sectionId: scope.sectionId,
        level: 2,
      });
      if (nodes.length === 0) {
        nodes = await this.findNodes({
          courseId,
          sectionId: scope.sectionId,
          level: 1,
        });
      }
      return { label: 'phần hiện tại', nodes };
    }
    // Cả khóa: gốc (tổng quan) + các node phần (chi tiết theo phần).
    const root = await this.findNodes({ courseId, level: 3 });
    const sections = await this.findNodes({ courseId, level: 2 });
    const nodes = [...root, ...sections].slice(0, MAX_SCOPE_NODES);
    return { label: 'toàn bộ khóa học', nodes };
  }

  private async findNodes(where: {
    courseId: string;
    level?: number;
    lessonId?: string;
    sectionId?: string;
  }): Promise<RaptorNodeLite[]> {
    const rows = await this.prisma.raptorNode.findMany({
      where: {
        courseId: where.courseId,
        ...(where.level !== undefined ? { level: where.level } : {}),
        ...(where.lessonId ? { lessonId: where.lessonId } : {}),
        ...(where.sectionId ? { sectionId: where.sectionId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        title: true,
        content: true,
        sectionId: true,
        lessonId: true,
        childChunkIds: true,
      },
    });
    return rows;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Gom chunk thành nhóm theo bài học, sắp theo trình tự giáo trình
   * (Phần.orderIndex → Bài.orderIndex → chunkIndex). Thiếu TOC thì cluster
   * embedding bằng k-means thành các chủ đề giả lập.
   */
  private async buildLessonGroups(courseId: string): Promise<LessonGroup[]> {
    const sections = await this.prisma.section.findMany({
      where: { courseId },
      orderBy: { orderIndex: 'asc' },
      select: {
        id: true,
        title: true,
        // Loại bài quiz: không đưa câu hỏi/đáp án vào tóm tắt (nhất quán với
        // bộ lọc của RAG hybridSearch).
        lessons: {
          where: { type: { not: 'quiz' } },
          orderBy: { orderIndex: 'asc' },
          select: { id: true, title: true },
        },
      },
    });
    // Tập bài quiz để loại luôn chunk mồ côi của chúng (nếu lỡ có).
    const quizLessons = await this.prisma.lesson.findMany({
      where: { section: { courseId }, type: 'quiz' },
      select: { id: true },
    });
    const quizLessonIds = new Set(quizLessons.map((l) => l.id));

    const chunks = await this.prisma.courseChunk.findMany({
      where: { courseId },
      orderBy: { chunkIndex: 'asc' },
      select: {
        id: true,
        lessonId: true,
        sectionId: true,
        sectionTitle: true,
        content: true,
      },
    });
    if (chunks.length === 0) return [];

    const byLesson = new Map<string, typeof chunks>();
    for (const c of chunks) {
      const key = c.lessonId ?? '';
      const arr = byLesson.get(key) ?? [];
      arr.push(c);
      byLesson.set(key, arr);
    }

    const groups: LessonGroup[] = [];
    for (const section of sections) {
      for (const lesson of section.lessons) {
        const rows = byLesson.get(lesson.id);
        if (!rows || rows.length === 0) continue;
        groups.push({
          sectionId: section.id,
          lessonId: lesson.id,
          pathLabel: `${section.title} > ${lesson.title}`,
          chunkIds: rows.map((r) => r.id),
          contents: rows.map((r) => r.content),
        });
        byLesson.delete(lesson.id);
      }
    }

    // Chunk mồ côi (bài đã xóa/đổi chỗ) — gom theo lessonId còn lại, bỏ bài quiz.
    for (const [lessonId, rows] of byLesson) {
      if (rows.length === 0 || quizLessonIds.has(lessonId)) continue;
      groups.push({
        sectionId: rows[0].sectionId,
        lessonId: rows[0].lessonId,
        pathLabel: rows[0].sectionTitle ?? 'Nội dung khóa học',
        chunkIds: rows.map((r) => r.id),
        contents: rows.map((r) => r.content),
      });
    }

    if (groups.length > 0) return groups;
    // Không có TOC nào khớp → cluster embedding thành chủ đề giả lập.
    return this.clusterFallback(courseId);
  }

  /** Fallback k-means khi không tái tạo được nhóm theo TOC. */
  private async clusterFallback(courseId: string): Promise<LessonGroup[]> {
    const rows = await this.prisma.$queryRaw<
      Array<{ id: string; content: string; embedding: string | null }>
    >(Prisma.sql`
      SELECT id, content, embedding::text AS embedding
      FROM course_chunks
      WHERE course_id = ${courseId}
      ORDER BY chunk_index ASC
    `);
    const vectors: number[][] = [];
    const valid: { id: string; content: string }[] = [];
    for (const r of rows) {
      if (!r.embedding) continue;
      const vec = r.embedding
        .replace(/^\[|\]$/g, '')
        .split(',')
        .map(Number);
      if (vec.length === 0 || vec.some(Number.isNaN)) continue;
      vectors.push(vec);
      valid.push({ id: r.id, content: r.content });
    }
    if (vectors.length === 0) return [];

    const k = Math.max(2, Math.min(FALLBACK_CLUSTERS, vectors.length));
    const assign = kmeans(vectors, k);
    const order: number[] = [];
    const buckets = new Map<number, { id: string; content: string }[]>();
    for (let i = 0; i < valid.length; i++) {
      const c = assign[i];
      if (!buckets.has(c)) {
        buckets.set(c, []);
        order.push(c);
      }
      buckets.get(c)!.push(valid[i]);
    }
    return order.map((c, i) => {
      const items = buckets.get(c)!;
      return {
        sectionId: null,
        lessonId: null,
        pathLabel: `Chủ đề ${i + 1}`,
        chunkIds: items.map((x) => x.id),
        contents: items.map((x) => x.content),
      };
    });
  }

  /**
   * Tóm tắt một nhóm nội dung bằng map-reduce. Nhóm vừa một batch → 1 call như cũ;
   * nhóm dài → tóm tắt từng batch (map) rồi tóm tắt-của-tóm-tắt (reduce, đệ quy).
   * Nhờ vậy bài/phần dài không bị cắt mất phần đuôi.
   */
  private async summarizeGroup(
    pathLabel: string,
    contents: string[],
  ): Promise<{ title: string | null; content: string; tokens: number }> {
    const batches = chunkBatches(contents);

    // Trường hợp thường: vừa 1 batch → hành vi & chi phí y như hiện tại.
    if (batches.length <= 1) {
      return this.summarizeNode(pathLabel, batches[0], batches[0]);
    }

    // Van an toàn: bài dài bất thường → giới hạn số batch để chặn chi phí runaway.
    const capped = batches.slice(0, MAX_MAP_BATCHES);

    // MAP: tóm tắt từng batch độc lập.
    let tokens = 0;
    const partials: string[] = [];
    for (let i = 0; i < capped.length; i++) {
      const res = await this.summarizeNode(
        `${pathLabel} (phần ${i + 1}/${capped.length})`,
        capped[i],
        capped[i],
      );
      tokens += res.tokens;
      partials.push(res.content);
    }

    // REDUCE: tóm tắt các bản tóm tắt phần. Đệ quy — partials ngắn nên gần như
    // luôn gom về 1 batch ở vòng kế tiếp; MAX_MAP_BATCHES chặn trần tuyệt đối.
    const reduced = await this.summarizeGroup(pathLabel, partials);
    return {
      title: reduced.title,
      content: reduced.content,
      tokens: tokens + reduced.tokens,
    };
  }

  /** Tóm tắt một node bằng LLM; lỗi/parse hỏng thì fallback ghép nội dung. */
  private async summarizeNode(
    pathLabel: string,
    parts: string[],
    rawContents: string[],
  ): Promise<{ title: string | null; content: string; tokens: number }> {
    const prompt = buildNodeSummaryPrompt(pathLabel, parts);
    let tokens = Math.ceil(prompt.length / 3.5);
    try {
      const raw = await this.gemini.generate(prompt, {
        temperature: 0.2,
        maxOutputTokens: 1024,
        systemInstruction: RAPTOR_SUMMARY_SYSTEM,
      });
      tokens += Math.ceil(raw.length / 3.5);
      const parsed = parseTitleSummary(raw);
      if (parsed && parsed.content) {
        return {
          title: parsed.title ?? deriveTitle(pathLabel),
          content: parsed.content,
          tokens,
        };
      }
      const text = raw.trim();
      if (text) return { title: deriveTitle(pathLabel), content: text, tokens };
    } catch (err) {
      this.logger.warn(
        `RAPTOR summarize failed for "${pathLabel}": ${(err as Error).message}`,
      );
    }
    return {
      title: deriveTitle(pathLabel),
      content: fallbackText(rawContents),
      tokens,
    };
  }

  /** Xóa node cũ + chèn node mới trong một transaction (tránh đọc dở dang). */
  private async persistNodes(
    courseId: string,
    nodes: BuiltNode[],
    embeddings: number[][],
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.raptorNode.deleteMany({ where: { courseId } });
      const BATCH = 50;
      for (let i = 0; i < nodes.length; i += BATCH) {
        const slice = nodes.slice(i, i + BATCH);
        const values = slice.map((n, j) => {
          const emb = embeddings[i + j] ?? [];
          const vec = `[${emb.join(',')}]`;
          return Prisma.sql`(
            ${n.id}, ${n.courseId}, ${n.sectionId}, ${n.lessonId}, ${n.level},
            ${n.title}, ${n.content},
            ${sqlTextArray(n.childChunkIds)}, ${sqlTextArray(n.childNodeIds)},
            ${n.tokenCount}, '{}'::jsonb, ${vec}::vector
          )`;
        });
        await tx.$executeRaw(Prisma.sql`
          INSERT INTO raptor_nodes
            (id, course_id, section_id, lesson_id, level, title, content,
             child_chunk_ids, child_node_ids, token_count, metadata, embedding)
          VALUES ${Prisma.join(values)}
        `);
      }
    });
  }
}

// ─── Pure helpers ───────────────────────────────────────────────────────────────

function sqlTextArray(ids: string[]): Prisma.Sql {
  if (ids.length === 0) return Prisma.sql`ARRAY[]::text[]`;
  return Prisma.sql`ARRAY[${Prisma.join(ids)}]::text[]`;
}

/**
 * Cắt mỗi đoạn theo PART_CAP và gom thành nhiều batch, mỗi batch ≤ TOTAL_CAP.
 * Khác bản cũ (dừng khi đủ ngưỡng) — ở đây giữ lại TẤT CẢ nội dung để map-reduce.
 * Vì PART_CAP < TOTAL_CAP nên mỗi đoạn luôn lọt một batch (không lặp vô hạn).
 */
export function chunkBatches(contents: string[]): string[][] {
  const batches: string[][] = [];
  let cur: string[] = [];
  let total = 0;
  for (const c of contents) {
    const piece = c.slice(0, PART_CAP);
    if (total + piece.length > TOTAL_CAP && cur.length > 0) {
      batches.push(cur);
      cur = [];
      total = 0;
    }
    cur.push(piece);
    total += piece.length;
  }
  if (cur.length > 0) batches.push(cur);
  return batches.length > 0 ? batches : [['']];
}

function fallbackText(contents: string[]): string {
  return contents.join('\n\n').slice(0, TOTAL_CAP).trim() || 'Không có nội dung.';
}

function deriveTitle(pathLabel: string): string {
  const parts = pathLabel.split('>').map((s) => s.trim());
  return parts[parts.length - 1] || pathLabel;
}

function sectionLabel(_first: string | null, nodes: BuiltNode[]): string {
  // sectionId trùng nhau ⇒ lấy phần đầu của pathLabel bài đầu tiên làm nhãn phần.
  const t = nodes[0]?.title ?? 'Phần';
  return t;
}

function parseTitleSummary(
  raw: string,
): { title: string | null; content: string } | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const content = typeof obj.summary === 'string' ? obj.summary.trim() : '';
    if (!content) return null;
    return {
      title: typeof obj.title === 'string' ? obj.title.trim() : null,
      content,
    };
  } catch {
    return null;
  }
}
