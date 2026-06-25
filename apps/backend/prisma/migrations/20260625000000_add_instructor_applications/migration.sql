-- CreateEnum
CREATE TYPE "InstructorApplicationStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "instructor_applications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "status" "InstructorApplicationStatus" NOT NULL DEFAULT 'pending',
    "expertise" TEXT NOT NULL,
    "experience" TEXT NOT NULL,
    "motivation" TEXT NOT NULL,
    "reject_reason" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instructor_applications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "instructor_applications_status_created_at_idx" ON "instructor_applications"("status", "created_at");

-- CreateIndex
CREATE INDEX "instructor_applications_user_id_idx" ON "instructor_applications"("user_id");

-- AddForeignKey
ALTER TABLE "instructor_applications" ADD CONSTRAINT "instructor_applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
