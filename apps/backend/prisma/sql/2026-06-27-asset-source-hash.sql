-- Additive migration (DB dev bị drift — KHÔNG dùng prisma migrate dev).
-- Thêm cột source_hash để chỉ sinh lại giọng đọc/video cho bài thực sự đổi nội dung
-- khi xuất bản lại (skip-if-unchanged).
-- Chạy: npx prisma db execute --file prisma/sql/2026-06-27-asset-source-hash.sql --schema prisma/schema.prisma

ALTER TABLE "narration_assets"    ADD COLUMN IF NOT EXISTS "source_hash" TEXT;
ALTER TABLE "lesson_video_assets" ADD COLUMN IF NOT EXISTS "source_hash" TEXT;
