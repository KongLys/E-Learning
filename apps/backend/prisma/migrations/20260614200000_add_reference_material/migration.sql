-- CreateEnum
CREATE TYPE "ReferenceMaterialType" AS ENUM ('video', 'youtube', 'file');

-- CreateTable
CREATE TABLE "reference_materials" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "type" "ReferenceMaterialType" NOT NULL,
    "file_url" TEXT,
    "file_name" TEXT,
    "file_type" TEXT,
    "file_size" BIGINT,
    "external_url" TEXT,
    "order_index" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_materials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reference_materials_course_id_idx" ON "reference_materials"("course_id");

-- AddForeignKey
ALTER TABLE "reference_materials" ADD CONSTRAINT "reference_materials_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
