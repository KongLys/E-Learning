import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProgressDto } from './dto/update-progress.dto';

@Injectable()
export class ProgressService {
  constructor(
    private prisma: PrismaService,
    private events: EventEmitter2,
  ) {}

  async updateProgress(studentId: string, dto: UpdateProgressDto) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
      include: { section: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, courseId: lesson.section.courseId, status: 'active' },
    });
    if (!enrollment)
      throw new ForbiddenException('Not enrolled in this course');

    await this.prisma.lessonProgress.upsert({
      where: {
        enrollmentId_lessonId: {
          enrollmentId: enrollment.id,
          lessonId: dto.lessonId,
        },
      },
      update: {
        lastPositionSec: dto.lastPositionSec,
        watchTimeSec: { increment: dto.watchTimeSec },
      },
      create: {
        enrollmentId: enrollment.id,
        lessonId: dto.lessonId,
        lastPositionSec: dto.lastPositionSec,
        watchTimeSec: dto.watchTimeSec,
      },
    });

    await this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { lastLessonId: dto.lessonId },
    });

    return { updated: true };
  }

  async markComplete(studentId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { section: true, videoAsset: true, documentAsset: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, courseId: lesson.section.courseId, status: 'active' },
    });
    if (!enrollment)
      throw new ForbiddenException('Not enrolled in this course');

    const progress = await this.prisma.lessonProgress.findUnique({
      where: {
        enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId },
      },
    });
    const watchTimeSec = progress?.watchTimeSec ?? 0;
    const lastPositionSec = progress?.lastPositionSec ?? 0;

    // Enforce điều kiện hoàn thành theo loại bài học
    if (lesson.type === 'document') {
      const minRead = lesson.documentAsset?.minReadTimeSec ?? 0;
      if (watchTimeSec < minRead) {
        throw new UnprocessableEntityException(
          `Bạn cần ở trong bài học tối thiểu ${minRead} giây trước khi hoàn thành`,
        );
      }
    } else if (lesson.type === 'video') {
      const duration =
        lesson.videoAsset?.durationSec ?? lesson.durationSec ?? 0;
      const mode = lesson.videoAsset?.completionMode ?? 'percent_90';
      if (duration > 0) {
        if (mode === 'ended_autonext') {
          if (lastPositionSec < duration - 2) {
            throw new UnprocessableEntityException(
              'Bạn cần xem hết video để hoàn thành',
            );
          }
        } else if (watchTimeSec < duration * 0.9) {
          throw new UnprocessableEntityException(
            'Bạn cần xem tối thiểu 90% thời lượng video',
          );
        }
      }
    } else if (lesson.type === 'quiz') {
      // Bài kiểm tra chỉ hoàn thành khi học viên đã có lần làm ĐẠT.
      const passed = await this.prisma.quizAttempt.count({
        where: { studentId, isPassed: true, quizLesson: { lessonId } },
      });
      if (passed === 0) {
        throw new UnprocessableEntityException(
          'Bạn cần vượt qua bài kiểm tra trước khi hoàn thành',
        );
      }
    }

    await this.prisma.lessonProgress.upsert({
      where: {
        enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId },
      },
      update: { completed: true, completedAt: new Date() },
      create: {
        enrollmentId: enrollment.id,
        lessonId,
        completed: true,
        completedAt: new Date(),
      },
    });

    const updated = await this.recalculateProgress(
      enrollment.id,
      lesson.section.courseId,
    );
    return { progressPercent: updated.progressPercent, lessonCompleted: true };
  }

  async recalculateProgress(enrollmentId: string, courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { finalQuizEnabled: true },
    });

    // Bài học nội dung (loại trừ bài kiểm tra cuối khóa).
    const totalContent = await this.prisma.lesson.count({
      where: { section: { courseId }, isFinalQuiz: false },
    });
    const completedContent = await this.prisma.lessonProgress.count({
      where: { enrollmentId, completed: true, lesson: { isFinalQuiz: false } },
    });

    // Bài kiểm tra cuối khóa (nếu có & đang bật) chiếm 10%, nội dung 90%.
    const finalQuizLesson = await this.prisma.lesson.findFirst({
      where: { section: { courseId }, isFinalQuiz: true },
      select: { id: true },
    });
    const hasFinalQuiz = !!finalQuizLesson && course?.finalQuizEnabled !== false;

    let progressPercent: number;
    if (hasFinalQuiz) {
      const contentRatio = totalContent > 0 ? completedContent / totalContent : 1;
      const finalQuizPassed = await this.prisma.lessonProgress.count({
        where: { enrollmentId, lessonId: finalQuizLesson!.id, completed: true },
      });
      progressPercent = contentRatio * 90 + (finalQuizPassed > 0 ? 10 : 0);
    } else {
      progressPercent =
        totalContent > 0 ? (completedContent / totalContent) * 100 : 0;
    }
    const status = progressPercent >= 100 ? 'completed' : 'active';

    const previous = await this.prisma.enrollment.findUnique({
      where: { id: enrollmentId },
      select: { status: true, studentId: true },
    });

    const updated = await this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { progressPercent, status },
    });

    // Fire once, only on the active → completed transition.
    if (status === 'completed' && previous?.status !== 'completed') {
      this.events.emit('course.completed', {
        studentId: updated.studentId,
        courseId,
      });
    }

    return updated;
  }
}
