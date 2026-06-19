-- Gộp AiQuiz vào ReviewQuiz: quiz qua chat lưu chung bảng review_quizzes (per-user).

-- Xóa dữ liệu quiz theo bài cũ (không có user_id để backfill, tạo lại được)
DELETE FROM "review_quizzes";

-- Thêm cột mới cho quiz qua chat (per-user)
ALTER TABLE "review_quizzes" ADD COLUMN "user_id" TEXT;
ALTER TABLE "review_quizzes" ADD COLUMN "course_id" TEXT;
ALTER TABLE "review_quizzes" ADD COLUMN "title" TEXT;

-- lesson_id cho phép NULL (giữ unique index review_quizzes_lesson_id_key sẵn có)
ALTER TABLE "review_quizzes" ALTER COLUMN "lesson_id" DROP NOT NULL;

-- FK + index mới
ALTER TABLE "review_quizzes" ADD CONSTRAINT "review_quizzes_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "review_quizzes" ADD CONSTRAINT "review_quizzes_course_id_fkey"
  FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "review_quizzes_user_id_course_id_idx" ON "review_quizzes"("user_id", "course_id");

-- Drop hẳn các bảng AiQuiz
DROP TABLE IF EXISTS "ai_quiz_options";
DROP TABLE IF EXISTS "ai_quiz_questions";
DROP TABLE IF EXISTS "ai_quizzes";
