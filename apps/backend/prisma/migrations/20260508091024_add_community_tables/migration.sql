-- CreateEnum
CREATE TYPE "CommunityPostType" AS ENUM ('question', 'discussion', 'announcement');

-- CreateEnum
CREATE TYPE "CommunityPostStatus" AS ENUM ('active', 'hidden', 'deleted');

-- CreateTable
CREATE TABLE "community_posts" (
    "id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "type" "CommunityPostType" NOT NULL DEFAULT 'question',
    "status" "CommunityPostStatus" NOT NULL DEFAULT 'active',
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "is_pinned" BOOLEAN NOT NULL DEFAULT false,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "community_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_comments" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "body" TEXT NOT NULL,
    "status" "CommunityPostStatus" NOT NULL DEFAULT 'active',
    "is_solution" BOOLEAN NOT NULL DEFAULT false,
    "upvotes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "post_votes" (
    "id" TEXT NOT NULL,
    "post_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "post_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "community_posts_course_id_idx" ON "community_posts"("course_id");

-- CreateIndex
CREATE INDEX "community_posts_author_id_idx" ON "community_posts"("author_id");

-- CreateIndex
CREATE INDEX "post_comments_post_id_idx" ON "post_comments"("post_id");

-- CreateIndex
CREATE UNIQUE INDEX "post_votes_post_id_user_id_key" ON "post_votes"("post_id", "user_id");

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_course_id_fkey" FOREIGN KEY ("course_id") REFERENCES "courses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "community_posts" ADD CONSTRAINT "community_posts_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_comments" ADD CONSTRAINT "post_comments_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "post_comments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_votes" ADD CONSTRAINT "post_votes_post_id_fkey" FOREIGN KEY ("post_id") REFERENCES "community_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "post_votes" ADD CONSTRAINT "post_votes_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
