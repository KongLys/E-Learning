-- lesson_ai_toc_pipeline: chuyển AI pipeline từ tài liệu khóa học sang bài học.
-- Áp dụng thủ công bằng `prisma db execute` vì `db push` không xử lý được
-- cột generated content_tsv khi ALTER course_chunks.
-- (Dữ liệu course_mindmaps/course_chunks đã được xóa trước bởi cleanup-material-data.sql)

-- 1. course_chunks: bỏ material, thêm section_id để truy vấn theo Phần
ALTER TABLE "course_chunks" DROP CONSTRAINT IF EXISTS "course_chunks_material_id_fkey";
DROP INDEX IF EXISTS "course_chunks_material_id_idx";
ALTER TABLE "course_chunks" DROP COLUMN IF EXISTS "material_id";
ALTER TABLE "course_chunks" ADD COLUMN IF NOT EXISTS "section_id" TEXT;
CREATE INDEX IF NOT EXISTS "course_chunks_section_id_idx" ON "course_chunks"("section_id");
CREATE INDEX IF NOT EXISTS "course_chunks_lesson_id_idx" ON "course_chunks"("lesson_id");

-- 2. course_mindmaps: scope theo khóa (1 mindmap / khóa)
ALTER TABLE "course_mindmaps" DROP CONSTRAINT IF EXISTS "course_mindmaps_material_id_fkey";
DROP INDEX IF EXISTS "course_mindmaps_material_id_key";
DROP INDEX IF EXISTS "course_mindmaps_course_id_idx";
ALTER TABLE "course_mindmaps" DROP COLUMN IF EXISTS "material_id";
CREATE UNIQUE INDEX IF NOT EXISTS "course_mindmaps_course_id_key" ON "course_mindmaps"("course_id");

-- 3. course_materials: bỏ bảng — DocumentAsset (document_assets) thay thế
DROP TABLE IF EXISTS "course_materials";

-- 4. lessons: bộ trường kiểm duyệt AI (cùng pattern với courses)
ALTER TABLE "lessons"
  ADD COLUMN IF NOT EXISTS "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS "moderation_label" TEXT,
  ADD COLUMN IF NOT EXISTS "moderation_score" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "moderation_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "appeal_reason" TEXT,
  ADD COLUMN IF NOT EXISTS "moderated_at" TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "lessons_moderation_status_idx" ON "lessons"("moderation_status");

-- 5. document_assets: trạng thái chuyển đổi file
ALTER TABLE "document_assets"
  ADD COLUMN IF NOT EXISTS "markdown_url" TEXT,
  ADD COLUMN IF NOT EXISTS "llama_parse_job_id" TEXT,
  ADD COLUMN IF NOT EXISTS "parse_status" "MaterialStatus" NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS "error_msg" TEXT,
  ADD COLUMN IF NOT EXISTS "chunk_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
