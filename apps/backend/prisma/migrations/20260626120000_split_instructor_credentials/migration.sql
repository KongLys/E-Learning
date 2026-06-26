-- Tách "bằng cấp" khỏi trường kinh nghiệm + cho phép đính kèm file bằng cấp (ảnh/PDF).
-- Additive: an toàn với dữ liệu hiện có.
ALTER TABLE "instructor_applications" ADD COLUMN "qualifications" TEXT;
ALTER TABLE "instructor_applications" ADD COLUMN "credential_files" JSONB NOT NULL DEFAULT '[]';
