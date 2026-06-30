-- Phụ đề song ngữ (Việt/Anh) cho video bài giảng.
-- Additive — áp tay trên Supabase dev (KHÔNG dùng `prisma migrate dev`, xem memory prisma-db-drift).
-- cues_json/segments_json giữ nguyên = bản GỐC (transcript_lang) và là nguồn DUY NHẤT để embed.
ALTER TABLE video_assets
  ADD COLUMN IF NOT EXISTS cues_vi_json     jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS cues_en_json     jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS segments_vi_json jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS segments_en_json jsonb NOT NULL DEFAULT '[]';
