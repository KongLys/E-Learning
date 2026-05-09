import {
  ForbiddenException,
  Injectable,
  BadRequestException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';

@Injectable()
export class LessonService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async createLesson(sectionId: string, userId: string, userRole: string, dto: CreateLessonDto) {
    await this.assertSectionOwner(sectionId, userId, userRole);
    const maxIdx = await this.prisma.lesson.aggregate({
      where: { sectionId },
      _max: { orderIndex: true },
    });
    const lesson = await this.prisma.lesson.create({
      data: {
        sectionId,
        title: dto.title,
        description: dto.description,
        type: dto.type,
        orderIndex: (maxIdx._max.orderIndex ?? 0) + 1,
        isPreview: dto.isPreview ?? false,
      },
    });
    if (dto.type === 'video') await this.prisma.videoAsset.create({ data: { lessonId: lesson.id } });
    if (dto.type === 'document') await this.prisma.documentAsset.create({ data: { lessonId: lesson.id } });
    if (dto.type === 'quiz') await this.prisma.quizLesson.create({ data: { lessonId: lesson.id } });

    await this.updateCourseStats(sectionId);
    return lesson;
  }

  async updateLesson(lessonId: string, userId: string, userRole: string, dto: UpdateLessonDto) {
    const lesson = await this.findLessonOrFail(lessonId);
    await this.assertCourseOwnerBySection(lesson.sectionId, userId, userRole);
    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: { title: dto.title, description: dto.description, isPreview: dto.isPreview },
    });
  }

  async deleteLesson(lessonId: string, userId: string, userRole: string) {
    const lesson = await this.findLessonOrFail(lessonId);
    await this.assertCourseOwnerBySection(lesson.sectionId, userId, userRole);

    const section = await this.prisma.section.findUnique({ where: { id: lesson.sectionId }, include: { course: true } });
    if (section?.course.status === 'published') {
      throw new UnprocessableEntityException('Cannot delete lesson from a published course');
    }

    if (lesson.type === 'video') {
      const asset = await this.prisma.videoAsset.findUnique({ where: { lessonId } });
      if (asset?.videoUrl) await this.storage.deleteFile(this.storage.extractKeyFromUrl(asset.videoUrl));
    } else if (lesson.type === 'document') {
      const asset = await this.prisma.documentAsset.findUnique({ where: { lessonId } });
      if (asset?.fileUrl) await this.storage.deleteFile(this.storage.extractKeyFromUrl(asset.fileUrl));
    }

    await this.prisma.lesson.delete({ where: { id: lessonId } });
    await this.updateCourseStats(lesson.sectionId);
    return { message: 'Lesson deleted' };
  }

  async reorderLessons(sectionId: string, userId: string, userRole: string, lessonIds: string[]) {
    await this.assertSectionOwner(sectionId, userId, userRole);
    await Promise.all(
      lessonIds.map((id, index) =>
        this.prisma.lesson.update({ where: { id }, data: { orderIndex: index + 1 } }),
      ),
    );
    return this.prisma.lesson.findMany({ where: { sectionId }, orderBy: { orderIndex: 'asc' } });
  }

  async getLesson(lessonId: string, userId?: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { videoAsset: true, documentAsset: true, quizLesson: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    if (!lesson.isPreview && userId) {
      const section = await this.prisma.section.findUnique({ where: { id: lesson.sectionId } });
      const enrolled = await this.prisma.enrollment.findFirst({
        where: { studentId: userId, courseId: section!.courseId, status: 'active' },
      });
      if (!enrolled) throw new ForbiddenException('You are not enrolled in this course');
    } else if (!lesson.isPreview && !userId) {
      throw new ForbiddenException('Authentication required');
    }

    return lesson;
  }

  async updateCourseStats(sectionId: string) {
    const section = await this.prisma.section.findUnique({ where: { id: sectionId } });
    if (!section) return;

    const stats = await this.prisma.lesson.aggregate({
      where: { section: { courseId: section.courseId } },
      _count: { id: true },
      _sum: { durationSec: true },
    });

    await this.prisma.course.update({
      where: { id: section.courseId },
      data: {
        totalLessons: stats._count.id,
        totalDurationSec: stats._sum.durationSec ?? 0,
      },
    });
  }

  private async findLessonOrFail(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({ where: { id: lessonId } });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson;
  }

  private async assertSectionOwner(sectionId: string, userId: string, userRole: string) {
    const section = await this.prisma.section.findUnique({ where: { id: sectionId }, include: { course: true } });
    if (!section) throw new NotFoundException('Section not found');
    if (userRole !== 'admin' && section.course.instructorId !== userId) throw new ForbiddenException('Access denied');
    return section;
  }

  private async assertCourseOwnerBySection(sectionId: string, userId: string, userRole: string) {
    return this.assertSectionOwner(sectionId, userId, userRole);
  }

  async isEnrolled(userId: string, courseId: string): Promise<boolean> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId: userId, courseId, status: 'active' },
    });
    return !!enrollment;
  }
}
