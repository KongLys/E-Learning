import {
  ForbiddenException,
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { OnEvent } from '@nestjs/event-emitter';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { VectorStoreService } from '../ai/vector/vector-store.service';
import {
  LESSON_INDEX_QUEUE,
  IndexLessonJob,
} from '../ai/processors/lesson-index.processor';

@Injectable()
export class LessonService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private vector: VectorStoreService,
    @InjectQueue(LESSON_INDEX_QUEUE)
    private lessonIndexQueue: Queue<IndexLessonJob>,
  ) {}

  /** Đẩy bài học vào hàng đợi vector hóa; lỗi hàng đợi không làm hỏng thao tác lưu. */
  async enqueueLessonIndex(lessonId: string) {
    try {
      await this.lessonIndexQueue.add(
        'index',
        { lessonId },
        { removeOnComplete: true, removeOnFail: 50 },
      );
    } catch (err) {
      // best-effort: chỉ log, không ném lỗi
      console.error(
        `[LessonIndex] enqueue failed for ${lessonId}:`,
        (err as Error).message,
      );
    }
  }

  /**
   * Nội dung bài đổi → đưa kết quả kiểm duyệt về 'pending' để bộ phân lớp đánh giá
   * lại ở lần index kế tiếp. Giữ nguyên 'locked' (admin đã chốt) và 'appealing'
   * (đang chờ admin xử lý kiến nghị).
   */
  async resetLessonModeration(lessonId: string) {
    await this.prisma.lesson.updateMany({
      where: {
        id: lessonId,
        moderationStatus: { in: ['approved', 'rejected'] },
      },
      data: {
        moderationStatus: 'pending',
        moderationLabel: null,
        moderationScore: null,
        moderationReason: null,
        appealReason: null,
        moderatedAt: null,
      },
    });
  }

  /** Admin duyệt lại nội dung bài → index lại vào vector store. */
  @OnEvent('moderation.lesson.reindex')
  async onModerationReindex(payload: { lessonId: string }) {
    await this.enqueueLessonIndex(payload.lessonId);
  }

  async createLesson(
    sectionId: string,
    userId: string,
    userRole: string,
    dto: CreateLessonDto,
  ) {
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
    if (dto.type === 'video')
      await this.prisma.videoAsset.create({ data: { lessonId: lesson.id } });
    if (dto.type === 'document')
      await this.prisma.documentAsset.create({ data: { lessonId: lesson.id } });
    if (dto.type === 'quiz')
      await this.prisma.quizLesson.create({ data: { lessonId: lesson.id } });

    await this.updateCourseStats(sectionId);
    return lesson;
  }

  async updateLesson(
    lessonId: string,
    userId: string,
    userRole: string,
    dto: UpdateLessonDto,
  ) {
    const lesson = await this.findLessonOrFail(lessonId);
    await this.assertCourseOwnerBySection(lesson.sectionId, userId, userRole);
    const updated = await this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        title: dto.title,
        description: dto.description,
        isPreview: dto.isPreview,
      },
    });
    // Mô tả có thể đổi → kiểm duyệt lại + vector hóa lại nội dung chương
    if (dto.description !== undefined) {
      await this.resetLessonModeration(lessonId);
      await this.enqueueLessonIndex(lessonId);
    }
    return updated;
  }

  async deleteLesson(lessonId: string, userId: string, userRole: string) {
    const lesson = await this.findLessonOrFail(lessonId);
    await this.assertCourseOwnerBySection(lesson.sectionId, userId, userRole);

    if (lesson.type === 'video') {
      const asset = await this.prisma.videoAsset.findUnique({
        where: { lessonId },
      });
      if (asset?.videoUrl)
        await this.storage.deleteFile(
          this.storage.extractKeyFromUrl(asset.videoUrl),
        );
    } else if (lesson.type === 'document') {
      const asset = await this.prisma.documentAsset.findUnique({
        where: { lessonId },
      });
      if (asset?.fileUrl)
        await this.storage.deleteFile(
          this.storage.extractKeyFromUrl(asset.fileUrl),
        );
      if (asset?.markdownUrl)
        await this.storage.deleteFile(
          this.storage.extractKeyFromUrl(asset.markdownUrl),
        );
    }

    await this.prisma.lesson.delete({ where: { id: lessonId } });
    await this.vector.deleteByLesson(lessonId);
    await this.updateCourseStats(lesson.sectionId);
    return { message: 'Lesson deleted' };
  }

  async reorderLessons(
    sectionId: string,
    userId: string,
    userRole: string,
    lessonIds: string[],
  ) {
    await this.assertSectionOwner(sectionId, userId, userRole);
    await Promise.all(
      lessonIds.map((id, index) =>
        this.prisma.lesson.update({
          where: { id },
          data: { orderIndex: index + 1 },
        }),
      ),
    );
    return this.prisma.lesson.findMany({
      where: { sectionId },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async getLesson(lessonId: string, userId?: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        videoAsset: true,
        documentAsset: true,
        quizLesson: true,
        section: { select: { course: { select: { id: true, title: true, instructorId: true } } } },
      },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    if (!lesson.isPreview) {
      if (!userId) throw new ForbiddenException('Authentication required');

      const isInstructor = lesson.section.course.instructorId === userId;
      if (!isInstructor) {
        const section = await this.prisma.section.findUnique({
          where: { id: lesson.sectionId },
        });
        const enrolled = await this.prisma.enrollment.findFirst({
          where: {
            studentId: userId,
            courseId: section!.courseId,
            status: 'active',
          },
        });
        if (!enrolled)
          throw new ForbiddenException('You are not enrolled in this course');
      }
    }

    return lesson;
  }

  async updateCourseStats(sectionId: string) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
    });
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
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    return lesson;
  }

  private async assertSectionOwner(
    sectionId: string,
    userId: string,
    userRole: string,
  ) {
    const section = await this.prisma.section.findUnique({
      where: { id: sectionId },
      include: { course: true },
    });
    if (!section) throw new NotFoundException('Section not found');
    if (userRole !== 'admin' && section.course.instructorId !== userId)
      throw new ForbiddenException('Access denied');
    return section;
  }

  private async assertCourseOwnerBySection(
    sectionId: string,
    userId: string,
    userRole: string,
  ) {
    return this.assertSectionOwner(sectionId, userId, userRole);
  }

  async isEnrolled(userId: string, courseId: string): Promise<boolean> {
    const enrollment = await this.prisma.enrollment.findFirst({
      where: { studentId: userId, courseId, status: 'active' },
    });
    return !!enrollment;
  }
}
