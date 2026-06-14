-- CreateTable
CREATE TABLE "review_quizzes" (
    "id" TEXT NOT NULL,
    "lesson_id" TEXT NOT NULL,
    "model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "review_quizzes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_quiz_questions" (
    "id" TEXT NOT NULL,
    "review_quiz_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "question_type" "QuizOptionType" NOT NULL DEFAULT 'single',
    "order_index" INTEGER NOT NULL,
    "explanation" TEXT,

    CONSTRAINT "review_quiz_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "review_quiz_options" (
    "id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "is_correct" BOOLEAN NOT NULL DEFAULT false,
    "order_index" INTEGER NOT NULL,

    CONSTRAINT "review_quiz_options_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "review_quizzes_lesson_id_key" ON "review_quizzes"("lesson_id");

-- CreateIndex
CREATE INDEX "review_quiz_questions_review_quiz_id_idx" ON "review_quiz_questions"("review_quiz_id");

-- CreateIndex
CREATE INDEX "review_quiz_options_question_id_idx" ON "review_quiz_options"("question_id");

-- AddForeignKey
ALTER TABLE "review_quizzes" ADD CONSTRAINT "review_quizzes_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_quiz_questions" ADD CONSTRAINT "review_quiz_questions_review_quiz_id_fkey" FOREIGN KEY ("review_quiz_id") REFERENCES "review_quizzes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "review_quiz_options" ADD CONSTRAINT "review_quiz_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "review_quiz_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
