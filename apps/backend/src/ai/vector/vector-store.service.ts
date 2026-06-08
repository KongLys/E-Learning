import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface ChunkRow {
  courseId: string;
  materialId: string | null;
  lessonId: string | null;
  sourceType: 'material' | 'lesson_document';
  sectionTitle: string | null;
  pageNumber: number | null;
  chunkIndex: number;
  content: string;
  tokenCount: number;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

export interface RetrievedChunk {
  id: string;
  content: string;
  sectionTitle: string | null;
  pageNumber: number | null;
  materialId: string | null;
  lessonId: string | null;
  sourceType: string;
  score: number;
}

@Injectable()
export class VectorStoreService {
  constructor(private prisma: PrismaService) {}

  async upsertChunks(rows: ChunkRow[]): Promise<void> {
    if (rows.length === 0) return;
    // Bulk insert in batches to avoid Postgres parameter limit (~65535 params).
    const BATCH = 50;
    for (let i = 0; i < rows.length; i += BATCH) {
      const slice = rows.slice(i, i + BATCH);
      await this.insertBatch(slice);
    }
  }

  private async insertBatch(rows: ChunkRow[]): Promise<void> {
    const values: Prisma.Sql[] = rows.map((r) => {
      const vec = `[${r.embedding.join(',')}]`;
      return Prisma.sql`(
        gen_random_uuid(),
        ${r.courseId},
        ${r.materialId},
        ${r.lessonId},
        ${r.sourceType},
        ${r.sectionTitle},
        ${r.pageNumber},
        ${r.chunkIndex},
        ${r.content},
        ${r.tokenCount},
        ${JSON.stringify(r.metadata ?? {})}::jsonb,
        ${vec}::vector
      )`;
    });
    const sql = Prisma.sql`
      INSERT INTO course_chunks
        (id, course_id, material_id, lesson_id, source_type, section_title, page_number, chunk_index, content, token_count, metadata, embedding)
      VALUES ${Prisma.join(values)}
    `;
    await this.prisma.$executeRaw(sql);
  }

  async hybridSearch(
    courseId: string,
    queryEmbedding: number[],
    queryText: string,
    k = 50,
  ): Promise<RetrievedChunk[]> {
    const vec = `[${queryEmbedding.join(',')}]`;
    // Reciprocal Rank Fusion: combines vector ANN ranks with full-text ranks.
    // k=60 is a standard RRF constant.
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        content: string;
        section_title: string | null;
        page_number: number | null;
        material_id: string | null;
        lesson_id: string | null;
        source_type: string;
        rrf: number;
      }>
    >(Prisma.sql`
      WITH vec AS (
        SELECT id, row_number() OVER (ORDER BY embedding <=> ${vec}::vector) AS rnk
        FROM course_chunks
        WHERE course_id = ${courseId} AND embedding IS NOT NULL
        ORDER BY embedding <=> ${vec}::vector
        LIMIT 100
      ),
      fts AS (
        SELECT id,
               row_number() OVER (ORDER BY ts_rank(content_tsv, plainto_tsquery('simple', ${queryText})) DESC) AS rnk
        FROM course_chunks
        WHERE course_id = ${courseId}
          AND content_tsv @@ plainto_tsquery('simple', ${queryText})
        LIMIT 100
      )
      SELECT c.id, c.content, c.section_title, c.page_number,
             c.material_id, c.lesson_id, c.source_type,
             (COALESCE(1.0/(60 + vec.rnk), 0) + COALESCE(1.0/(60 + fts.rnk), 0))::float AS rrf
      FROM course_chunks c
      LEFT JOIN vec ON vec.id = c.id
      LEFT JOIN fts ON fts.id = c.id
      WHERE vec.id IS NOT NULL OR fts.id IS NOT NULL
      ORDER BY rrf DESC
      LIMIT ${k};
    `);

    return rows.map((r) => ({
      id: r.id,
      content: r.content,
      sectionTitle: r.section_title,
      pageNumber: r.page_number,
      materialId: r.material_id,
      lessonId: r.lesson_id,
      sourceType: r.source_type,
      score: r.rrf,
    }));
  }

  async deleteByMaterial(materialId: string): Promise<void> {
    await this.prisma.courseChunk.deleteMany({ where: { materialId } });
  }

  async deleteByLesson(lessonId: string): Promise<void> {
    await this.prisma.courseChunk.deleteMany({ where: { lessonId } });
  }
}
