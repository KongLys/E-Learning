-- LightRAG nâng cấp (bám sát bài báo gốc hơn):
--   (1) dùng degree (entity) + weight (relation) làm tín hiệu rank.
--   (2) weight = SỐ BÀI đóng góp cạnh: dedup quan hệ theo cặp (course, src, dst),
--       tích lũy qua nhiều bài thay vì mỗi bài một dòng weight=1.
--   (3) chunk-level provenance: entity + relation lưu chunk_ids nguồn → truy hồi
--       kéo đúng chunk thay vì nở ra cả bài.
--
-- Đồ thị là dữ liệu DẪN XUẤT từ course_chunks → TRUNCATE an toàn; dựng lại bằng
-- re-index (benchmark/reindex.ts hoặc xuất bản lại khóa). KHÔNG đụng dữ liệu gốc.

TRUNCATE TABLE "graph_relations";
TRUNCATE TABLE "graph_entities" CASCADE;

-- (3) Entity: thêm chunk nguồn
ALTER TABLE "graph_entities"
  ADD COLUMN IF NOT EXISTS "chunk_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- (2)(3) Relation: chuyển bài/chương sang mảng + thêm chunk nguồn
ALTER TABLE "graph_relations"
  ADD COLUMN IF NOT EXISTS "lesson_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "graph_relations"
  ADD COLUMN IF NOT EXISTS "section_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "graph_relations"
  ADD COLUMN IF NOT EXISTS "chunk_ids" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Bỏ cột bài đơn cũ (đã thay bằng mảng) + index của nó
DROP INDEX IF EXISTS "graph_relations_lesson_id_idx";
ALTER TABLE "graph_relations" DROP COLUMN IF EXISTS "lesson_id";
ALTER TABLE "graph_relations" DROP COLUMN IF EXISTS "section_id";

-- (2) Dedup cạnh theo cặp có hướng trong 1 khóa → cho phép upsert tích lũy weight
CREATE UNIQUE INDEX IF NOT EXISTS "graph_relations_course_src_dst_key"
  ON "graph_relations"("course_id", "src_id", "dst_id");

-- Index GIN hỗ trợ lọc scope theo mảng bài (= ANY(lesson_ids))
CREATE INDEX IF NOT EXISTS "graph_entities_lesson_ids_gin"
  ON "graph_entities" USING gin ("lesson_ids");
CREATE INDEX IF NOT EXISTS "graph_relations_lesson_ids_gin"
  ON "graph_relations" USING gin ("lesson_ids");
