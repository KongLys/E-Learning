import {
  ConflictException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { COURSE_ACCESS_STATUSES } from '../common/enrollment-access.const';

@Injectable()
export class EnrollmentService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async enroll(studentId: string, studentRole: string, courseId: string) {
    if (studentRole === 'admin') {
      throw new ForbiddenException('Admin không thể đăng ký khóa học');
    }

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId === studentId) {
      throw new ForbiddenException(
        'Bạn không thể đăng ký khóa học của chính mình',
      );
    }
    if (course.status !== 'published')
      throw new NotFoundException('Course not available');

    const existing = await this.prisma.enrollment.findFirst({
      where: { studentId, courseId },
    });
    if (existing)
      throw new ConflictException('Already enrolled in this course');

    if (Number(course.price) > 0) {
      throw new HttpException(
        'Payment required to enroll in this course',
        HttpStatus.PAYMENT_REQUIRED,
      );
    }

    const enrollment = await this.prisma.enrollment.create({
      data: { studentId, courseId, status: 'active' },
    });

    this.events.emit('enrollment.created', { studentId, courseId });

    return {
      enrollmentId: enrollment.id,
      courseId: enrollment.courseId,
      status: enrollment.status,
    };
  }

  async enrollAfterPayment(studentId: string, courseId: string) {
    // Defensive: never self-enroll an owner even if a malformed/replayed
    // order.paid event reaches the listener.
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course || course.instructorId === studentId) return;
    const existing = await this.prisma.enrollment.findFirst({
      where: { studentId, courseId },
    });
    if (existing) return;
    await this.prisma.enrollment.create({
      data: { studentId, courseId, status: 'active' },
    });
    this.events.emit('enrollment.created', { studentId, courseId });
  }

  async getMyEnrollments(studentId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { studentId },
      include: {
        course: {
          select: {
            id: true,
            title: true,
            slug: true,
            price: true,
            thumbnailUrl: true,
            totalLessons: true,
            totalDurationSec: true,
            categoryId: true,
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
      include: {
        lessonProgress: true,
        course: { select: { price: true } },
      },
    });
    if (!enrollment) throw new NotFoundException('Enrollment not found');

    return {
      progressPercent: enrollment.progressPercent,
      lastLessonId: enrollment.lastLessonId,
      status: enrollment.status,
      // Chỉ khóa trả phí mới có chứng chỉ → frontend dùng cờ này để hiện
      // popup chúc mừng & nút "Chứng chỉ".
      certificateEligible: Number(enrollment.course.price) > 0,
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
      where: { studentId, courseId, status: { in: COURSE_ACCESS_STATUSES } },
    });
    return !!enrollment;
  }
}
