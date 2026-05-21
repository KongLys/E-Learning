import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import slugify from 'slugify';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';

const EDITABLE_STATUSES = ['draft', 'rejected'];
const SUBMIT_VALID_STATUSES = ['draft', 'rejected'];

@Injectable()
export class CourseService {
  constructor(
    private prisma: PrismaService,
    private storage: StorageService,
  ) {}

  async createCourse(instructorId: string, dto: CreateCourseDto) {
    const slug = await this.generateUniqueSlug(dto.title);
    return this.prisma.course.create({
      data: {
        instructorId,
        slug,
        title: dto.title,
        description: dto.description,
        shortDescription: dto.shortDescription,
        price: dto.price ?? 0,
        discountPrice: dto.discountPrice,
        level: (dto.level as 'beginner' | 'intermediate' | 'advanced') ?? 'beginner',
        language: dto.language ?? 'vi',
        categoryId: dto.categoryId,
      },
    });
  }

  async updateCourse(courseId: string, userId: string, userRole: string, dto: UpdateCourseDto) {
    const course = await this.findOrFail(courseId);
    this.assertOwnerOrAdmin(course, userId, userRole);
    if (!EDITABLE_STATUSES.includes(course.status)) {
      throw new UnprocessableEntityException(`Course cannot be edited in status: ${course.status}`);
    }
    return this.prisma.course.update({
      where: { id: courseId },
      data: {
        ...(dto.title && { title: dto.title, slug: await this.generateUniqueSlug(dto.title, courseId) }),
        description: dto.description,
        shortDescription: dto.shortDescription,
        price: dto.price,
        discountPrice: dto.discountPrice,
        level: dto.level as 'beginner' | 'intermediate' | 'advanced' | undefined,
        language: dto.language,
        categoryId: dto.categoryId,
      },
    });
  }

  async uploadThumbnail(courseId: string, userId: string, userRole: string, file: Express.Multer.File) {
    const course = await this.findOrFail(courseId);
    this.assertOwnerOrAdmin(course, userId, userRole);

    if (course.thumbnailUrl) {
      await this.storage.deleteFile(this.storage.extractKeyFromUrl(course.thumbnailUrl));
    }

    const key = `thumbnails/${courseId}/${randomUUID()}.jpg`;
    const url = await this.storage.uploadFile(key, file.buffer, file.mimetype);
    return this.prisma.course.update({ where: { id: courseId }, data: { thumbnailUrl: url } });
  }

  async submitForReview(courseId: string, userId: string) {
    const course = await this.findOrFail(courseId);
    this.assertOwnerOrAdmin(course, userId, 'instructor');
    if (!SUBMIT_VALID_STATUSES.includes(course.status)) {
      throw new UnprocessableEntityException('Only draft or rejected courses can be submitted');
    }

    const sectionCount = await this.prisma.section.count({ where: { courseId } });
    if (sectionCount === 0) throw new BadRequestException('Course must have at least one section');

    const lessonCount = await this.prisma.lesson.count({ where: { section: { courseId } } });
    if (lessonCount === 0) throw new BadRequestException('Course must have at least one lesson');

    return this.prisma.course.update({ where: { id: courseId }, data: { status: 'pending' } });
  }

  async archiveCourse(courseId: string, userId: string, userRole: string) {
    const course = await this.findOrFail(courseId);
    this.assertOwnerOrAdmin(course, userId, userRole);
    if (course.status !== 'published') {
      throw new UnprocessableEntityException('Only published courses can be archived');
    }
    return this.prisma.course.update({ where: { id: courseId }, data: { status: 'archived' } });
  }

  async approveCourse(courseId: string) {
    const course = await this.findOrFail(courseId);
    if (course.status !== 'pending') {
      throw new UnprocessableEntityException('Only pending courses can be approved');
    }
    return this.prisma.course.update({
      where: { id: courseId },
      data: { status: 'published', publishedAt: new Date() },
    });
  }

  async rejectCourse(courseId: string, reason: string) {
    const course = await this.findOrFail(courseId);
    if (course.status !== 'pending') {
      throw new UnprocessableEntityException('Only pending courses can be rejected');
    }
    return this.prisma.course.update({
      where: { id: courseId },
      data: { status: 'rejected', rejectionReason: reason },
    });
  }

  async listPublicCourses(query: {
    page?: number; limit?: number; category?: string;
    level?: string; search?: string; sort?: string; price?: string;
  }) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 12;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = { status: 'published' };
    if (query.level) where.level = query.level;
    if (query.search) {
      where.OR = [
        { title: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }
    if (query.category) {
      where.category = { slug: query.category };
    }
    if (query.price === 'free') where.price = 0;
    if (query.price === 'paid') where.price = { gt: 0 };

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
        include: { instructor: { select: { id: true, fullName: true, avatarUrl: true } }, category: true },
      }),
      this.prisma.course.count({ where }),
    ]);

    return { courses, total, page, limit };
  }

  async getCourseBySlug(slug: string) {
    const course = await this.prisma.course.findUnique({
      where: { slug },
      include: {
        instructor: { select: { id: true, fullName: true, avatarUrl: true, bio: true } },
        category: true,
        sections: {
          orderBy: { orderIndex: 'asc' },
          include: {
            lessons: {
              orderBy: { orderIndex: 'asc' },
              select: { id: true, title: true, type: true, durationSec: true, isPreview: true, orderIndex: true },
            },
          },
        },
      },
    });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  async getInstructorCourses(instructorId: string) {
    return this.prisma.course.findMany({
      where: { instructorId },
      orderBy: { createdAt: 'desc' },
      include: { category: true },
    });
  }

  async listAdminCourses(query: { status?: string; page?: number; limit?: number }) {
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
            include: { lessons: { orderBy: { orderIndex: 'asc' }, select: { id: true, title: true, type: true } } },
          },
        },
      }),
      this.prisma.course.count({ where: query.status ? { status: query.status as 'pending' } : undefined }),
    ]);
    return { courses, total, page, limit };
  }

  private async findOrFail(courseId: string) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    return course;
  }

  private assertOwnerOrAdmin(course: { instructorId: string }, userId: string, userRole: string) {
    if (userRole !== 'admin' && course.instructorId !== userId) {
      throw new ForbiddenException('Access denied');
    }
  }

  private async generateUniqueSlug(title: string, excludeId?: string): Promise<string> {
    const base = slugify(title, { lower: true, strict: true });
    const existing = await this.prisma.course.findUnique({ where: { slug: base } });
    if (!existing || existing.id === excludeId) return base;
    return `${base}-${randomUUID().slice(0, 8)}`;
  }
}
