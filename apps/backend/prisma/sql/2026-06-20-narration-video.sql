-- Additive migration (DB dev bị drift — KHÔNG dùng prisma migrate dev).
-- Tạo bảng cho 2 tính năng AI thay cho podcast: giọng đọc (TTS) + video ngắn (Remotion).
-- Chạy: npx prisma db execute --file prisma/sql/2026-06-20-narration-video.sql --schema prisma/schema.prisma

CREATE TABLE IF NOT EXISTS "narration_assets" (
  "id"           TEXT PRIMARY KEY,
  "lesson_id"    TEXT NOT NULL,
  "status"       TEXT NOT NULL DEFAULT 'pending',
  "audio_url"    TEXT,
  "duration_sec" INTEGER NOT NULL DEFAULT 0,
  "voice"        TEXT,
  "error_msg"    TEXT,
  "created_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "narration_assets_lesson_id_fkey"
    FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "narration_assets_lesson_id_key"
  ON "narration_assets"("lesson_id");

CREATE TABLE IF NOT EXISTS "lesson_video_assets" (
  "id"            TEXT PRIMARY KEY,
  "lesson_id"     TEXT NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'pending',
  "video_url"     TEXT,
  "thumbnail_url" TEXT,
  "duration_sec"  INTEGER NOT NULL DEFAULT 0,
  "sections_json" JSONB NOT NULL DEFAULT '[]',
  "model"         TEXT,
  "error_msg"     TEXT,
  "created_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "lesson_video_assets_lesson_id_fkey"
    FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "lesson_video_assets_lesson_id_key"
  ON "lesson_video_assets"("lesson_id");

-- Tùy chọn: gỡ bảng podcast cũ sau khi đã rời bỏ tính năng (giữ lại cũng không sao).
-- DROP TABLE IF EXISTS "podcast_assets";
