import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCommentDto } from './dto/create-comment.dto';

@Injectable()
export class CommentService {
  constructor(private prisma: PrismaService) {}

  private async assertEnrolledOrInstructor(
    courseId: string,
    userId: string,
    userRole: string,
  ) {
    if (userRole === 'admin') return;
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId === userId) return;
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { courseId, studentId: userId },
    });
    if (!enrollment)
      throw new ForbiddenException('Must be enrolled to comment');
  }

  async addComment(
    postId: string,
    authorId: string,
    userRole: string,
    dto: CreateCommentDto,
  ) {
    const post = await this.prisma.communityPost.findUnique({
      where: { id: postId },
    });
    if (!post || post.status === 'deleted')
      throw new NotFoundException('Post not found');
    await this.assertEnrolledOrInstructor(post.courseId, authorId, userRole);

    if (dto.parentId) {
      const parent = await this.prisma.postComment.findUnique({
        where: { id: dto.parentId },
      });
      if (!parent || parent.postId !== postId || parent.parentId !== null) {
        throw new ForbiddenException('Can only reply to top-level comments');
      }
    }
    return this.prisma.postComment.create({
      data: {
        postId,
        authorId,
        body: dto.body,
        parentId: dto.parentId ?? null,
      },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
  }

  async updateComment(commentId: string, userId: string, body: string) {
    const comment = await this.prisma.postComment.findUnique({
      where: { id: commentId },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.authorId !== userId) throw new ForbiddenException();
    return this.prisma.postComment.update({
      where: { id: commentId },
      data: { body },
    });
  }

  async deleteComment(commentId: string, userId: string, userRole: string) {
    const comment = await this.prisma.postComment.findUnique({
      where: { id: commentId },
      include: { post: { include: { course: true } } },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    const isOwner = comment.authorId === userId;
    const isInstructorOfCourse = comment.post.course.instructorId === userId;
    if (!isOwner && !isInstructorOfCourse && userRole !== 'admin')
      throw new ForbiddenException();
    await this.prisma.postComment.update({
      where: { id: commentId },
      data: { status: 'deleted' },
    });
    return { message: 'Comment deleted' };
  }

  async voteComment(commentId: string, userId: string) {
    const comment = await this.prisma.postComment.findUnique({
      where: { id: commentId },
    });
    if (!comment || comment.status !== 'active')
      throw new NotFoundException('Comment not found');

    const existing = await this.prisma.commentVote.findUnique({
      where: { commentId_userId: { commentId, userId } },
    });
    if (existing) {
      await this.prisma.commentVote.delete({ where: { id: existing.id } });
      await this.prisma.postComment.update({
        where: { id: commentId },
        data: { upvotes: { decrement: 1 } },
      });
      return { voted: false };
    }
    await this.prisma.commentVote.create({ data: { commentId, userId } });
    await this.prisma.postComment.update({
      where: { id: commentId },
      data: { upvotes: { increment: 1 } },
    });
    return { voted: true };
  }

  async markSolution(commentId: string, userId: string) {
    const comment = await this.prisma.postComment.findUnique({
      where: { id: commentId },
      include: { post: true },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.post.authorId !== userId)
      throw new ForbiddenException('Only post author can mark solution');
    if (comment.post.type !== 'question')
      throw new ForbiddenException('Only questions can have solutions');

    // Toggle: clear other solutions first, then set this one
    await this.prisma.postComment.updateMany({
      where: { postId: comment.postId, isSolution: true },
      data: { isSolution: false },
    });
    const newValue = !comment.isSolution;
    return this.prisma.postComment.update({
      where: { id: commentId },
      data: { isSolution: newValue },
    });
  }
}
