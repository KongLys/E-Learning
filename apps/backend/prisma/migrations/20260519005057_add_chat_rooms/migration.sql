-- CreateTable
CREATE TABLE "chat_rooms" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "instructor_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "chat_rooms_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "chat_rooms_student_id_idx" ON "chat_rooms"("student_id");

-- CreateIndex
CREATE INDEX "chat_rooms_instructor_id_idx" ON "chat_rooms"("instructor_id");

-- CreateIndex
CREATE INDEX "chat_rooms_course_id_idx" ON "chat_rooms"("course_id");

-- CreateIndex
CREATE UNIQUE INDEX "chat_rooms_student_id_instructor_id_course_id_key" ON "chat_rooms"("student_id", "instructor_id", "course_id");

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_instructor_id_fkey" FOREIGN KEY ("instructor_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chat_rooms" ADD CONSTRAINT "chat_rooms_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
