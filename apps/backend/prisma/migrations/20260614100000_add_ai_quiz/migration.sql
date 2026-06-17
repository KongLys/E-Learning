-- CreateTable
CREATE TABLE "ai_quizzes" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "title" TEXT,
    "model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_quiz_questions" (
    "id" TEXT NOT NULL,
    "quiz_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "question_type" "QuizOptionType" NOT NULL DEFAULT 'single',
    "order_index" INTEGER NOT NULL,
    "explanation" TEXT,

    CONSTRAINT "ai_quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_quiz_options" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "ai_quiz_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_quizzes_user_id_course_id_idx" ON "ai_quizzes"("user_id", "course_id");

-- CreateIndex
CREATE INDEX "ai_quiz_questions_quiz_id_idx" ON "ai_quiz_questions"("quiz_id");

-- CreateIndex
CREATE INDEX "ai_quiz_options_question_id_idx" ON "ai_quiz_options"("question_id");

-- AddForeignKey
ALTER TABLE "ai_quizzes" ADD CONSTRAINT "ai_quizzes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_quizzes" ADD CONSTRAINT "ai_quizzes_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_quiz_questions" ADD CONSTRAINT "ai_quiz_questions_quiz_id_fkey" FOREIGN KEY ("quiz_id") REFERENCES "ai_quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_quiz_options" ADD CONSTRAINT "ai_quiz_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "ai_quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
