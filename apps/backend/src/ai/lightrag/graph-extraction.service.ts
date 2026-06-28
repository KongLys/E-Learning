import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../providers/gemini.service';
import {
  GRAPH_EXTRACTION_SYSTEM,
  DESCRIPTION_MERGE_SYSTEM,
  buildGraphExtractionPrompt,
  buildDescriptionMergePrompt,
  parseExtractedGraph,
  parseMergedDescriptions,
  DescriptionMergeItem,
  ExtractedEntity,
  ExtractedRelation,
} from './lightrag.prompts';

/** Gộp chunk thành lô ~chars để tiết kiệm lời gọi LLM khi trích đồ thị. */
const EXTRACT_GROUP_CHARS = 6000;
/** Trần số entity/relation lấy từ một bài (chặn nhiễu + chi phí). */
const MAX_ENTITIES_PER_LESSON = 60;
const MAX_RELATIONS_PER_LESSON = 120;
/** Trần số mục gộp mô tả bằng LLM mỗi loại/bài (chặn chi phí). */
const MAX_MERGE_ITEMS = 40;

interface MergedEntity {
  name: string;
  normName: string;
  type: string;
  description: string;
  /** chunk nguồn (union các lô mà entity xuất hiện). */
  chunkIds: Set<string>;
}

interface MergedRelation {
  srcId: string;
  dstId: string;
  keywords: string;
  description: string;
  chunkIds: Set<string>;
}

/** Một lô chunk gộp để trích, kèm id chunk nguồn để gắn provenance. */
interface ChunkGroup {
  text: string;
  chunkIds: string[];
}

/**
 * Trích đồ thị tri thức (entity + relation) cho một bài học và merge incremental
 * vào đồ thị của khóa. Idempotent theo bài: mỗi lần chạy xóa sạch đóng góp cũ của
 * bài rồi dựng lại, nên re-index không nhân đôi. Dedup entity theo (course, norm_name)
 * và quan hệ theo cặp (course, src, dst) — weight = số bài đóng góp cạnh.
 *
 * Lưu chunk nguồn (chunk_ids) cho cả entity lẫn relation để truy hồi kéo đúng chunk
 * (chunk-level provenance). Khi entity/quan hệ trùng giữa các bài, mô tả được hợp
 * nhất bằng LLM (summarize-merge) thay vì chỉ giữ bản dài hơn.
 *
 * Tái dùng course_chunks đã index (không parse lại file). Bài quiz bị bỏ qua —
 * nhất quán với bộ lọc của RAG/RAPTOR.
 */
@Injectable()
export class GraphExtractionService {
  private readonly logger = new Logger(GraphExtractionService.name);

  constructor(
    private prisma: PrismaService,
    private gemini: GeminiService,
  ) {}

  async extractLesson(lessonId: string): Promise<void> {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        type: true,
        sectionId: true,
        section: { select: { courseId: true } },
      },
    });
    if (!lesson) {
      this.logger.warn(`Lesson ${lessonId} not found — skip graph extraction`);
      return;
    }
    const courseId = lesson.section.courseId;
    const sectionId = lesson.sectionId;

    // Dọn sạch đóng góp cũ của bài trước (idempotent). Bài quiz: chỉ dọn, không trích.
    await this.cleanLessonContributions(courseId, lessonId);
    if (lesson.type === 'quiz') {
      await this.refreshDegree(courseId);
      this.logger.log(`Lesson ${lessonId} is quiz — cleared graph only`);
      return;
    }

    const chunks = await this.prisma.courseChunk.findMany({
      where: { lessonId },
      orderBy: { chunkIndex: 'asc' },
      select: { id: true, content: true },
    });
    if (chunks.length === 0) {
      await this.refreshDegree(courseId);
      this.logger.log(`Lesson ${lessonId} has no chunks — cleared graph only`);
      return;
    }

    // Tên entity đã biết của khóa → đưa vào prompt để model tái dùng (giảm trùng).
    const known = await this.prisma.graphEntity.findMany({
      where: { courseId },
      select: { name: true },
      take: 200,
    });
    const knownNames = known.map((e) => e.name);

    // Trích theo từng lô chunk; mỗi entity/relation gắn chunk nguồn của lô.
    const groups = groupByChars(chunks, EXTRACT_GROUP_CHARS);
    const rawEntities: Array<{ entity: ExtractedEntity; chunkIds: string[] }> =
      [];
    const rawRelations: Array<{
      relation: ExtractedRelation;
      chunkIds: string[];
    }> = [];
    for (const group of groups) {
      try {
        const out = await this.gemini.generate(
          buildGraphExtractionPrompt(group.text, knownNames),
          {
            temperature: 0.1,
            maxOutputTokens: 2048,
            systemInstruction: GRAPH_EXTRACTION_SYSTEM,
          },
        );
        const parsed = parseExtractedGraph(out);
        for (const e of parsed.entities)
          rawEntities.push({ entity: e, chunkIds: group.chunkIds });
        for (const r of parsed.relations)
          rawRelations.push({ relation: r, chunkIds: group.chunkIds });
      } catch (err) {
        this.logger.warn(
          `Graph extraction LLM call failed for lesson ${lessonId}: ${(err as Error).message}`,
        );
      }
    }

    // Dedup entity trong phạm vi bài (theo norm_name), giữ mô tả dài nhất, union chunk.
    const entityMap = new Map<string, MergedEntity>();
    for (const { entity: e, chunkIds } of rawEntities) {
      const normName = normalize(e.name);
      if (!normName) continue;
      const prev = entityMap.get(normName);
      if (!prev) {
        entityMap.set(normName, {
          name: e.name.trim(),
          normName,
          type: e.type,
          description: e.description,
          chunkIds: new Set(chunkIds),
        });
      } else {
        if (e.description.length > prev.description.length)
          prev.description = e.description;
        for (const c of chunkIds) prev.chunkIds.add(c);
      }
    }
    const entities = [...entityMap.values()].slice(0, MAX_ENTITIES_PER_LESSON);
    if (entities.length === 0) {
      await this.refreshDegree(courseId);
      this.logger.log(`Lesson ${lessonId} — no entities extracted`);
      return;
    }

    // Hợp nhất mô tả entity với bản đã có trong DB (LLM summarize-merge).
    await this.mergeEntityDescriptions(courseId, entities);

    // Upsert entity (dedup theo khóa) + embed mô tả (đã merge).
    const entityEmb = await this.gemini.embedBatch(
      entities.map((e) => `${e.name}. ${e.description}`),
    );
    await this.upsertEntities(courseId, sectionId, lessonId, entities, entityEmb);

    // Map norm_name → id (sau upsert) để dựng relation.
    const idByNorm = await this.entityIdMap(
      courseId,
      entities.map((e) => e.normName),
    );

    // Dedup relation trong bài theo CẶP (src,dst): union keywords + chunk, mô tả dài nhất.
    const relMap = new Map<string, MergedRelation>();
    for (const { relation: r, chunkIds } of rawRelations) {
      const srcId = idByNorm.get(normalize(r.source));
      const dstId = idByNorm.get(normalize(r.target));
      if (!srcId || !dstId || srcId === dstId) continue;
      const key = `${srcId}|${dstId}`;
      const prev = relMap.get(key);
      if (!prev) {
        relMap.set(key, {
          srcId,
          dstId,
          keywords: r.keywords,
          description: r.description,
          chunkIds: new Set(chunkIds),
        });
      } else {
        prev.keywords = unionKeywords(prev.keywords, r.keywords);
        if (r.description.length > prev.description.length)
          prev.description = r.description;
        for (const c of chunkIds) prev.chunkIds.add(c);
      }
    }
    const relations = [...relMap.values()].slice(0, MAX_RELATIONS_PER_LESSON);

    if (relations.length > 0) {
      // Hợp nhất keywords + mô tả với cạnh đã có trong DB (LLM merge mô tả).
      await this.mergeRelationDescriptions(courseId, relations);
      const relEmb = await this.gemini.embedBatch(
        relations.map((r) => `${r.keywords}. ${r.description}`),
      );
      await this.upsertRelations(
        courseId,
        sectionId,
        lessonId,
        relations,
        relEmb,
      );
    }

    await this.refreshDegree(courseId);
    this.logger.log(
      `Graph for lesson ${lessonId}: ${entities.length} entities, ${relations.length} relations`,
    );
  }

  // ─── Hợp nhất mô tả (LLM summarize-merge) ────────────────────────────────────

  /** Gộp mô tả entity mới với bản đã có (nếu khác) — sửa tại chỗ `entities`. */
  private async mergeEntityDescriptions(
    courseId: string,
    entities: MergedEntity[],
  ): Promise<void> {
    const existing = await this.prisma.graphEntity.findMany({
      where: { courseId, normName: { in: entities.map((e) => e.normName) } },
      select: { normName: true, description: true },
    });
    const byNorm = new Map(existing.map((r) => [r.normName, r.description]));

    const items: DescriptionMergeItem[] = [];
    for (const e of entities) {
      const old = byNorm.get(e.normName);
      if (needsMerge(old, e.description)) {
        items.push({
          id: e.normName,
          name: e.name,
          existing: old!,
          incoming: e.description,
        });
      }
    }
    const merged = await this.runDescriptionMerge(items);
    for (const e of entities) {
      const old = byNorm.get(e.normName);
      if (needsMerge(old, e.description)) {
        e.description = merged.get(e.normName) ?? longer(old!, e.description);
      }
    }
  }

  /** Gộp keywords + mô tả relation mới với cạnh đã có — sửa tại chỗ `relations`. */
  private async mergeRelationDescriptions(
    courseId: string,
    relations: MergedRelation[],
  ): Promise<void> {
    const srcIds = [...new Set(relations.map((r) => r.srcId))];
    const existing = await this.prisma.graphRelation.findMany({
      where: { courseId, srcId: { in: srcIds } },
      select: { srcId: true, dstId: true, keywords: true, description: true },
    });
    const byPair = new Map(
      existing.map((r) => [
        `${r.srcId}|${r.dstId}`,
        { keywords: r.keywords, description: r.description },
      ]),
    );

    const items: DescriptionMergeItem[] = [];
    for (const r of relations) {
      const old = byPair.get(`${r.srcId}|${r.dstId}`);
      if (old && needsMerge(old.description, r.description)) {
        items.push({
          id: `${r.srcId}|${r.dstId}`,
          name: r.keywords || 'quan hệ',
          existing: old.description,
          incoming: r.description,
        });
      }
    }
    const merged = await this.runDescriptionMerge(items);
    for (const r of relations) {
      const key = `${r.srcId}|${r.dstId}`;
      const old = byPair.get(key);
      if (!old) continue;
      r.keywords = unionKeywords(old.keywords, r.keywords);
      if (needsMerge(old.description, r.description)) {
        r.description = merged.get(key) ?? longer(old.description, r.description);
      }
    }
  }

  /** Một lời gọi LLM gộp toàn bộ mục (chặn theo MAX_MERGE_ITEMS). Lỗi → map rỗng. */
  private async runDescriptionMerge(
    items: DescriptionMergeItem[],
  ): Promise<Map<string, string>> {
    const slice = items.slice(0, MAX_MERGE_ITEMS);
    if (slice.length === 0) return new Map();
    try {
      const out = await this.gemini.generate(
        buildDescriptionMergePrompt(slice),
        {
          temperature: 0.1,
          maxOutputTokens: 2048,
          systemInstruction: DESCRIPTION_MERGE_SYSTEM,
        },
      );
      return parseMergedDescriptions(out);
    } catch (err) {
      this.logger.warn(
        `Description merge LLM call failed: ${(err as Error).message}`,
      );
      return new Map();
    }
  }

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  /**
   * Gỡ đóng góp của bài khỏi đồ thị (idempotent):
   *  - relation: gỡ bài khỏi lesson_ids, purge chunk đã bị xóa, tính lại weight,
   *    xóa cạnh mồ côi (không còn bài).
   *  - entity: gỡ bài khỏi lesson_ids, purge chunk đã xóa, xóa entity mồ côi.
   * Purge chunk theo "không còn tồn tại trong course_chunks" — vì re-index thay
   * chunk (id mới) trước khi trích, nên chunk cũ của bài tự bị loại.
   */
  private async cleanLessonContributions(
    courseId: string,
    lessonId: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.$executeRaw(Prisma.sql`
        UPDATE graph_relations r SET
          lesson_ids = array_remove(r.lesson_ids, ${lessonId}),
          chunk_ids = ARRAY(
            SELECT c FROM unnest(r.chunk_ids) c
            WHERE EXISTS (SELECT 1 FROM course_chunks cc WHERE cc.id = c)
          ),
          weight = cardinality(array_remove(r.lesson_ids, ${lessonId}))::float
        WHERE r.course_id = ${courseId} AND ${lessonId} = ANY(r.lesson_ids)
      `),
      this.prisma.$executeRaw(Prisma.sql`
        DELETE FROM graph_relations
        WHERE course_id = ${courseId} AND cardinality(lesson_ids) = 0
      `),
      this.prisma.$executeRaw(Prisma.sql`
        UPDATE graph_entities e SET
          lesson_ids = array_remove(e.lesson_ids, ${lessonId}),
          chunk_ids = ARRAY(
            SELECT c FROM unnest(e.chunk_ids) c
            WHERE EXISTS (SELECT 1 FROM course_chunks cc WHERE cc.id = c)
          ),
          updated_at = now()
        WHERE e.course_id = ${courseId} AND ${lessonId} = ANY(e.lesson_ids)
      `),
      this.prisma.$executeRaw(Prisma.sql`
        DELETE FROM graph_entities
        WHERE course_id = ${courseId} AND cardinality(lesson_ids) = 0
      `),
    ]);
  }

  // ─── Persistence (raw SQL — embedding pgvector) ───────────────────────────────

  private async upsertEntities(
    courseId: string,
    sectionId: string | null,
    lessonId: string,
    entities: MergedEntity[],
    embeddings: number[][],
  ): Promise<void> {
    const sectionArr = textArraySql(sectionId ? [sectionId] : []);
    const BATCH = 50;
    for (let i = 0; i < entities.length; i += BATCH) {
      const slice = entities.slice(i, i + BATCH);
      const values = slice.map((e, j) => {
        const emb = embeddings[i + j];
        const vec = emb?.length
          ? Prisma.sql`${`[${emb.join(',')}]`}::vector`
          : Prisma.sql`NULL`;
        return Prisma.sql`(
          gen_random_uuid(), ${courseId}, ${e.name}, ${e.normName}, ${e.type},
          ${e.description}, ARRAY[${lessonId}]::text[], ${sectionArr},
          ${textArraySql([...e.chunkIds])}, 0, ${vec}, now()
        )`;
      });
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO graph_entities
          (id, course_id, name, norm_name, type, description, lesson_ids, section_ids, chunk_ids, degree, embedding, updated_at)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (course_id, norm_name) DO UPDATE SET
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          description = EXCLUDED.description,
          lesson_ids = ARRAY(SELECT DISTINCT unnest(graph_entities.lesson_ids || EXCLUDED.lesson_ids)),
          section_ids = ARRAY(SELECT DISTINCT unnest(graph_entities.section_ids || EXCLUDED.section_ids)),
          chunk_ids = ARRAY(SELECT DISTINCT unnest(graph_entities.chunk_ids || EXCLUDED.chunk_ids)),
          embedding = COALESCE(EXCLUDED.embedding, graph_entities.embedding),
          updated_at = now()
      `);
    }
  }

  private async entityIdMap(
    courseId: string,
    normNames: string[],
  ): Promise<Map<string, string>> {
    if (normNames.length === 0) return new Map();
    const rows = await this.prisma.graphEntity.findMany({
      where: { courseId, normName: { in: normNames } },
      select: { id: true, normName: true },
    });
    return new Map(rows.map((r) => [r.normName, r.id]));
  }

  /**
   * Upsert cạnh theo cặp (course, src, dst): tích lũy weight = số bài đóng góp,
   * union lesson_ids/section_ids/chunk_ids. keywords/description đã merge ở app.
   */
  private async upsertRelations(
    courseId: string,
    sectionId: string | null,
    lessonId: string,
    relations: MergedRelation[],
    embeddings: number[][],
  ): Promise<void> {
    const sectionArr = textArraySql(sectionId ? [sectionId] : []);
    const BATCH = 50;
    for (let i = 0; i < relations.length; i += BATCH) {
      const slice = relations.slice(i, i + BATCH);
      const values = slice.map((r, j) => {
        const emb = embeddings[i + j];
        const vec = emb?.length
          ? Prisma.sql`${`[${emb.join(',')}]`}::vector`
          : Prisma.sql`NULL`;
        return Prisma.sql`(
          gen_random_uuid(), ${courseId}, ${r.srcId}, ${r.dstId}, ${r.keywords},
          ${r.description}, ARRAY[${lessonId}]::text[], ${sectionArr},
          ${textArraySql([...r.chunkIds])}, 1, ${vec}, now()
        )`;
      });
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO graph_relations
          (id, course_id, src_id, dst_id, keywords, description, lesson_ids, section_ids, chunk_ids, weight, embedding, created_at)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (course_id, src_id, dst_id) DO UPDATE SET
          keywords = EXCLUDED.keywords,
          description = EXCLUDED.description,
          lesson_ids = ARRAY(SELECT DISTINCT unnest(graph_relations.lesson_ids || EXCLUDED.lesson_ids)),
          section_ids = ARRAY(SELECT DISTINCT unnest(graph_relations.section_ids || EXCLUDED.section_ids)),
          chunk_ids = ARRAY(SELECT DISTINCT unnest(graph_relations.chunk_ids || EXCLUDED.chunk_ids)),
          weight = cardinality(ARRAY(SELECT DISTINCT unnest(graph_relations.lesson_ids || EXCLUDED.lesson_ids)))::float,
          embedding = COALESCE(EXCLUDED.embedding, graph_relations.embedding)
      `);
    }
  }

  /** Cập nhật bậc (số quan hệ chạm tới) cho mọi entity của khóa — phục vụ rank low-level. */
  private async refreshDegree(courseId: string): Promise<void> {
    await this.prisma.$executeRaw(Prisma.sql`
      UPDATE graph_entities e SET degree = (
        SELECT count(*) FROM graph_relations r
        WHERE r.course_id = e.course_id AND (r.src_id = e.id OR r.dst_id = e.id)
      )
      WHERE e.course_id = ${courseId}
    `);
  }
}

// ─── Pure helpers ───────────────────────────────────────────────────────────────

function normalize(name: string): string {
  return name.toLowerCase().trim().replace(/\s+/g, ' ');
}

function longer(a: string, b: string): string {
  return a.length >= b.length ? a : b;
}

/** Cần gộp khi đã có mô tả cũ KHÁC mô tả mới (cả hai không rỗng). */
function needsMerge(existing: string | undefined, incoming: string): boolean {
  const old = (existing ?? '').trim();
  const inc = incoming.trim();
  return old.length > 0 && inc.length > 0 && old !== inc;
}

/** Hợp nhất 2 chuỗi keywords (phân tách bởi , hoặc ;) — dedup không phân biệt hoa thường. */
function unionKeywords(a: string, b: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of `${a},${b}`.split(/[,;]/)) {
    const t = part.trim();
    const k = t.toLowerCase();
    if (t && !seen.has(k)) {
      seen.add(k);
      out.push(t);
    }
  }
  return out.slice(0, 8).join(', ');
}

/** Mảng text → SQL literal `ARRAY[...]::text[]` (rỗng → mảng rỗng có kiểu). */
function textArraySql(arr: string[]): Prisma.Sql {
  return arr.length
    ? Prisma.sql`ARRAY[${Prisma.join(arr)}]::text[]`
    : Prisma.sql`ARRAY[]::text[]`;
}

/** Gộp các chunk thành lô không vượt `cap` ký tự, GIỮ id chunk nguồn của mỗi lô. */
function groupByChars(
  chunks: Array<{ id: string; content: string }>,
  cap: number,
): ChunkGroup[] {
  const groups: ChunkGroup[] = [];
  let text = '';
  let ids: string[] = [];
  for (const c of chunks) {
    if (text && text.length + c.content.length > cap) {
      groups.push({ text, chunkIds: ids });
      text = '';
      ids = [];
    }
    text += (text ? '\n\n' : '') + c.content;
    ids.push(c.id);
  }
  if (text) groups.push({ text, chunkIds: ids });
  return groups;
}
