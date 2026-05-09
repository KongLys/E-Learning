import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateQuickQuestionDto } from './dto/create-question.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { PositionType } from '../note/dto/create-note.dto';

@Injectable()
export class QuickQuestionService {
  constructor(private prisma: PrismaService) {}

  async createQuestion(studentId: string, dto: CreateQuickQuestionDto) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
      include: { section: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const enrolled = await this.prisma.enrollment.findFirst({
      where: { studentId, courseId: lesson.section.courseId, status: 'active' },
    });
    if (!enrolled) throw new ForbiddenException('Not enrolled in this course');

    return this.prisma.quickQuestion.create({
      data: {
        studentId,
        lessonId: dto.lessonId,
        content: dto.content,
        positionType: dto.positionType,
        positionValue: dto.positionType === PositionType.NONE ? 0 : dto.positionValue,
        isPublic: dto.isPublic ?? true,
      },
    });
  }

  async getByLesson(lessonId: string, userId: string, role: string, status?: string, page = 1, limit = 20) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { section: { include: { course: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const isInstructor = lesson.section.course.instructorId === userId || role === 'admin';

    const where: any = { lessonId };
    if (status) where.status = status;
    if (!isInstructor) {
      where.OR = [{ studentId: userId }, { isPublic: true }];
    }

    return this.prisma.quickQuestion.findMany({
      where,
      include: { replies: { include: { author: { select: { id: true, fullName: true } } } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: Math.min(limit, 50),
    });
  }

  async getInstructorInbox(instructorId: string, courseId: string, status?: string, page = 1, limit = 20) {
    const course = await this.prisma.course.findUnique({ where: { id: courseId } });
    if (!course) throw new NotFoundException('Course not found');
    if (course.instructorId !== instructorId) throw new ForbiddenException('Access denied');

    const where: any = { lesson: { section: { courseId } } };
    if (status) where.status = status;

    return this.prisma.quickQuestion.findMany({
      where,
      include: {
        lesson: { select: { id: true, title: true } },
        student: { select: { id: true, fullName: true } },
        replies: true,
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: Math.min(limit, 50),
    });
  }

  async addReply(questionId: string, authorId: string, role: string, dto: CreateReplyDto) {
    const question = await this.prisma.quickQuestion.findUnique({
      where: { id: questionId },
      include: { lesson: { include: { section: { include: { course: true } } } } },
    });
    if (!question) throw new NotFoundException('Question not found');

    const isInstructor = question.lesson.section.course.instructorId === authorId || role === 'admin';
    if (!isInstructor) throw new ForbiddenException('Only instructors and admins can reply');

    const reply = await this.prisma.questionReply.create({
      data: { questionId, authorId, content: dto.content },
    });

    await this.prisma.quickQuestion.update({
      where: { id: questionId },
      data: { status: 'answered', answeredAt: new Date() },
    });

    return reply;
  }

  async closeQuestion(questionId: string, userId: string, role: string) {
    const question = await this.prisma.quickQuestion.findUnique({
      where: { id: questionId },
      include: { lesson: { include: { section: { include: { course: true } } } } },
    });
    if (!question) throw new NotFoundException('Question not found');

    const isOwner = question.studentId === userId;
    const isInstructor = question.lesson.section.course.instructorId === userId || role === 'admin';
    if (!isOwner && !isInstructor) throw new ForbiddenException('Access denied');

    return this.prisma.quickQuestion.update({
      where: { id: questionId },
      data: { status: 'closed' },
      select: { id: true, status: true },
    });
  }

  async reopenQuestion(questionId: string, userId: string) {
    const question = await this.prisma.quickQuestion.findUnique({ where: { id: questionId } });
    if (!question) throw new NotFoundException('Question not found');
    if (question.studentId !== userId) throw new ForbiddenException('Only the question owner can reopen');
    if (question.status !== 'answered') throw new UnprocessableEntityException('Only answered questions can be reopened');

    return this.prisma.quickQuestion.update({
      where: { id: questionId },
      data: { status: 'pending' },
      select: { id: true, status: true },
    });
  }

  async getQuestion(questionId: string, userId: string, role: string) {
    const question = await this.prisma.quickQuestion.findUnique({
      where: { id: questionId },
      include: {
        replies: { include: { author: { select: { id: true, fullName: true } } } },
        lesson: { include: { section: { include: { course: true } } } },
      },
    });
    if (!question) throw new NotFoundException('Question not found');

    const isInstructor = question.lesson.section.course.instructorId === userId || role === 'admin';
    const isOwner = question.studentId === userId;

    if (!isInstructor && !isOwner && !question.isPublic) {
      throw new ForbiddenException('Access denied');
    }

    const enrolled = await this.prisma.enrollment.findFirst({
      where: { studentId: userId, courseId: question.lesson.section.courseId, status: 'active' },
    });
    if (!isInstructor && !enrolled) throw new ForbiddenException('Not enrolled in this course');

    return question;
  }
}
