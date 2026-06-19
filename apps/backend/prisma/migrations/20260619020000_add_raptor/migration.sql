-- RAPTOR: cây tóm tắt phân cấp. Additive — không đụng dữ liệu hiện có.
-- Lá của cây vẫn là course_chunks; bảng này chỉ chứa node tóm tắt các tầng.

-- CreateTable: meta build theo từng khóa (cache theo source_hash, mirror course_mindmaps)
CREATE TABLE "course_raptor_trees" (
    "course_id" TEXT NOT NULL,
    "status" "MindmapStatus" NOT NULL DEFAULT 'pending',
    "error_msg" TEXT,
    "token_usage" INTEGER NOT NULL DEFAULT 0,
    "source_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_raptor_trees_pkey" PRIMARY KEY ("course_id")
);

-- CreateTable: node tóm tắt (level 1=bài, 2=phần, 3=gốc khóa)
CREATE TABLE "raptor_nodes" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "section_id" TEXT,
    "lesson_id" TEXT,
    "level" INTEGER NOT NULL,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "child_chunk_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "child_node_ids" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embedding" vector(768),
    "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(content, ''))) STORED,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "raptor_nodes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "raptor_nodes_course_id_idx" ON "raptor_nodes"("course_id");

-- CreateIndex
CREATE INDEX "raptor_nodes_lesson_id_idx" ON "raptor_nodes"("lesson_id");

-- CreateIndex
CREATE INDEX "raptor_nodes_level_idx" ON "raptor_nodes"("level");

-- CreateIndex (HNSW vector index cho ANN cosine — giống course_chunks)
CREATE INDEX "raptor_nodes_embedding_hnsw" ON "raptor_nodes" USING hnsw ("embedding" vector_cosine_ops);

-- CreateIndex (GIN tsvector cho full-text search)
CREATE INDEX "raptor_nodes_content_tsv_gin" ON "raptor_nodes" USING gin ("content_tsv");

-- AddForeignKey
ALTER TABLE "course_raptor_trees" ADD CONSTRAINT "course_raptor_trees_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "raptor_nodes" ADD CONSTRAINT "raptor_nodes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
