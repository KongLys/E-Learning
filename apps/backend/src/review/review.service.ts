import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReportReviewDto } from './dto/report-review.dto';

@Injectable()
export class ReviewService {
  constructor(private prisma: PrismaService) {}

  /** Học viên phải đã ghi danh VÀ đã hoàn thành ít nhất 1 bài học. */
  private async assertCanReview(courseId: string, studentId: string) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (!enrollment) {
      throw new ForbiddenException(
        'Bạn cần ghi danh khóa học trước khi đánh giá',
      );
    }
    const completed = await this.prisma.lessonProgress.count({
      where: { enrollmentId: enrollment.id, completed: true },
    });
    if (completed === 0) {
      throw new ForbiddenException(
        'Bạn cần học một phần khóa học trước khi đánh giá',
      );
    }
  }

  /** Tính lại avgRating của khóa học từ các review chưa bị ẩn. */
  private async recomputeRating(courseId: string) {
    const agg = await this.prisma.review.aggregate({
      where: { courseId, isHidden: false },
      _avg: { rating: true },
    });
    await this.prisma.course.update({
      where: { id: courseId },
      data: { avgRating: agg._avg.rating ?? 0 },
    });
  }

  async upsertReview(
    courseId: string,
    studentId: string,
    dto: CreateReviewDto,
  ) {
    await this.assertCanReview(courseId, studentId);
    const review = await this.prisma.review.upsert({
      where: { studentId_courseId: { studentId, courseId } },
      create: {
        courseId,
        studentId,
        rating: dto.rating,
        content: dto.content ?? null,
        isHidden: false,
      },
      update: {
        rating: dto.rating,
        content: dto.content ?? null,
        isHidden: false,
      },
      include: {
        student: { select: { id: true, fullName: true, avatarUrl: true } },
      },
    });
    await this.recomputeRating(courseId);
    return review;
  }

  async getMyReview(courseId: string, studentId: string) {
    return this.prisma.review.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
  }

  async deleteMyReview(courseId: string, studentId: string) {
    const review = await this.prisma.review.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (!review) throw new NotFoundException('Review not found');
    await this.prisma.review.delete({ where: { id: review.id } });
    await this.recomputeRating(courseId);
    return { message: 'Review deleted' };
  }

  async listCourseReviews(
    courseId: string,
    query: { page?: number; limit?: number },
  ) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 10;
    const where = { courseId, isHidden: false };

    const [reviews, total, grouped] = await Promise.all([
      this.prisma.review.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          student: { select: { id: true, fullName: true, avatarUrl: true } },
        },
      }),
      this.prisma.review.count({ where }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where,
        _count: { _all: true },
      }),
    ]);

    const distribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    let ratingSum = 0;
    for (const g of grouped) {
      distribution[g.rating] = g._count._all;
      ratingSum += g.rating * g._count._all;
    }
    const avg = total > 0 ? ratingSum / total : 0;

    return {
      reviews,
      total,
      page,
      limit,
      summary: { avg, total, distribution },
    };
  }

  async reportReview(
    reviewId: string,
    reporterId: string,
    dto: ReportReviewDto,
  ) {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
    });
    if (!review || review.isHidden)
      throw new NotFoundException('Review not found');

    const existing = await this.prisma.reviewReport.findFirst({
      where: { reviewId, reporterId, status: 'pending' },
    });
    if (existing) {
      throw new BadRequestException(
        'Bạn đã báo cáo đánh giá này và đang chờ xử lý',
      );
    }

    return this.prisma.reviewReport.create({
      data: {
        reviewId,
        reporterId,
        reason: dto.reason,
        detail: dto.detail ?? null,
      },
    });
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async listReports(query: { status?: string }) {
    const status = (query.status ?? 'pending') as
      | 'pending'
      | 'resolved'
      | 'dismissed';
    return this.prisma.reviewReport.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      include: {
        reporter: { select: { id: true, fullName: true, email: true } },
        review: {
          include: {
            student: {
              select: { id: true, fullName: true, email: true, status: true },
            },
            course: { select: { id: true, title: true, slug: true } },
          },
        },
      },
    });
  }

  async resolveReport(reportId: string, action: 'delete' | 'dismiss') {
    const report = await this.prisma.reviewReport.findUnique({
      where: { id: reportId },
    });
    if (!report) throw new NotFoundException('Report not found');

    if (action === 'delete') {
      const review = await this.prisma.review.update({
        where: { id: report.reviewId },
        data: { isHidden: true },
      });
      await this.recomputeRating(review.courseId);
    }

    return this.prisma.reviewReport.update({
      where: { id: reportId },
      data: {
        status: action === 'delete' ? 'resolved' : 'dismissed',
        resolvedAt: new Date(),
      },
    });
  }
}
