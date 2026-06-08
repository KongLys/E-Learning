-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('pending', 'approved', 'rejected', 'appealing', 'locked');

-- AlterTable
ALTER TABLE "courses"
  ADD COLUMN "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "moderation_label" TEXT,
  ADD COLUMN "moderation_score" DOUBLE PRECISION,
  ADD COLUMN "moderation_reason" TEXT,
  ADD COLUMN "appeal_reason" TEXT,
  ADD COLUMN "moderated_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "course_materials"
  ADD COLUMN "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'pending',
  ADD COLUMN "moderation_label" TEXT,
  ADD COLUMN "moderation_score" DOUBLE PRECISION,
  ADD COLUMN "moderation_reason" TEXT,
  ADD COLUMN "appeal_reason" TEXT,
  ADD COLUMN "moderated_at" TIMESTAMP(3);

-- Existing courses/materials were created before moderation existed; treat them as approved.
UPDATE "courses" SET "moderation_status" = 'approved' WHERE "moderation_status" = 'pending';
UPDATE "course_materials" SET "moderation_status" = 'approved' WHERE "status" = 'ready';

-- CreateIndex
CREATE INDEX "courses_moderation_status_idx" ON "courses"("moderation_status");
CREATE INDEX "course_materials_moderation_status_idx" ON "course_materials"("moderation_status");
