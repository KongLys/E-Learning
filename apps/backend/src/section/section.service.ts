import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { ReorderSectionsDto } from './dto/reorder-sections.dto';
import { assertCourseEditable } from '../common/course-editable.util';
import { sortFinalQuizSectionsLast } from '../common/section-order.util';

@Injectable()
export class SectionService {
  constructor(private prisma: PrismaService) {}

  async addSection(
    courseId: string,
    userId: string,
    userRole: string,
    dto: CreateSectionDto,
  ) {
    const course = await this.assertCourseOwner(courseId, userId, userRole);
    assertCourseEditable(course.status);
    const maxIndex = await this.prisma.section.aggregate({
      where: { courseId },
      _max: { orderIndex: true },
    });
    const orderIndex = (maxIndex._max.orderIndex ?? 0) + 1;
    return this.prisma.section.create({
      data: { courseId, title: dto.title, orderIndex },
    });
  }

  async updateSection(
    courseId: string,
    sectionId: string,
    userId: string,
    userRole: string,
    dto: UpdateSectionDto,
  ) {
    const course = await this.assertCourseOwner(courseId, userId, userRole);
    assertCourseEditable(course.status);
    return this.prisma.section.update({
      where: { id: sectionId },
      data: { title: dto.title },
    });
  }

  async deleteSection(
    courseId: string,
    sectionId: string,
    userId: string,
    userRole: string,
  ) {
    const course = await this.assertCourseOwner(courseId, userId, userRole);
    assertCourseEditable(course.status);
    await this.prisma.section.delete({ where: { id: sectionId } });
    return { message: 'Section deleted' };
  }

  async reorderSections(
    courseId: string,
    userId: string,
    userRole: string,
    dto: ReorderSectionsDto,
  ) {
    const course = await this.assertCourseOwner(courseId, userId, userRole);
    assertCourseEditable(course.status);

    const sections = await this.prisma.section.findMany({
      where: { courseId },
      select: {
        id: true,
        lessons: {
          where: { isFinalQuiz: true },
          select: { id: true },
          take: 1,
        },
      },
    });
    const courseIds = new Set(sections.map((s) => s.id));
    for (const id of dto.sectionIds) {
      if (!courseIds.has(id))
        throw new BadRequestException(
          `Section ${id} does not belong to this course`,
        );
    }

    // Chương chứa bài kiểm tra cuối khóa LUÔN xuống cuối — bỏ khỏi thứ tự client
    // gửi lên (FE đã loại trừ) rồi gắn vào cuối để tránh lệch/đụng orderIndex.
    const finalIds = sections
      .filter((s) => s.lessons.length > 0)
      .map((s) => s.id);
    const fullOrder = [
      ...dto.sectionIds.filter((id) => !finalIds.includes(id)),
      ...finalIds,
    ];

    await Promise.all(
      fullOrder.map((id, index) =>
        this.prisma.section.update({
          where: { id },
          data: { orderIndex: index + 1 },
        }),
      ),
    );
    return this.prisma.section.findMany({
      where: { courseId },
      orderBy: { orderIndex: 'asc' },
    });
  }

  async getSections(courseId: string) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
      select: { finalQuizEnabled: true },
    });
    const sections = await this.prisma.section.findMany({
      where: { courseId },
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
            videoAsset: { select: { videoUrl: true, fileName: true } },
            documentAsset: { select: { fileUrl: true, fileName: true, fileType: true } },
          },
        },
      },
    });

    // Khi tắt quiz cuối khóa: ẩn bài kiểm tra cuối khóa khỏi chương trình học.
    if (course?.finalQuizEnabled === false) {
      return sections
        .map((s) => ({
          ...s,
          lessons: s.lessons.filter((l) => !l.isFinalQuiz),
        }))
        .filter((s) => s.lessons.length > 0);
    }
    // Bài kiểm tra cuối khóa luôn ở dưới cùng, kể cả khi orderIndex bị drift.
    return sortFinalQuizSectionsLast(sections);
  }

  private async assertCourseOwner(
    courseId: string,
    userId: string,
    userRole: string,
  ) {
    const course = await this.prisma.course.findUnique({
      where: { id: courseId },
    });
    if (!course) throw new NotFoundException('Course not found');
    if (userRole !== 'admin' && course.instructorId !== userId)
      throw new ForbiddenException('Access denied');
    return course;
  }
}
