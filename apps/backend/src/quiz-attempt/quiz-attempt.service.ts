import {
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';

@Injectable()
export class QuizAttemptService {
  constructor(
    private prisma: PrismaService,
    private progressService: ProgressService,
  ) {}

  async submit(studentId: string, quizLessonId: string, dto: SubmitAttemptDto) {
    const quiz = await this.prisma.quizLesson.findUnique({
      where: { id: quizLessonId },
      include: {
        questions: { include: { options: true } },
        lesson: { include: { section: true } },
      },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    const enrollment = await this.prisma.enrollment.findFirst({
      where: {
        studentId,
        courseId: quiz.lesson.section.courseId,
        status: 'active',
      },
    });
    if (!enrollment)
      throw new ForbiddenException('Not enrolled in this course');

    if (quiz.maxAttempts > 0) {
      const attemptCount = await this.prisma.quizAttempt.count({
        where: { quizLessonId, studentId },
      });
      if (attemptCount >= quiz.maxAttempts) {
        throw new UnprocessableEntityException('Maximum attempts reached');
      }
    }

    let totalPoints = 0;
    let earnedPoints = 0;
    const results: {
      questionId: string;
      isCorrect: boolean;
      correctOptionIds: string[];
      yourOptionIds: string[];
      explanation: string | null;
    }[] = [];

    for (const question of quiz.questions) {
      totalPoints += question.points;
      const correctOptionIds = question.options
        .filter((o) => o.isCorrect)
        .map((o) => o.id);
      const answer = dto.answers.find((a) => a.questionId === question.id);
      const yourOptionIds = answer?.optionIds ?? [];

      const isCorrect =
        correctOptionIds.length === yourOptionIds.length &&
        correctOptionIds.every((id) => yourOptionIds.includes(id));

      if (isCorrect) earnedPoints += question.points;

      results.push({
        questionId: question.id,
        isCorrect,
        correctOptionIds,
        yourOptionIds,
        explanation: question.explanation,
      });
    }

    const score = totalPoints > 0 ? (earnedPoints / totalPoints) * 100 : 0;
    const isPassed = score >= quiz.passingScore;

    const attempt = await this.prisma.quizAttempt.create({
      data: {
        quizLessonId,
        studentId,
        score,
        isPassed,
        answers: {
          create: dto.answers.flatMap((a) =>
            a.optionIds.map((optionId) => ({
              questionId: a.questionId,
              optionId,
            })),
          ),
        },
      },
    });

    let lessonCompleted = false;
    if (isPassed) {
      await this.progressService.markComplete(studentId, quiz.lesson.id);
      lessonCompleted = true;
    }

    return {
      attemptId: attempt.id,
      score,
      isPassed,
      passingScore: quiz.passingScore,
      results,
      lessonCompleted,
    };
  }

  async getAttempts(studentId: string, quizLessonId: string) {
    const quiz = await this.prisma.quizLesson.findUnique({
      where: { id: quizLessonId },
    });
    if (!quiz) throw new NotFoundException('Quiz not found');

    return this.prisma.quizAttempt.findMany({
      where: { quizLessonId, studentId },
      orderBy: { startedAt: 'desc' },
    });
  }
}
