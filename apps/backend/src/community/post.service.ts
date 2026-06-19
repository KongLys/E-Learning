import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePostDto } from './dto/create-post.dto';

const POST_EDIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

@Injectable()
export class PostService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

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
      throw new ForbiddenException('Must be enrolled to participate');
  }

  async createPost(
    courseId: string,
    authorId: string,
    userRole: string,
    dto: CreatePostDto,
  ) {
    await this.assertEnrolledOrInstructor(courseId, authorId, userRole);
    if (
      dto.type === 'announcement' &&
      userRole !== 'instructor' &&
      userRole !== 'admin'
    ) {
      throw new ForbiddenException('Only instructors can create announcements');
    }
    const post = await this.prisma.communityPost.create({
      data: {
        courseId,
        authorId,
        title: dto.title,
        body: dto.body,
        type: dto.type,
        media: dto.media
          ? (dto.media as unknown as Prisma.InputJsonValue)
          : undefined,
      },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });

    // Thông báo tới toàn bộ học viên ghi danh khi giảng viên đăng thông báo.
    if (post.type === 'announcement') {
      this.events.emit('community.announcement.created', {
        postId: post.id,
        courseId,
        authorId,
      });
    }

    return post;
  }

  async listPosts(
    courseId: string,
    query: { type?: string; sort?: string; page?: number },
  ) {
    const page = query.page ?? 1;
    const limit = 20;
    const where: any = { courseId, status: 'active' };
    // Chỉ nhận giá trị enum hợp lệ (defense-in-depth, không phụ thuộc Prisma reject).
    const ALLOWED_TYPES = ['question', 'discussion', 'announcement'];
    if (query.type && ALLOWED_TYPES.includes(query.type)) {
      where.type = query.type;
    }

    const orderBy: any[] = [{ isPinned: 'desc' }];
    if (query.sort === 'upvotes') orderBy.push({ upvotes: 'desc' });
    else orderBy.push({ createdAt: 'desc' });

    const [posts, total] = await Promise.all([
      this.prisma.communityPost.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          author: { select: { id: true, fullName: true, avatarUrl: true } },
          _count: { select: { comments: true } },
        },
      }),
      this.prisma.communityPost.count({ where }),
    ]);
    return { posts, total, page, limit };
  }

  async getPost(postId: string) {
    const post = await this.prisma.communityPost.findUnique({
      where: { id: postId },
      include: {
        author: { select: { id: true, fullName: true, avatarUrl: true } },
        course: { select: { slug: true, instructorId: true } },
        comments: {
          where: { status: 'active', parentId: null },
          orderBy: [
            { isSolution: 'desc' },
            { upvotes: 'desc' },
            { createdAt: 'asc' },
          ],
          include: {
            author: { select: { id: true, fullName: true, avatarUrl: true } },
            replies: {
              where: { status: 'active' },
              orderBy: { createdAt: 'asc' },
              include: {
                author: {
                  select: { id: true, fullName: true, avatarUrl: true },
                },
              },
            },
          },
        },
      },
    });
    if (!post || post.status === 'deleted')
      throw new NotFoundException('Post not found');
    return post;
  }

  async updatePost(
    postId: string,
    userId: string,
    userRole: string,
    body: string,
  ) {
    const post = await this.prisma.communityPost.findUnique({
      where: { id: postId },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.authorId !== userId && userRole !== 'admin')
      throw new ForbiddenException();

    if (post.authorId === userId) {
      const age = Date.now() - post.createdAt.getTime();
      const hasComments = await this.prisma.postComment.count({
        where: { postId },
      });
      if (age > POST_EDIT_WINDOW_MS && hasComments > 0) {
        throw new UnprocessableEntityException('Edit window expired');
      }
    }
    return this.prisma.communityPost.update({
      where: { id: postId },
      data: { body },
    });
  }

  async deletePost(postId: string, userId: string, userRole: string) {
    const post = await this.prisma.communityPost.findUnique({
      where: { id: postId },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (
      post.authorId !== userId &&
      userRole !== 'instructor' &&
      userRole !== 'admin'
    ) {
      throw new ForbiddenException();
    }
    await this.prisma.communityPost.update({
      where: { id: postId },
      data: { status: 'deleted' },
    });
    return { message: 'Post deleted' };
  }

  async pinPost(postId: string, userId: string, userRole: string) {
    const post = await this.prisma.communityPost.findUnique({
      where: { id: postId },
      include: { course: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.course.instructorId !== userId && userRole !== 'admin')
      throw new ForbiddenException();
    return this.prisma.communityPost.update({
      where: { id: postId },
      data: { isPinned: !post.isPinned },
    });
  }

  async hidePost(postId: string, userId: string, userRole: string) {
    const post = await this.prisma.communityPost.findUnique({
      where: { id: postId },
      include: { course: true },
    });
    if (!post) throw new NotFoundException('Post not found');
    if (post.course.instructorId !== userId && userRole !== 'admin')
      throw new ForbiddenException();
    const newStatus = post.status === 'hidden' ? 'active' : 'hidden';
    return this.prisma.communityPost.update({
      where: { id: postId },
      data: { status: newStatus },
    });
  }

  async votePost(postId: string, userId: string) {
    const post = await this.prisma.communityPost.findUnique({
      where: { id: postId },
    });
    if (!post) throw new NotFoundException('Post not found');

    const existing = await this.prisma.postVote.findUnique({
      where: { postId_userId: { postId, userId } },
    });
    if (existing) {
      await this.prisma.postVote.delete({ where: { id: existing.id } });
      await this.prisma.communityPost.update({
        where: { id: postId },
        data: { upvotes: { decrement: 1 } },
      });
      return { voted: false };
    }
    await this.prisma.postVote.create({ data: { postId, userId } });
    await this.prisma.communityPost.update({
      where: { id: postId },
      data: { upvotes: { increment: 1 } },
    });
    return { voted: true };
  }
}
