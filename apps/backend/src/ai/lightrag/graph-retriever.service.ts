import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { GeminiService } from '../providers/gemini.service';
import { RetrievedChunk, ChunkScope } from '../vector/vector-store.service';

export interface GraphRetrieval {
  /** Chunk nguồn (đã gắn score theo độ liên quan đồ thị) để fuse với pool vector. */
  chunks: RetrievedChunk[];
  /** Bản tóm tắt entity + relation, bơm vào prompt để model suy luận quan hệ. */
  graphContext: string;
}

interface EntityRow {
  id: string;
  name: string;
  type: string;
  description: string;
  lesson_ids: string[];
  chunk_ids: string[];
  score: number;
}
interface RelationRow {
  id: string;
  src_id: string;
  dst_id: string;
  keywords: string;
  description: string;
  lesson_ids: string[];
  chunk_ids: string[];
  score: number;
}

/**
 * Truy hồi dual-level kiểu LightRAG trên đồ thị tri thức của khóa học:
 *  - low-level: từ khóa thực thể → match graph_entities (vector + FTS).
 *  - high-level: từ khóa chủ đề/quan hệ → match graph_relations.
 * Mở rộng 1-hop quanh các nút tìm được, rồi quy về course_chunks của các bài liên
 * quan để tái dùng rerank/compress của RAG. Trả thêm "graph context" cho prompt.
 */
@Injectable()
export class GraphRetrieverService {
  private readonly logger = new Logger(GraphRetrieverService.name);
  private readonly topEntities: number;
  private readonly topRelations: number;
  private readonly chunkLimit: number;
  private readonly maxHops: number;
  /** Trọng số cộng thêm theo degree (entity) / weight (relation) vào điểm RRF. */
  private readonly degreeBoost: number;
  private readonly relWeightBoost: number;

  constructor(
    private prisma: PrismaService,
    private gemini: GeminiService,
    config: ConfigService,
  ) {
    this.topEntities = config.get<number>('GRAPH_TOP_ENTITIES', 8);
    this.topRelations = config.get<number>('GRAPH_TOP_RELATIONS', 8);
    this.chunkLimit = config.get<number>('GRAPH_RETRIEVE_TOP', 30);
    this.maxHops = config.get<number>('GRAPH_MAX_HOPS', 1);
    // A1: tắt boost degree/weight theo MẶC ĐỊNH. Benchmark cho thấy boost theo độ
    // trung tâm tuyệt đối đẩy entity hub generic (vd "UX","user") lên cho mọi câu
    // → cùng cụm chunk bị trả về lặp lại, sai chủ đề. Vẫn để cấu hình bật lại nếu
    // muốn thử nghiệm (đặt env > 0).
    this.degreeBoost = config.get<number>('GRAPH_DEGREE_BOOST', 0);
    this.relWeightBoost = config.get<number>('GRAPH_REL_WEIGHT_BOOST', 0);
  }

  async retrieve(
    courseId: string,
    lowLevelKeywords: string[],
    highLevelKeywords: string[],
    scope?: ChunkScope,
  ): Promise<GraphRetrieval | null> {
    const lowText = lowLevelKeywords.join(', ').trim();
    const highText = highLevelKeywords.join(', ').trim();
    if (!lowText && !highText) return null;

    // Embed song song 2 tầng từ khóa.
    const [lowEmb, highEmb] = await Promise.all([
      lowText ? this.gemini.embedQuery(lowText) : Promise.resolve<number[]>([]),
      highText
        ? this.gemini.embedQuery(highText)
        : Promise.resolve<number[]>([]),
    ]);

    const [entities, relations] = await Promise.all([
      lowEmb.length
        ? this.searchEntities(courseId, lowEmb, lowText, scope)
        : Promise.resolve<EntityRow[]>([]),
      highEmb.length
        ? this.searchRelations(courseId, highEmb, highText, scope)
        : Promise.resolve<RelationRow[]>([]),
    ]);

    if (entities.length === 0 && relations.length === 0) return null;

    // 1-hop expansion quanh entity tìm được + 2 đầu mút của relation tìm được.
    const seedEntityIds = new Set<string>(entities.map((e) => e.id));
    for (const r of relations) {
      seedEntityIds.add(r.src_id);
      seedEntityIds.add(r.dst_id);
    }
    const hopRelations =
      this.maxHops > 0 && seedEntityIds.size > 0
        ? await this.neighborRelations(courseId, [...seedEntityIds], scope)
        : [];

    // Gộp relation (tìm được + 1-hop), dedup theo id.
    const relById = new Map<string, RelationRow>();
    for (const r of relations) relById.set(r.id, r);
    for (const r of hopRelations) if (!relById.has(r.id)) relById.set(r.id, r);
    const allRelations = [...relById.values()];

    // Tập entity id cần tra tên/mô tả để dựng context.
    const entityIds = new Set<string>(seedEntityIds);
    for (const r of allRelations) {
      entityIds.add(r.src_id);
      entityIds.add(r.dst_id);
    }
    const entityDetail = await this.entityDetails(courseId, [...entityIds]);

    // A2: điểm chunk theo ĐỒNG THUẬN + PHẠT HUB (thay cho max trước đây).
    //  - Cộng dồn đóng góp: chunk được NHIỀU entity/relation khớp-query trỏ tới sẽ
    //    nổi lên (tín hiệu đồng thuận), thay vì để 1 entity hub quyết định bằng max.
    //  - Phạt entity/relation phổ biến: chia đóng góp cho log số chunk nó trỏ tới —
    //    entity hub (trỏ rất nhiều chunk) bị hạ trọng số, nhường chỗ cho entity đặc
    //    thù của câu hỏi. Đây là sửa trực tiếp cho hiện tượng "cụm hub lặp lại".
    const chunkScore = new Map<string, number>();
    const addChunks = (ids: string[] | undefined, score: number) => {
      const n = ids?.length ?? 0;
      if (n === 0) return;
      const spread = 1 / Math.log2(2 + n); // n lớn (hub) → spread nhỏ
      for (const id of ids!)
        chunkScore.set(id, (chunkScore.get(id) ?? 0) + score * spread);
    };
    for (const e of entities) addChunks(e.chunk_ids, e.score);
    for (const r of allRelations) addChunks(r.chunk_ids, r.score || 1e-4);

    let chunks: RetrievedChunk[] = [];
    if (chunkScore.size > 0) {
      chunks = await this.chunksByIds(
        courseId,
        [...chunkScore.keys()],
        chunkScore,
        scope,
      );
    } else {
      // Fallback dữ liệu cũ (chưa có chunk_ids): quy về bài như trước.
      const lessonScore = new Map<string, number>();
      const bump = (lessonId: string, score: number) =>
        lessonScore.set(lessonId, Math.max(lessonScore.get(lessonId) ?? 0, score));
      for (const e of entities) for (const l of e.lesson_ids) bump(l, e.score);
      for (const r of allRelations)
        for (const l of r.lesson_ids) bump(l, r.score || 1e-4);
      const lessonIds = [...lessonScore.keys()];
      chunks = lessonIds.length
        ? await this.chunksForLessons(courseId, lessonIds, lessonScore, scope)
        : [];
    }

    const graphContext = buildGraphContext(entityDetail, allRelations);
    this.logger.debug(
      `[Graph] entities=${entities.length} relations=${allRelations.length} chunks=${chunks.length}`,
    );
    return { chunks, graphContext };
  }

  // ─── SQL: low-level entity search ─────────────────────────────────────────────

  private async searchEntities(
    courseId: string,
    embedding: number[],
    queryText: string,
    scope?: ChunkScope,
  ): Promise<EntityRow[]> {
    const vec = `[${embedding.join(',')}]`;
    const scopeSql = Prisma.sql`${
      scope?.lessonId
        ? Prisma.sql` AND ${scope.lessonId} = ANY(lesson_ids)`
        : Prisma.empty
    }${
      scope?.sectionId
        ? Prisma.sql` AND ${scope.sectionId} = ANY(section_ids)`
        : Prisma.empty
    }`;
    const rows = await this.prisma.$queryRaw<EntityRow[]>(Prisma.sql`
      WITH vec AS (
        SELECT id, row_number() OVER (ORDER BY embedding <=> ${vec}::vector) AS rnk
        FROM graph_entities
        WHERE course_id = ${courseId} AND embedding IS NOT NULL${scopeSql}
        ORDER BY embedding <=> ${vec}::vector
        LIMIT 50
      ),
      fts AS (
        SELECT id, row_number() OVER (ORDER BY ts_rank(content_tsv, plainto_tsquery('simple', ${queryText})) DESC) AS rnk
        FROM graph_entities
        WHERE course_id = ${courseId}
          AND content_tsv @@ plainto_tsquery('simple', ${queryText})${scopeSql}
        LIMIT 50
      )
      SELECT e.id, e.name, e.type, e.description, e.lesson_ids, e.chunk_ids,
             (COALESCE(1.0/(60 + vec.rnk), 0) + COALESCE(1.0/(60 + fts.rnk), 0)
              + ${this.degreeBoost} * (e.degree::float / (e.degree + 5)))::float AS score
      FROM graph_entities e
      LEFT JOIN vec ON vec.id = e.id
      LEFT JOIN fts ON fts.id = e.id
      WHERE vec.id IS NOT NULL OR fts.id IS NOT NULL
      ORDER BY score DESC
      LIMIT ${this.topEntities};
    `);
    return rows;
  }

  // ─── SQL: high-level relation search ──────────────────────────────────────────

  private async searchRelations(
    courseId: string,
    embedding: number[],
    queryText: string,
    scope?: ChunkScope,
  ): Promise<RelationRow[]> {
    const vec = `[${embedding.join(',')}]`;
    const scopeSql = relScopeSql(scope);
    const rows = await this.prisma.$queryRaw<RelationRow[]>(Prisma.sql`
      WITH vec AS (
        SELECT id, row_number() OVER (ORDER BY embedding <=> ${vec}::vector) AS rnk
        FROM graph_relations
        WHERE course_id = ${courseId} AND embedding IS NOT NULL${scopeSql}
        ORDER BY embedding <=> ${vec}::vector
        LIMIT 50
      ),
      fts AS (
        SELECT id, row_number() OVER (ORDER BY ts_rank(content_tsv, plainto_tsquery('simple', ${queryText})) DESC) AS rnk
        FROM graph_relations
        WHERE course_id = ${courseId}
          AND content_tsv @@ plainto_tsquery('simple', ${queryText})${scopeSql}
        LIMIT 50
      )
      SELECT r.id, r.src_id, r.dst_id, r.keywords, r.description, r.lesson_ids, r.chunk_ids,
             (COALESCE(1.0/(60 + vec.rnk), 0) + COALESCE(1.0/(60 + fts.rnk), 0)
              + ${this.relWeightBoost} * (r.weight / (r.weight + 3)))::float AS score
      FROM graph_relations r
      LEFT JOIN vec ON vec.id = r.id
      LEFT JOIN fts ON fts.id = r.id
      WHERE vec.id IS NOT NULL OR fts.id IS NOT NULL
      ORDER BY score DESC
      LIMIT ${this.topRelations};
    `);
    return rows;
  }

  /** Quan hệ kề các entity hạt giống (1-hop), ưu tiên weight cao. */
  private async neighborRelations(
    courseId: string,
    entityIds: string[],
    scope?: ChunkScope,
  ): Promise<RelationRow[]> {
    const scopeSql = relScopeSql(scope);
    return this.prisma.$queryRaw<RelationRow[]>(Prisma.sql`
      SELECT id, src_id, dst_id, keywords, description, lesson_ids, chunk_ids, 0::float AS score
      FROM graph_relations
      WHERE course_id = ${courseId}
        AND (src_id = ANY(${entityIds}) OR dst_id = ANY(${entityIds}))${scopeSql}
      ORDER BY weight DESC
      LIMIT ${this.topRelations * 2};
    `);
  }

  private async entityDetails(
    courseId: string,
    ids: string[],
  ): Promise<Map<string, { name: string; type: string; description: string }>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.graphEntity.findMany({
      where: { courseId, id: { in: ids } },
      select: { id: true, name: true, type: true, description: true },
    });
    return new Map(
      rows.map((r) => [
        r.id,
        { name: r.name, type: r.type, description: r.description },
      ]),
    );
  }

  /** Lấy course_chunks của các bài liên quan, loại bài quiz, gắn score theo bài. */
  private async chunksForLessons(
    courseId: string,
    lessonIds: string[],
    lessonScore: Map<string, number>,
    scope?: ChunkScope,
  ): Promise<RetrievedChunk[]> {
    const scopeSql = Prisma.sql`${
      scope?.lessonId
        ? Prisma.sql` AND lesson_id = ${scope.lessonId}`
        : Prisma.empty
    }${
      scope?.sectionId
        ? Prisma.sql` AND section_id = ${scope.sectionId}`
        : Prisma.empty
    }`;
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        content: string;
        section_title: string | null;
        page_number: number | null;
        section_id: string | null;
        lesson_id: string | null;
        source_type: string;
      }>
    >(Prisma.sql`
      SELECT id, content, section_title, page_number, section_id, lesson_id, source_type
      FROM course_chunks
      WHERE course_id = ${courseId} AND lesson_id = ANY(${lessonIds})${scopeSql}
        AND NOT EXISTS (
          SELECT 1 FROM lessons ql
          WHERE ql.id = course_chunks.lesson_id AND ql.type::text = 'quiz'
        )
      ORDER BY chunk_index ASC
      LIMIT ${this.chunkLimit};
    `);
    return rows
      .map((r) => ({
        id: r.id,
        content: r.content,
        sectionTitle: r.section_title,
        pageNumber: r.page_number,
        sectionId: r.section_id,
        lessonId: r.lesson_id,
        sourceType: r.source_type,
        score: r.lesson_id ? (lessonScore.get(r.lesson_id) ?? 0) : 0,
      }))
      .sort((a, b) => b.score - a.score);
  }

  /**
   * Kéo chính các course_chunks là nguồn của entity/relation (chunk-level), loại
   * bài quiz, gắn score theo chunk rồi lấy top `chunkLimit`. Chính xác hơn cách
   * cũ (nở ra cả bài) vì chỉ lấy đoạn thực sự sinh ra tri thức liên quan.
   */
  private async chunksByIds(
    courseId: string,
    chunkIds: string[],
    chunkScore: Map<string, number>,
    scope?: ChunkScope,
  ): Promise<RetrievedChunk[]> {
    const scopeSql = Prisma.sql`${
      scope?.lessonId
        ? Prisma.sql` AND lesson_id = ${scope.lessonId}`
        : Prisma.empty
    }${
      scope?.sectionId
        ? Prisma.sql` AND section_id = ${scope.sectionId}`
        : Prisma.empty
    }`;
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        content: string;
        section_title: string | null;
        page_number: number | null;
        section_id: string | null;
        lesson_id: string | null;
        source_type: string;
      }>
    >(Prisma.sql`
      SELECT id, content, section_title, page_number, section_id, lesson_id, source_type
      FROM course_chunks
      WHERE course_id = ${courseId} AND id = ANY(${chunkIds})${scopeSql}
        AND NOT EXISTS (
          SELECT 1 FROM lessons ql
          WHERE ql.id = course_chunks.lesson_id AND ql.type::text = 'quiz'
        );
    `);
    return rows
      .map((r) => ({
        id: r.id,
        content: r.content,
        sectionTitle: r.section_title,
        pageNumber: r.page_number,
        sectionId: r.section_id,
        lessonId: r.lesson_id,
        sourceType: r.source_type,
        score: chunkScore.get(r.id) ?? 0,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, this.chunkLimit);
  }
}

// ─── Pure helpers ───────────────────────────────────────────────────────────────

/** Lọc scope cho graph_relations (bài/chương dạng MẢNG: = ANY(...)). */
function relScopeSql(scope?: ChunkScope): Prisma.Sql {
  return Prisma.sql`${
    scope?.lessonId
      ? Prisma.sql` AND ${scope.lessonId} = ANY(lesson_ids)`
      : Prisma.empty
  }${
    scope?.sectionId
      ? Prisma.sql` AND ${scope.sectionId} = ANY(section_ids)`
      : Prisma.empty
  }`;
}

function buildGraphContext(
  entityDetail: Map<
    string,
    { name: string; type: string; description: string }
  >,
  relations: RelationRow[],
): string {
  const lines: string[] = [];
  if (entityDetail.size > 0) {
    lines.push('Thực thể liên quan:');
    for (const e of entityDetail.values()) {
      lines.push(`- ${e.name}: ${e.description}`);
    }
  }
  if (relations.length > 0) {
    lines.push('', 'Quan hệ giữa các thực thể:');
    for (const r of relations) {
      const src = entityDetail.get(r.src_id)?.name ?? '?';
      const dst = entityDetail.get(r.dst_id)?.name ?? '?';
      const kw = r.keywords ? ` —[${r.keywords}]→ ` : ' → ';
      lines.push(`- ${src}${kw}${dst}: ${r.description}`);
    }
  }
  return lines.join('\n').trim();
}
