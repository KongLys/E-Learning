-- LightRAG: đồ thị tri thức (entity + relation) cho dual-level retrieval.
-- Additive — không đụng dữ liệu hiện có. pgvector đã bật ở migration add_rag.

-- CreateTable: thực thể, dedup theo (course_id, norm_name)
CREATE TABLE "graph_entities" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "norm_name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'other',
    "description" TEXT NOT NULL,
    "lesson_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "section_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "degree" INTEGER NOT NULL DEFAULT 0,
    "embedding" vector(768),
    "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(name, '') || ' ' || COALESCE(description, ''))) STORED,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "graph_entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable: quan hệ có hướng giữa 2 entity
CREATE TABLE "graph_relations" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "src_id" TEXT NOT NULL,
    "dst_id" TEXT NOT NULL,
    "keywords" TEXT NOT NULL DEFAULT '',
    "description" TEXT NOT NULL,
    "lesson_id" TEXT,
    "section_id" TEXT,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "embedding" vector(768),
    "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(keywords, '') || ' ' || COALESCE(description, ''))) STORED,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "graph_relations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (dedup entity theo khóa)
CREATE UNIQUE INDEX "graph_entities_course_id_norm_name_key" ON "graph_entities"("course_id", "norm_name");

-- CreateIndex
CREATE INDEX "graph_entities_course_id_idx" ON "graph_entities"("course_id");

-- CreateIndex (HNSW vector ANN cosine — giống course_chunks/raptor_nodes)
CREATE INDEX "graph_entities_embedding_hnsw" ON "graph_entities" USING hnsw ("embedding" vector_cosine_ops);

-- CreateIndex (GIN tsvector cho full-text)
CREATE INDEX "graph_entities_content_tsv_gin" ON "graph_entities" USING gin ("content_tsv");

-- CreateIndex
CREATE INDEX "graph_relations_course_id_idx" ON "graph_relations"("course_id");

-- CreateIndex
CREATE INDEX "graph_relations_lesson_id_idx" ON "graph_relations"("lesson_id");

-- CreateIndex
CREATE INDEX "graph_relations_src_id_idx" ON "graph_relations"("src_id");

-- CreateIndex
CREATE INDEX "graph_relations_dst_id_idx" ON "graph_relations"("dst_id");

-- CreateIndex (HNSW vector ANN cosine)
CREATE INDEX "graph_relations_embedding_hnsw" ON "graph_relations" USING hnsw ("embedding" vector_cosine_ops);

-- CreateIndex (GIN tsvector cho full-text)
CREATE INDEX "graph_relations_content_tsv_gin" ON "graph_relations" USING gin ("content_tsv");

-- AddForeignKey
ALTER TABLE "graph_entities" ADD CONSTRAINT "graph_entities_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "graph_relations" ADD CONSTRAINT "graph_relations_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
