-- CreateEnum
CREATE TYPE "MindmapStatus" AS ENUM ('pending', 'generating', 'ready', 'failed');

-- CreateTable
CREATE TABLE "course_mindmaps" (
    "id" TEXT NOT NULL,
    "material_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "structure" JSONB NOT NULL,
    "markmap" TEXT NOT NULL,
    "status" "MindmapStatus" NOT NULL DEFAULT 'pending',
    "error_msg" TEXT,
    "token_usage" INTEGER NOT NULL DEFAULT 0,
    "source_hash" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_mindmaps_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "course_mindmaps_material_id_key" ON "course_mindmaps"("material_id");

-- CreateIndex
CREATE INDEX "course_mindmaps_course_id_idx" ON "course_mindmaps"("course_id");

-- AddForeignKey
ALTER TABLE "course_mindmaps" ADD CONSTRAINT "course_mindmaps_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "course_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_mindmaps" ADD CONSTRAINT "course_mindmaps_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
