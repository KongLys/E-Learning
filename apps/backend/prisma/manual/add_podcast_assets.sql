-- Additive: create podcast_assets table (AI podcast for document lessons).
-- Applied manually because the dev DB is drifted (do NOT use prisma migrate dev).
CREATE TABLE IF NOT EXISTS "podcast_assets" (
  "id" TEXT NOT NULL,
  "lesson_id" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "audio_url" TEXT,
  "duration_sec" INTEGER NOT NULL DEFAULT 0,
  "voice" TEXT,
  "error_msg" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "podcast_assets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "podcast_assets_lesson_id_key"
  ON "podcast_assets"("lesson_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'podcast_assets_lesson_id_fkey'
  ) THEN
    ALTER TABLE "podcast_assets"
      ADD CONSTRAINT "podcast_assets_lesson_id_fkey"
      FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
