import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { QuizConfigDto } from '../dto/quiz-config.dto';
import { CreateQuestionDto } from '../dto/create-question.dto';

@Injectable()
export class QuizService {
  constructor(private prisma: PrismaService) {}

  async configQuiz(
    lessonId: string,
    userId: string,
    userRole: string,
    dto: QuizConfigDto,
  ) {
    await this.assertLessonOwner(lessonId, userId, userRole);
    return this.prisma.quizLesson.upsert({
      where: { lessonId },
      update: {
        passingScore: dto.passingScore ?? 70,
        timeLimit: dto.timeLimit,
        maxAttempts: dto.maxAttempts ?? 0,
      },
      create: {
        lessonId,
        passingScore: dto.passingScore ?? 70,
        timeLimit: dto.timeLimit,
        maxAttempts: dto.maxAttempts ?? 0,
      },
    });
  }

  async addQuestion(
    lessonId: string,
    userId: string,
    userRole: string,
    dto: CreateQuestionDto,
  ) {
    await this.assertLessonOwner(lessonId, userId, userRole);
    const quiz = await this.prisma.quizLesson.findUnique({
      where: { lessonId },
    });
    if (!quiz) throw new NotFoundException('Quiz not configured');

    this.validateOptions(dto);

    const question = await this.prisma.quizQuestion.create({
      data: {
        quizLessonId: quiz.id,
        content: dto.content,
        questionType: dto.questionType,
        orderIndex: dto.orderIndex,
        points: dto.points ?? 1,
        explanation: dto.explanation,
        options: {
          create: dto.options.map((o) => ({
            content: o.content,
            isCorrect: o.isCorrect,
            orderIndex: o.orderIndex,
          })),
        },
      },
      include: { options: true },
    });

    return question;
  }

  async updateQuestion(
    questionId: string,
    userId: string,
    userRole: string,
    dto: CreateQuestionDto,
  ) {
    const question = await this.prisma.quizQuestion.findUnique({
      where: { id: questionId },
      include: { quizLesson: true },
    });
    if (!question) throw new NotFoundException('Question not found');
    await this.assertLessonOwner(
      question.quizLesson.lessonId,
      userId,
      userRole,
    );
    this.validateOptions(dto);

    await this.prisma.quizOption.deleteMany({ where: { questionId } });
    return this.prisma.quizQuestion.update({
      where: { id: questionId },
      data: {
        content: dto.content,
        questionType: dto.questionType,
        orderIndex: dto.orderIndex,
        points: dto.points ?? 1,
        explanation: dto.explanation,
        options: {
          create: dto.options.map((o) => ({
            content: o.content,
            isCorrect: o.isCorrect,
            orderIndex: o.orderIndex,
          })),
        },
      },
      include: { options: true },
    });
  }

  async deleteQuestion(questionId: string, userId: string, userRole: string) {
    const question = await this.prisma.quizQuestion.findUnique({
      where: { id: questionId },
      include: { quizLesson: true },
    });
    if (!question) throw new NotFoundException('Question not found');
    await this.assertLessonOwner(
      question.quizLesson.lessonId,
      userId,
      userRole,
    );
    await this.prisma.quizQuestion.delete({ where: { id: questionId } });
    return { message: 'Question deleted' };
  }

  async getQuiz(lessonId: string, userId: string, userRole: string) {
    const quiz = await this.prisma.quizLesson.findUnique({
      where: { lessonId },
      include: {
        questions: {
          orderBy: { orderIndex: 'asc' },
          include: { options: { orderBy: { orderIndex: 'asc' } } },
        },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { section: { include: { course: true } } },
    });
    const isInstructor =
      lesson?.section.course.instructorId === userId || userRole === 'admin';

    if (!isInstructor) {
      quiz.questions = quiz.questions.map((q) => ({
        ...q,
        options: q.options.map((o) => ({ ...o, isCorrect: false })),
      }));
    }

    return quiz;
  }

  private validateOptions(dto: CreateQuestionDto) {
    const correctCount = dto.options.filter((o) => o.isCorrect).length;
    if (dto.questionType === 'single' && correctCount !== 1) {
      throw new BadRequestException(
        'Single-choice question must have exactly one correct answer',
      );
    }
    if (dto.questionType === 'multiple' && correctCount < 2) {
      throw new BadRequestException(
        'Multiple-choice question must have at least two correct answers',
      );
    }
    if (dto.questionType === 'true_false' && dto.options.length !== 2) {
      throw new BadRequestException(
        'True/false question must have exactly two options',
      );
    }
  }

  private async assertLessonOwner(
    lessonId: string,
    userId: string,
    userRole: string,
  ) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { section: { include: { course: true } } },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');
    if (userRole !== 'admin' && lesson.section.course.instructorId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    return lesson;
  }
}
