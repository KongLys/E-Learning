import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EnrollmentService {
  constructor(private prisma: PrismaService) {}

  async enroll(studentId: string, studentRole: string, courseId: string) {
    if (studentRole === 'instructor' || studentRole === 'admin') {
      throw new ForbiddenException('Instructors and admins cannot enroll in courses');
    }

    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.status !== 'published') throw new NotFoundException('Course not available');

    const existing = await this.prisma.enrollment.findFirst({
      where: { studentId, courseId },
    });
    if (existing) throw new ConflictException('Already enrolled in this course');

    if (Number(course.price) > 0) {
      throw new HttpException('Payment required to enroll in this course', HttpStatus.PAYMENT_REQUIRED);
    }

    const enrollment = await this.prisma.enrollment.create({
      data: { studentId, courseId, status: 'active' },
    });

    return { enrollmentId: enrollment.id, courseId: enrollment.courseId, status: enrollment.status };
  }

  async enrollAfterPayment(studentId: string, courseId: string) {
    const existing = await this.prisma.enrollment.findFirst({ where: { studentId, courseId } });
    if (existing) return;
    await this.prisma.enrollment.create({ data: { studentId, courseId, status: 'active' } });
  }

  async getMyEnrollments(studentId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId },
      include: {
        course: {
          select: {
            id: true, title: true, slug: true, thumbnailUrl: true,
            totalLessons: true, totalDurationSec: true,
            instructor: { select: { id: true, fullName: true } },
          },
        },
      },
      orderBy: { enrolledAt: 'desc' },
    });

    return enrollments.map((e) => ({
      enrollmentId: e.id,
      courseId: e.courseId,
      status: e.status,
      progressPercent: e.progressPercent,
      lastLessonId: e.lastLessonId,
      enrolledAt: e.enrolledAt,
      course: e.course,
    }));
  }

  async getEnrollmentProgress(studentId: string, courseId: string) {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, courseId },
      include: { lessonProgress: true },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    return {
      progressPercent: enrollment.progressPercent,
      lastLessonId: enrollment.lastLessonId,
      status: enrollment.status,
      lessonProgress: enrollment.lessonProgress.map((lp) => ({
        lessonId: lp.lessonId,
        completed: lp.completed,
        watchTimeSec: lp.watchTimeSec,
        lastPositionSec: lp.lastPositionSec,
      })),
    };
  }

  async checkEnrolled(studentId: string, courseId: string): Promise<boolean> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, courseId, status: 'active' },
    });
    return !!enrollment;
  }
}
