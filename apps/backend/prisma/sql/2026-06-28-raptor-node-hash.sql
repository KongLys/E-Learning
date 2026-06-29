-- Additive migration (DB dev bị drift — KHÔNG dùng prisma migrate dev).
-- Thêm cột node_hash để dựng cây RAPTOR tăng tiến: chỉ re-summarize/re-embed node
-- có nội dung nguồn thay đổi, tái dùng node không đổi (giảm token + embedding).
-- Chạy: npx prisma db execute --file prisma/sql/2026-06-28-raptor-node-hash.sql --schema prisma/schema.prisma

ALTER TABLE "raptor_nodes" ADD COLUMN IF NOT EXISTS "node_hash" TEXT;
