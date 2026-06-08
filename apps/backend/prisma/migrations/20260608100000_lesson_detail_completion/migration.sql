-- AlterTable: video completion mode
ALTER TABLE "video_assets" ADD COLUMN "completion_mode" TEXT NOT NULL DEFAULT 'percent_90';

-- AlterTable: document reading content + minimum read time
ALTER TABLE "document_assets" ADD COLUMN "content_html" TEXT;
ALTER TABLE "document_assets" ADD COLUMN "min_read_time_sec" INTEGER NOT NULL DEFAULT 0;
