import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import type { Express } from 'express';
import slugify from 'slugify';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ModerationService } from '../moderation/moderation.service';
import { FinalQuizService } from '../final-quiz/final-quiz.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { assertCourseEditable } from '../common/course-editable.util';

const SUBMIT_VALID_STATUSES = ['draft', 'rejected'];

@Injectable()
export class CourseService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
    private moderation: ModerationService,
    private finalQuiz: FinalQuizService,
    private events: EventEmitter2,
  ) {}

  async createCourse(instructorId: string, dto: CreateCourseDto) {
    const slug = await this.generateUniqueSlug(dto.title);
    const course = await this.prisma.course.create({
      data: {
        instructorId,
        slug,
        title: dto.title,
        description: dto.description,
        shortDescription: dto.shortDescription,
        price: dto.price ?? 0,
        discountPrice: dto.discountPrice,
        level:
          (dto.level as 'beginner' | 'intermediate' | 'advanced') ?? 'beginner',
        language: dto.language ?? 'vi',
        categoryId: dto.categoryId,
        objectives: dto.objectives ?? [],
        targetAudience: dto.targetAudience ?? [],
        requirements: dto.requirements ?? [],
      },
    });
    await this.moderation.moderateCourse(
      course.id,
      instructorId,
      course.title,
      course.description,
    );
    return this.prisma.course.findUnique({ where: { id: course.id } });
  }

  async updateCourse(
    courseId: string,
    userId: string,
    userRole: string,
    dto: UpdateCourseDto,
  ) {
    const course = await this.findOrFail(courseId);
    this.assertOwnerOrAdmin(course, userId, userRole);
    assertCourseEditable(course.status);
    const updated = await this.prisma.course.update({
      where: { id: courseId },
      data: {
        ...(dto.title && {
          title: dto.title,
          slug: await this.generateUniqueSlug(dto.title, courseId),
        }),
        description: dto.description,
        shortDescription: dto.shortDescription,
        price: dto.price,
        discountPrice: dto.discountPrice,
        level: dto.level as
          | 'beginner'
          | 'intermediate'
          | 'advanced'
          | undefined,
        language: dto.language,
        categoryId: dto.categoryId,
        ...(dto.objectives !== undefined && { objectives: dto.objectives }),
        ...(dto.targetAudience !== undefined && {
          targetAudience: dto.targetAudience,
        }),
        ...(dto.requirements !== undefined && {
          requirements: dto.requirements,
        }),
        ...(dto.welcomeMessage !== undefined && {
          welcomeMessage: dto.welcomeMessage,
        }),
        ...(dto.congratulationsMessage !== undefined && {
          congratulationsMessage: dto.congratulationsMessage,
        }),
      },
    });
    // Re-moderate when the moderated text fields change.
    if (dto.title !== undefined || dto.description !== undefined) {
      await this.moderation.moderateCourse(
        courseId,
        updated.instructorId,
        updated.title,
        updated.description,
      );
      return this.prisma.course.findUnique({ where: { id: courseId } });
    }
    return updated;
  }

  async uploadThumbnail(
    courseId: string,
    userId: string,
    userRole: string,
    file: Express.Multer.File,
  ) {
    const course = await this.findOrFail(courseId);
    this.assertOwnerOrAdmin(course, userId, userRole);

    if (course.thumbnailUrl) {
      await this.storage.deleteFile(
        this.storage.extractKeyFromUrl(course.thumbnailUrl),
      );
    }

    const key = `thumbnails/${courseId}/${randomUUID()}.jpg`;
    const url = await this.storage.uploadFile(key, file.buffer, file.mimetype);
    return this.prisma.course.update({
      where: { id: courseId },
      data: { thumbnailUrl: url },
    });
  }

  async submitForReview(courseId: string, userId: string) {
    const course = await this.findOrFail(courseId);
    this.assertOwnerOrAdmin(course, userId, 'instructor');
    if (!SUBMIT_VALID_STATUSES.includes(course.status)) {
      throw new UnprocessableEntityException(
        'Only draft or rejected courses can be submitted',
      );
    }

    if (course.moderationStatus !== 'approved') {
      throw new UnprocessableEntityException(
        'Nội dung khóa học chưa được kiểm duyệt hoặc bị từ chối — không thể gửi duyệt',
      );
    }

    // Chặn gửi duyệt khi có bài học bị từ chối / bị khóa
    const rejectedLessonCount = await this.prisma.lesson.count({
      where: {
        section: { courseId },
        moderationStatus: { in: ['rejected', 'locked'] },
      },
    });
    if (rejectedLessonCount > 0) {
      throw new UnprocessableEntityException(
        `Khóa học có ${rejectedLessonCount} bài học bị từ chối — vui lòng kiến nghị hoặc chỉnh sửa bài học trước khi gửi duyệt`,
      );
    }

    // Chặn gửi duyệt khi bài học vẫn đang chờ kiểm duyệt AI
    const pendingLessonCount = await this.prisma.lesson.count({
      where: {
        section: { courseId },
        moderationStatus: { in: ['pending', 'appealing'] },
      },
    });
    if (pendingLessonCount > 0) {
      throw new UnprocessableEntityException(
        `Khóa học có ${pendingLessonCount} bài học đang chờ kiểm duyệt — vui lòng đợi hệ thống xử lý xong trước khi gửi duyệt`,
      );
    }

    const sectionCount = await this.prisma.section.count({
      where: { courseId },
    });
    if (sectionCount === 0)
      throw new BadRequestException('Course must have at least one section');

    const lessonCount = await this.prisma.lesson.count({
      where: { section: { courseId } },
    });
    if (lessonCount === 0)
      throw new BadRequestException('Course must have at least one lesson');

    // Nguồn tri thức cho AI giờ là bài học: cần ít nhất một bài đọc (document lesson).
    const lessonDocCount = await this.prisma.documentAsset.count({
      where: { lesson: { section: { courseId } } },
    });
    if (lessonDocCount === 0) {
      throw new BadRequestException(
        'Course must have at least one document lesson (bài đọc/tài liệu) for the AI knowledge base',
      );
    }

    return this.prisma.course.update({
      where: { id: courseId },
      data: { status: 'pending' },
    });
  }

  async deleteCourse(courseId: string, userId: string, userRole: string) {
    const course = await this.findOrFail(courseId);
    this.assertOwnerOrAdmin(course, userId, userRole);

    // Giảng viên chỉ được xóa khóa chưa xuất bản; admin xóa được tất cả
    if (userRole !== 'admin' && !['draft', 'rejected'].includes(course.status)) {
      throw new UnprocessableEntityException(
        'Chỉ admin mới có thể xóa khóa học đã xuất bản. Vui lòng hủy xuất bản hoặc liên hệ admin.',
      );
    }

    // Thu thập key file R2 trước khi xóa DB
    const lessons = await this.prisma.lesson.findMany({
      where: { section: { courseId } },
      select: {
        id: true,
        videoAsset: { select: { videoUrl: true } },
        documentAsset: { select: { fileUrl: true, markdownUrl: true } },
      },
    });

    const storageKeys: string[] = [];
    if (course.thumbnailUrl) {
      storageKeys.push(this.storage.extractKeyFromUrl(course.thumbnailUrl));
    }
    for (const lesson of lessons) {
      if (lesson.videoAsset?.videoUrl) {
        storageKeys.push(
          this.storage.extractKeyFromUrl(lesson.videoAsset.videoUrl),
        );
      }
      if (lesson.documentAsset?.fileUrl) {
        storageKeys.push(
          this.storage.extractKeyFromUrl(lesson.documentAsset.fileUrl),
        );
      }
      if (lesson.documentAsset?.markdownUrl) {
        storageKeys.push(
          this.storage.extractKeyFromUrl(lesson.documentAsset.markdownUrl),
        );
      }
    }

    const lessonIds = lessons.map((l) => l.id);

    // Transaction: xóa children không có cascade trước, sau đó xóa course
    await this.prisma.$transaction(async (tx) => {
      if (lessonIds.length > 0) {
        // QuizAttempt (cascade → QuizAttemptAnswer)
        await tx.quizAttempt.deleteMany({
          where: { quizLesson: { lessonId: { in: lessonIds } } },
        });
        // Note, QuickQuestion (cascade → QuestionReply), LessonProgress (lesson-side)
        await tx.note.deleteMany({ where: { lessonId: { in: lessonIds } } });
        await tx.quickQuestion.deleteMany({
          where: { lessonId: { in: lessonIds } },
        });
        await tx.lessonProgress.deleteMany({
          where: { lessonId: { in: lessonIds } },
        });
      }
      // Enrollment (cascade → LessonProgress enrollment-side)
      await tx.enrollment.deleteMany({ where: { courseId } });
      // Review (cascade → ReviewReport)
      await tx.review.deleteMany({ where: { courseId } });
      // OrderItem
      await tx.orderItem.deleteMany({ where: { courseId } });
      // Course (cascade → Section/Lesson/assets/AI/community/chunks...)
      await tx.course.delete({ where: { id: courseId } });
    });

    // Xóa file trên R2 sau khi DB commit (best-effort)
    await Promise.all(storageKeys.map((k) => this.storage.deleteFile(k)));

    return { message: 'Course deleted' };
  }

  async unpublishCourse(courseId: string, userId: string, userRole: string) {
    const course = await this.findOrFail(courseId);
    this.assertOwnerOrAdmin(course, userId, userRole);
    if (course.status !== 'published') {
      throw new UnprocessableEntityException(
        'Chỉ khóa học đang xuất bản mới có thể hủy xuất bản',
      );
    }
    return this.prisma.course.update({
      where: { id: courseId },
      data: { status: 'draft' },
    });
  }

  async archiveCourse(courseId: string, userId: string, userRole: string) {
    const course = await this.findOrFail(courseId);
    this.assertOwnerOrAdmin(course, userId, userRole);
    if (course.status !== 'published') {
      throw new UnprocessableEntityException(
        'Only published courses can be archived',
      );
    }
    return this.prisma.course.update({
      where: { id: courseId },
      data: { status: 'archived' },
    });
  }

  async approveCourse(courseId: string) {
    const course = await this.findOrFail(courseId);
    if (course.status !== 'pending') {
      throw new UnprocessableEntityException(
        'Only pending courses can be approved',
      );
    }
    const updated = await this.prisma.course.update({
      where: { id: courseId },
      data: { status: 'published', publishedAt: new Date() },
    });
    // Tự sinh giọng đọc (TTS) + video ngắn (AI) cho các bài đọc — chạy nền qua listener.
    this.events.emit('course.published', { courseId });
    return updated;
  }

  async rejectCourse(courseId: string, reason: string) {
    const course = await this.findOrFail(courseId);
    if (course.status !== 'pending') {
      throw new UnprocessableEntityException(
        'Only pending courses can be rejected',
      );
    }
    return this.prisma.course.update({
      where: { id: courseId },
      data: { status: 'rejected', rejectionReason: reason },
    });
  }

  async listPublicCourses(query: {
    page?: number;
    limit?: number;
    category?: string;
    categoryId?: string;
    level?: string;
    search?: string;
    sort?: string;
    price?: string;
    studentId?: string;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { status: 'published' };
    // Chỉ nhận giá trị enum hợp lệ (defense-in-depth, không phụ thuộc Prisma reject).
    const ALLOWED_LEVELS = ['beginner', 'intermediate', 'advanced'];
    if (query.level && ALLOWED_LEVELS.includes(query.level)) {
      where.level = query.level;
    }
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.category) {
      where.category = { slug: query.category };
    }
    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }
    if (query.price === 'free') where.price = 0;
    if (query.price === 'paid') where.price = { gt: 0 };

    // Exclude courses the student has already enrolled in
    if (query.studentId) {
      const enrolled = await this.prisma.enrollment.findMany({
        where: { studentId: query.studentId, status: 'active' },
        select: { courseId: true },
      });
      if (enrolled.length > 0) {
        where.id = { notIn: enrolled.map((e) => e.courseId) };
      }
    }

    const orderBy: Record<string, string> =
      query.sort === 'popular'
        ? { totalStudents: 'desc' }
        : query.sort === 'rating'
          ? { avgRating: 'desc' }
          : { createdAt: 'desc' };

    const [courses, total] = await Promise.all([
      this.prisma.course.findMany({
        where,
        skip,
        take: limit,
        orderBy,
        include: {
          instructor: { select: { id: true, fullName: true, avatarUrl: true } },
          category: true,
        },
      }),
      this.prisma.course.count({ where }),
    ]);

    return { courses, total, page, limit };
  }

  async listCategories() {
    return this.prisma.category.findMany({ orderBy: { name: 'asc' } });
  }

  async getCourseBySlug(slug: string) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        instructor: {
          select: { id: true, fullName: true, avatarUrl: true, bio: true },
        },
        category: true,
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: {
            lessons: {
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                title: true,
                type: true,
                durationSec: true,
                isPreview: true,
                isFinalQuiz: true,
                orderIndex: true,
              },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    const totalReviews = await this.prisma.review.count({
      where: { courseId: course.id, isHidden: false },
    });
    // Ẩn bài kiểm tra cuối khóa khỏi xem trước khi tính năng đang tắt.
    const sections = course.finalQuizEnabled
      ? course.sections
      : course.sections
          .map((s) => ({ ...s, lessons: s.lessons.filter((l) => !l.isFinalQuiz) }))
          .filter((s) => s.lessons.length > 0);
    return { ...course, sections, totalReviews };
  }

  async getCourseForManage(courseId: string, userId: string, userRole: string) {
    // Đảm bảo slot quiz cuối khóa tồn tại để giảng viên có thể tự soạn (nếu bật).
    const base = await this.findOrFail(courseId);
    this.assertOwnerOrAdmin(base, userId, userRole);
    await this.finalQuiz.ensureFinalQuiz(courseId);

    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      include: {
        instructor: {
          select: { id: true, fullName: true, avatarUrl: true, bio: true },
        },
        category: true,
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: {
            lessons: {
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                title: true,
                description: true,
                type: true,
                durationSec: true,
                isPreview: true,
                isFinalQuiz: true,
                orderIndex: true,
                moderationStatus: true,
                moderationLabel: true,
                moderationReason: true,
                quizLesson: {
                  select: {
                    id: true,
                    passingScore: true,
                    aiGenerated: true,
                    generationStatus: true,
                    errorMsg: true,
                    _count: { select: { questions: true } },
                  },
                },
                videoAsset: {
                  select: {
                    fileName: true,
                    durationSec: true,
                    processingStatus: true,
                    videoUrl: true,
                  },
                },
                documentAsset: {
                  select: {
                    fileName: true,
                    fileType: true,
                    fileSize: true,
                    pageCount: true,
                    parseStatus: true,
                    contentHtml: true,
                    fileUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    this.assertOwnerOrAdmin(course, userId, userRole);
    // Serialize BigInt fileSize fields to string to avoid JSON serialization errors
    const serialized = {
      ...course,
      sections: course.sections.map((s) => ({
        ...s,
        lessons: s.lessons.map((l) => ({
          ...l,
          documentAsset: l.documentAsset
            ? {
                ...l.documentAsset,
                fileSize: l.documentAsset.fileSize?.toString() ?? null,
              }
            : null,
        })),
      })),
    };
    return serialized;
  }

  async getInstructorCourses(instructorId: string) {
    const courses = await this.prisma.course.findMany({
      where: { instructorId },
      orderBy: { createdAt: 'desc' },
      include: { category: true },
    });

    // `Course.totalStudents` is not denormalized, so derive live enrollment
    // counts (active + completed, i.e. everyone not cancelled) per course.
    const enrollmentCounts = await this.prisma.enrollment.groupBy({
      by: ['courseId'],
      where: {
        courseId: { in: courses.map((c) => c.id) },
        status: { not: 'cancelled' },
      },
      _count: { _all: true },
    });
    const countByCourse = new Map(
      enrollmentCounts.map((g) => [g.courseId, g._count._all]),
    );

    return courses.map((c) => ({
      ...c,
      totalStudents: countByCourse.get(c.id) ?? 0,
    }));
  }

  async listAdminCourses(query: {
    status?: string;
    page?: number;
    limit?: number;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const [courses, total] = await Promise.all([
      this.prisma.course.findMany({
        where: query.status ? { status: query.status as 'pending' } : undefined,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          instructor: { select: { id: true, fullName: true, email: true } },
          sections: {
            orderBy: { orderIndex: 'asc' },
            include: {
              lessons: {
                orderBy: { orderIndex: 'asc' },
                select: { id: true, title: true, type: true },
              },
            },
          },
        },
      }),
      this.prisma.course.count({
        where: query.status ? { status: query.status as 'pending' } : undefined,
      }),
    ]);
    return { courses, total, page, limit };
  }

  private async findOrFail(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  private assertOwnerOrAdmin(
    course: { instructorId: string },
    userId: string,
    userRole: string,
  ) {
    if (userRole !== 'admin' && course.instructorId !== userId) {
      throw new ForbiddenException('Access denied');
    }
  }

  private async generateUniqueSlug(
    title: string,
    excludeId?: string,
  ): Promise<string> {
    const base = slugify(title, { lower: true, strict: true });
    const existing = await this.prisma.course.findUnique({
      where: { slug: base },
    });
    if (!existing || existing.id === excludeId) return base;
    return `${base}-${randomUUID().slice(0, 8)}`;
  }
}
