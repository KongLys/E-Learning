import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProgressDto } from './dto/update-progress.dto';

@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}

  async updateProgress(studentId: string, dto: UpdateProgressDto) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
      include: { section: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, courseId: lesson.section.courseId, status: 'active' },
    });
    if (!enrollment) throw new ForbiddenException('Not enrolled in this course');

    await this.prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId: dto.lessonId } },
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
      include: { section: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId, courseId: lesson.section.courseId, status: 'active' },
    });
    if (!enrollment) throw new ForbiddenException('Not enrolled in this course');

    await this.prisma.lessonProgress.upsert({
      where: { enrollmentId_lessonId: { enrollmentId: enrollment.id, lessonId } },
      update: { completed: true, completedAt: new Date() },
      create: { enrollmentId: enrollment.id, lessonId, completed: true, completedAt: new Date() },
    });

    const updated = await this.recalculateProgress(enrollment.id, lesson.section.courseId);
    return { progressPercent: updated.progressPercent, lessonCompleted: true };
  }

  async recalculateProgress(enrollmentId: string, courseId: string) {
    const totalLessons = await this.prisma.lesson.count({
      where: { section: { courseId } },
    });

    const completedCount = await this.prisma.lessonProgress.count({
      where: { enrollmentId, completed: true },
    });

    const progressPercent = totalLessons > 0 ? (completedCount / totalLessons) * 100 : 0;
    const status = progressPercent >= 100 ? 'completed' : 'active';

    return this.prisma.enrollment.update({
      where: { id: enrollmentId },
      data: { progressPercent, status },
    });
  }
}
