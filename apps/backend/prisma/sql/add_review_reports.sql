-- Manual, scoped DDL for the review-report feature.
-- Applied via `prisma db execute` because the shared DB has drift on an
-- unrelated generated column (course_chunks.content_tsv) that blocks db push.

DO $$ BEGIN
  CREATE TYPE "ReviewReportReason" AS ENUM (
    'inappropriate_harmful', 'inappropriate_other', 'misconduct',
    'policy_violation', 'spam', 'inappropriate_ad', 'other'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE "ReportStatus" AS ENUM ('pending', 'resolved', 'dismissed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

ALTER TABLE "reviews" ADD COLUMN IF NOT EXISTS "is_hidden" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "review_reports" (
  "id" TEXT NOT NULL,
  "review_id" TEXT NOT NULL,
  "reporter_id" TEXT NOT NULL,
  "reason" "ReviewReportReason" NOT NULL,
  "detail" TEXT,
  "status" "ReportStatus" NOT NULL DEFAULT 'pending',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "review_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "review_reports_status_idx" ON "review_reports"("status");
CREATE INDEX IF NOT EXISTS "review_reports_review_id_idx" ON "review_reports"("review_id");

DO $$ BEGIN
  ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_review_id_fkey"
    FOREIGN KEY ("review_id") REFERENCES "reviews"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "review_reports" ADD CONSTRAINT "review_reports_reporter_id_fkey"
    FOREIGN KEY ("reporter_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
