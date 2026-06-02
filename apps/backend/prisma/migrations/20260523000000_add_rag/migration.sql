-- Enable pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- CreateEnum
CREATE TYPE "MaterialStatus" AS ENUM ('uploaded', 'parsing', 'parsed', 'ready', 'failed');

-- CreateTable
CREATE TABLE "course_materials" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "file_url" TEXT NOT NULL,
    "markdown_url" TEXT,
    "file_type" TEXT NOT NULL,
    "file_size" BIGINT NOT NULL DEFAULT 0,
    "llama_parse_job_id" TEXT,
    "status" "MaterialStatus" NOT NULL DEFAULT 'uploaded',
    "error_msg" TEXT,
    "chunk_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_chunks" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "material_id" TEXT,
    "lesson_id" TEXT,
    "source_type" TEXT NOT NULL,
    "section_title" TEXT,
    "page_number" INTEGER,
    "chunk_index" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL DEFAULT 0,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "embedding" vector(768),
    "content_tsv" tsvector GENERATED ALWAYS AS (to_tsvector('simple', COALESCE(content, ''))) STORED,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "course_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_conversations" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "title" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_messages" (
    "id" TEXT NOT NULL,
    "conversation_id" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "citations" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "course_materials_course_id_idx" ON "course_materials"("course_id");

-- CreateIndex
CREATE INDEX "course_chunks_course_id_idx" ON "course_chunks"("course_id");

-- CreateIndex
CREATE INDEX "course_chunks_material_id_idx" ON "course_chunks"("material_id");

-- CreateIndex (HNSW vector index for fast ANN search with cosine distance)
CREATE INDEX "course_chunks_embedding_hnsw" ON "course_chunks" USING hnsw ("embedding" vector_cosine_ops);

-- CreateIndex (GIN tsvector index for full-text search)
CREATE INDEX "course_chunks_content_tsv_gin" ON "course_chunks" USING gin ("content_tsv");

-- CreateIndex
CREATE INDEX "ai_conversations_user_id_course_id_idx" ON "ai_conversations"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "ai_messages_conversation_id_created_at_idx" ON "ai_messages"("conversation_id", "created_at");

-- AddForeignKey
ALTER TABLE "course_materials" ADD CONSTRAINT "course_materials_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_chunks" ADD CONSTRAINT "course_chunks_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_chunks" ADD CONSTRAINT "course_chunks_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "course_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_conversations" ADD CONSTRAINT "ai_conversations_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_messages" ADD CONSTRAINT "ai_messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "ai_conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
