import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../providers/gemini.service';
import {
  GRAPH_EXTRACTION_SYSTEM,
  buildGraphExtractionPrompt,
  parseExtractedGraph,
  ExtractedEntity,
  ExtractedRelation,
} from './lightrag.prompts';

/** Gộp chunk thành lô ~chars để tiết kiệm lời gọi LLM khi trích đồ thị. */
const EXTRACT_GROUP_CHARS = 6000;
/** Trần số entity/relation lấy từ một bài (chặn nhiễu + chi phí). */
const MAX_ENTITIES_PER_LESSON = 60;
const MAX_RELATIONS_PER_LESSON = 120;

interface MergedEntity {
  name: string;
  normName: string;
  type: string;
  description: string;
}

/**
 * Trích đồ thị tri thức (entity + relation) cho một bài học và merge incremental
 * vào đồ thị của khóa. Idempotent theo bài: mỗi lần chạy xóa sạch đóng góp cũ của
 * bài rồi dựng lại, nên re-index không nhân đôi. Dedup entity theo (course, norm_name).
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
      this.logger.log(`Lesson ${lessonId} is quiz — cleared graph only`);
      return;
    }

    const chunks = await this.prisma.courseChunk.findMany({
      where: { lessonId },
      orderBy: { chunkIndex: 'asc' },
      select: { content: true },
    });
    if (chunks.length === 0) {
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

    // Trích theo từng lô chunk, gộp kết quả.
    const groups = groupByChars(
      chunks.map((c) => c.content),
      EXTRACT_GROUP_CHARS,
    );
    const rawEntities: ExtractedEntity[] = [];
    const rawRelations: ExtractedRelation[] = [];
    for (const group of groups) {
      try {
        const out = await this.gemini.generate(
          buildGraphExtractionPrompt(group, knownNames),
          {
            temperature: 0.1,
            maxOutputTokens: 2048,
            systemInstruction: GRAPH_EXTRACTION_SYSTEM,
          },
        );
        const parsed = parseExtractedGraph(out);
        rawEntities.push(...parsed.entities);
        rawRelations.push(...parsed.relations);
      } catch (err) {
        this.logger.warn(
          `Graph extraction LLM call failed for lesson ${lessonId}: ${(err as Error).message}`,
        );
      }
    }

    // Dedup entity trong phạm vi bài (theo norm_name), giữ mô tả dài nhất.
    const entityMap = new Map<string, MergedEntity>();
    for (const e of rawEntities) {
      const normName = normalize(e.name);
      if (!normName) continue;
      const prev = entityMap.get(normName);
      if (!prev) {
        entityMap.set(normName, {
          name: e.name.trim(),
          normName,
          type: e.type,
          description: e.description,
        });
      } else if (e.description.length > prev.description.length) {
        prev.description = e.description;
      }
    }
    const entities = [...entityMap.values()].slice(0, MAX_ENTITIES_PER_LESSON);
    if (entities.length === 0) {
      this.logger.log(`Lesson ${lessonId} — no entities extracted`);
      return;
    }

    // Upsert entity (dedup theo khóa) + embed.
    const entityEmb = await this.gemini.embedBatch(
      entities.map((e) => `${e.name}. ${e.description}`),
    );
    await this.upsertEntities(
      courseId,
      sectionId,
      lessonId,
      entities,
      entityEmb,
    );

    // Map norm_name → id (sau upsert) để dựng relation.
    const idByNorm = await this.entityIdMap(
      courseId,
      entities.map((e) => e.normName),
    );

    // Lọc relation hợp lệ: 2 đầu mút có trong map, không tự nối, dedup theo (src,dst,kw).
    const relSeen = new Set<string>();
    const relations: Array<{
      srcId: string;
      dstId: string;
      keywords: string;
      description: string;
    }> = [];
    for (const r of rawRelations) {
      const srcId = idByNorm.get(normalize(r.source));
      const dstId = idByNorm.get(normalize(r.target));
      if (!srcId || !dstId || srcId === dstId) continue;
      const key = `${srcId}|${dstId}|${r.keywords.toLowerCase()}`;
      if (relSeen.has(key)) continue;
      relSeen.add(key);
      relations.push({
        srcId,
        dstId,
        keywords: r.keywords,
        description: r.description,
      });
      if (relations.length >= MAX_RELATIONS_PER_LESSON) break;
    }

    if (relations.length > 0) {
      const relEmb = await this.gemini.embedBatch(
        relations.map((r) => `${r.keywords}. ${r.description}`),
      );
      await this.insertRelations(
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

  // ─── Cleanup ────────────────────────────────────────────────────────────────

  /** Gỡ mọi đóng góp của bài: xóa relation của bài, gỡ lessonId khỏi entity, xóa entity mồ côi. */
  private async cleanLessonContributions(
    courseId: string,
    lessonId: string,
  ): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.$executeRaw(Prisma.sql`
        DELETE FROM graph_relations
        WHERE course_id = ${courseId} AND lesson_id = ${lessonId}
      `),
      this.prisma.$executeRaw(Prisma.sql`
        UPDATE graph_entities
        SET lesson_ids = array_remove(lesson_ids, ${lessonId}), updated_at = now()
        WHERE course_id = ${courseId} AND ${lessonId} = ANY(lesson_ids)
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
    const sectionArr = sectionId
      ? Prisma.sql`ARRAY[${sectionId}]::text[]`
      : Prisma.sql`ARRAY[]::text[]`;
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
          ${e.description}, ARRAY[${lessonId}]::text[], ${sectionArr}, 0, ${vec}, now()
        )`;
      });
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO graph_entities
          (id, course_id, name, norm_name, type, description, lesson_ids, section_ids, degree, embedding, updated_at)
        VALUES ${Prisma.join(values)}
        ON CONFLICT (course_id, norm_name) DO UPDATE SET
          name = EXCLUDED.name,
          type = EXCLUDED.type,
          description = CASE
            WHEN length(EXCLUDED.description) > length(graph_entities.description)
            THEN EXCLUDED.description ELSE graph_entities.description END,
          lesson_ids = ARRAY(SELECT DISTINCT unnest(graph_entities.lesson_ids || EXCLUDED.lesson_ids)),
          section_ids = ARRAY(SELECT DISTINCT unnest(graph_entities.section_ids || EXCLUDED.section_ids)),
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

  private async insertRelations(
    courseId: string,
    sectionId: string | null,
    lessonId: string,
    relations: Array<{
      srcId: string;
      dstId: string;
      keywords: string;
      description: string;
    }>,
    embeddings: number[][],
  ): Promise<void> {
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
          ${r.description}, ${lessonId}, ${sectionId}, 1, ${vec}, now()
        )`;
      });
      await this.prisma.$executeRaw(Prisma.sql`
        INSERT INTO graph_relations
          (id, course_id, src_id, dst_id, keywords, description, lesson_id, section_id, weight, embedding, created_at)
        VALUES ${Prisma.join(values)}
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

/** Gộp các đoạn nội dung thành lô không vượt `cap` ký tự. */
function groupByChars(contents: string[], cap: number): string[] {
  const groups: string[] = [];
  let buf = '';
  for (const c of contents) {
    if (buf && buf.length + c.length > cap) {
      groups.push(buf);
      buf = '';
    }
    buf += (buf ? '\n\n' : '') + c;
  }
  if (buf) groups.push(buf);
  return groups;
}
