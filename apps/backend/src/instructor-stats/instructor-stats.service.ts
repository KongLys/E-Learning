import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';

const CACHE_TTL = 300; // 5 minutes

@Injectable()
export class InstructorStatsService {
  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  async getOverview(instructorId: string) {
    const cacheKey = `instructor:stats:overview:${instructorId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const courses = await this.prisma.course.findMany({
      where: { instructorId },
      select: { id: true },
    });
    const courseIds = courses.map((c) => c.id);

    const [
      totalCourses,
      totalStudents,
      ratingAgg,
      pendingQuestions,
      revenueAgg,
    ] = await Promise.all([
      this.prisma.course.count({ where: { instructorId } }),
      this.prisma.enrollment.count({
        where: { courseId: { in: courseIds }, status: 'active' },
      }),
      this.prisma.review.aggregate({
        _avg: { rating: true },
        where: { courseId: { in: courseIds } },
      }),
      this.prisma.quickQuestion.count({
        where: {
          lesson: { section: { course: { instructorId } } },
          status: 'pending',
        },
      }),
      courseIds.length > 0
        ? this.prisma.orderItem.aggregate({
            _sum: { price: true },
            where: {
              courseId: { in: courseIds },
              order: { status: 'paid' },
            },
          })
        : Promise.resolve({ _sum: { price: null } }),
    ]);

    const result = {
      totalCourses,
      totalStudents,
      avgRating: ratingAgg._avg.rating
        ? Number(ratingAgg._avg.rating.toFixed(1))
        : 0,
      totalRevenue: Number(revenueAgg._sum.price ?? 0),
      pendingQuestions,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }

  async getRevenue(instructorId: string, period: '30d' | '90d' | '1y' = '30d') {
    const cacheKey = `instructor:stats:revenue:${instructorId}:${period}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const courses = await this.prisma.course.findMany({
      where: { instructorId },
      select: { id: true },
    });
    const courseIds = courses.map((c) => c.id);

    const days = period === '1y' ? 365 : period === '90d' ? 90 : 30;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    let data: { date: string; amount: number }[] = [];

    if (courseIds.length > 0) {
      const rows = await this.prisma.$queryRaw<
        { date: Date; amount: string }[]
      >`
        SELECT DATE(o."paid_at") as date, SUM(oi.price) as amount
        FROM "order_items" oi
        JOIN "orders" o ON o.id = oi."order_id"
        WHERE oi."course_id"::text = ANY(${courseIds})
          AND o.status = 'paid'
          AND o."paid_at" >= ${startDate}
        GROUP BY DATE(o."paid_at")
        ORDER BY date ASC
      `;

      data = rows.map((r) => ({
        date:
          r.date instanceof Date
            ? r.date.toISOString().split('T')[0]
            : String(r.date),
        amount: Number(r.amount ?? 0),
      }));
    }

    const result = { period, data };
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }

  async getCourseStats(instructorId: string, courseId: string) {
    const cacheKey = `instructor:stats:course:${courseId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const course = await this.prisma.course.findFirst({
      where: { id: courseId, instructorId },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId !== instructorId)
      throw new ForbiddenException('Access denied');

    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const [
      enrolledCount,
      completedCount,
      ratingAgg,
      ratingGroups,
      totalRevAgg,
      monthRevAgg,
      lessons,
    ] = await Promise.all([
      this.prisma.enrollment.count({ where: { courseId, status: 'active' } }),
      this.prisma.enrollment.count({
        where: { courseId, status: 'completed' },
      }),
      this.prisma.review.aggregate({
        _avg: { rating: true },
        where: { courseId },
      }),
      this.prisma.review.groupBy({
        by: ['rating'],
        where: { courseId },
        _count: { rating: true },
      }),
      this.prisma.orderItem.aggregate({
        _sum: { price: true },
        where: { courseId, order: { status: 'paid' } },
      }),
      this.prisma.orderItem.aggregate({
        _sum: { price: true },
        where: {
          courseId,
          order: { status: 'paid', paidAt: { gte: startOfMonth } },
        },
      }),
      this.prisma.lesson.findMany({
        where: { section: { courseId } },
        select: { id: true, title: true },
        orderBy: { orderIndex: 'asc' },
      }),
    ]);

    const totalEnrolled = enrolledCount + completedCount;

    const ratingDistribution: Record<number, number> = {
      1: 0,
      2: 0,
      3: 0,
      4: 0,
      5: 0,
    };
    for (const g of ratingGroups) {
      ratingDistribution[g.rating] = g._count.rating;
    }

    const lessonDropoff = await Promise.all(
      lessons.map(async (lesson) => {
        const completedCount = await this.prisma.lessonProgress.count({
          where: {
            lessonId: lesson.id,
            completed: true,
            enrollment: { courseId },
          },
        });
        const dropoffRate =
          totalEnrolled > 0
            ? Number(((1 - completedCount / totalEnrolled) * 100).toFixed(1))
            : 0;
        return {
          lessonId: lesson.id,
          title: lesson.title,
          completedCount,
          totalEnrolled,
          dropoffRate,
        };
      }),
    );

    const result = {
      enrolledCount: totalEnrolled,
      completionRate:
        totalEnrolled > 0
          ? Number(((completedCount / totalEnrolled) * 100).toFixed(1))
          : 0,
      avgRating: ratingAgg._avg.rating
        ? Number(ratingAgg._avg.rating.toFixed(1))
        : 0,
      ratingDistribution,
      revenue: {
        total: Number(totalRevAgg._sum.price ?? 0),
        thisMonth: Number(monthRevAgg._sum.price ?? 0),
      },
      lessonDropoff,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }

  async getEngagement(instructorId: string) {
    const cacheKey = `instructor:stats:engagement:${instructorId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const courses = await this.prisma.course.findMany({
      where: { instructorId },
      select: { id: true },
    });
    const courseIds = courses.map((c) => c.id);

    if (courseIds.length === 0) {
      return {
        totalWatchTimeSec: 0,
        avgCompletionRate: 0,
        totalLessonsCompleted: 0,
        totalQuizAttempts: 0,
        totalQaQuestions: 0,
        avgRating: 0,
        totalReviews: 0,
      };
    }

    const [
      watchTimeAgg,
      completionAgg,
      lessonsCompleted,
      quizAttempts,
      qaQuestions,
      ratingAgg,
      totalReviews,
    ] = await Promise.all([
      this.prisma.lessonProgress.aggregate({
        _sum: { watchTimeSec: true },
        where: { enrollment: { courseId: { in: courseIds } } },
      }),
      this.prisma.enrollment.aggregate({
        _avg: { progressPercent: true },
        where: { courseId: { in: courseIds } },
      }),
      this.prisma.lessonProgress.count({
        where: { enrollment: { courseId: { in: courseIds } }, completed: true },
      }),
      this.prisma.quizAttempt.count({
        where: {
          quizLesson: { lesson: { section: { courseId: { in: courseIds } } } },
        },
      }),
      this.prisma.quickQuestion.count({
        where: { lesson: { section: { courseId: { in: courseIds } } } },
      }),
      this.prisma.review.aggregate({
        _avg: { rating: true },
        where: { courseId: { in: courseIds } },
      }),
      this.prisma.review.count({ where: { courseId: { in: courseIds } } }),
    ]);

    const result = {
      totalWatchTimeSec: Number(watchTimeAgg._sum.watchTimeSec ?? 0),
      avgCompletionRate: Number(
        (completionAgg._avg.progressPercent ?? 0).toFixed(1),
      ),
      totalLessonsCompleted: lessonsCompleted,
      totalQuizAttempts: quizAttempts,
      totalQaQuestions: qaQuestions,
      avgRating: ratingAgg._avg.rating
        ? Number(ratingAgg._avg.rating.toFixed(1))
        : 0,
      totalReviews,
    };

    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }

  async getQuizInsights(instructorId: string) {
    const cacheKey = `instructor:stats:quiz-insights:${instructorId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const quizLessons = await this.prisma.quizLesson.findMany({
      where: { lesson: { section: { course: { instructorId } } } },
      include: {
        lesson: { select: { title: true } },
        questions: {
          include: {
            options: { select: { id: true, isCorrect: true } },
            answers: { select: { optionId: true } },
          },
        },
        attempts: {
          select: {
            id: true,
            score: true,
            isPassed: true,
            startedAt: true,
            submittedAt: true,
            studentId: true,
          },
        },
      },
    });

    const insights = quizLessons.map((ql) => {
      const attempts = ql.attempts;
      const attemptCount = attempts.length;
      const uniqueStudents = new Set(attempts.map((a) => a.studentId)).size;
      const retakeCount = attemptCount - uniqueStudents;
      const completedAttempts = attempts.filter((a) => a.submittedAt);
      const avgScore =
        attemptCount > 0
          ? Number(
              (
                attempts.reduce((s, a) => s + a.score, 0) / attemptCount
              ).toFixed(1),
            )
          : 0;
      const passCount = attempts.filter((a) => a.isPassed).length;
      const passRate =
        attemptCount > 0
          ? Number(((passCount / attemptCount) * 100).toFixed(1))
          : 0;
      const avgDurationSec =
        completedAttempts.length > 0
          ? Math.round(
              completedAttempts.reduce((s, a) => {
                if (!a.submittedAt) return s;
                return (
                  s + (a.submittedAt.getTime() - a.startedAt.getTime()) / 1000
                );
              }, 0) / completedAttempts.length,
            )
          : 0;

      const hardQuestions = ql.questions
        .map((q) => {
          const total = q.answers.length;
          const correctOptionIds = q.options
            .filter((o) => o.isCorrect)
            .map((o) => o.id);
          const wrongCount = q.answers.filter(
            (a) => !correctOptionIds.includes(a.optionId),
          ).length;
          const wrongRate = total > 0 ? wrongCount / total : 0;
          return {
            questionId: q.id,
            content: q.content,
            wrongRate: Number(wrongRate.toFixed(2)),
            total,
          };
        })
        .filter((q) => q.wrongRate >= 0.5)
        .sort((a, b) => b.wrongRate - a.wrongRate);

      return {
        quizLessonId: ql.id,
        lessonTitle: ql.lesson.title,
        attemptCount,
        uniqueStudents,
        retakeCount,
        avgScore,
        passRate,
        avgDurationSec,
        hardQuestions,
      };
    });

    const result = { insights };
    await this.redis.set(cacheKey, JSON.stringify(result), 'EX', CACHE_TTL);
    return result;
  }
}
