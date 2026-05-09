import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QuizAttemptService } from './quiz-attempt.service';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';

const mockPrisma = {
  quizLesson: { findUnique: jest.fn() },
  enrollment: { findFirst: jest.fn() },
  quizAttempt: { count: jest.fn(), create: jest.fn(), findMany: jest.fn() },
};

const mockProgressService = {
  markComplete: jest.fn(),
};

const makeQuiz = (passingScore = 70, maxAttempts = 0) => ({
  id: 'quiz-1',
  passingScore,
  maxAttempts,
  lesson: { id: 'lesson-1', section: { courseId: 'course-1' } },
  questions: [
    {
      id: 'q-1',
      points: 1,
      explanation: null,
      options: [
        { id: 'o-correct', isCorrect: true },
        { id: 'o-wrong', isCorrect: false },
      ],
    },
  ],
});

describe('QuizAttemptService', () => {
  let service: QuizAttemptService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizAttemptService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ProgressService, useValue: mockProgressService },
      ],
    }).compile();

    service = module.get<QuizAttemptService>(QuizAttemptService);
    jest.clearAllMocks();
  });

  describe('submit', () => {
    it('throws NotFoundException when quiz not found', async () => {
      mockPrisma.quizLesson.findUnique.mockResolvedValue(null);
      await expect(service.submit('student-1', 'quiz-1', { answers: [] }))
        .rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when not enrolled', async () => {
      mockPrisma.quizLesson.findUnique.mockResolvedValue(makeQuiz());
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      await expect(service.submit('student-1', 'quiz-1', { answers: [] }))
        .rejects.toThrow(ForbiddenException);
    });

    it('throws UnprocessableEntityException when max_attempts reached', async () => {
      mockPrisma.quizLesson.findUnique.mockResolvedValue(makeQuiz(70, 3));
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 'enroll-1' });
      mockPrisma.quizAttempt.count.mockResolvedValue(3);
      await expect(service.submit('student-1', 'quiz-1', { answers: [] }))
        .rejects.toThrow(UnprocessableEntityException);
    });

    it('grades single question correctly — correct answer → 100%', async () => {
      mockPrisma.quizLesson.findUnique.mockResolvedValue(makeQuiz(70));
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 'enroll-1' });
      mockPrisma.quizAttempt.count.mockResolvedValue(0);
      mockPrisma.quizAttempt.create.mockResolvedValue({ id: 'attempt-1' });
      mockProgressService.markComplete.mockResolvedValue({ progressPercent: 100, lessonCompleted: true });

      const dto = { answers: [{ questionId: 'q-1', optionIds: ['o-correct'] }] };
      const result = await service.submit('student-1', 'quiz-1', dto);

      expect(result.score).toBe(100);
      expect(result.isPassed).toBe(true);
      expect(result.results[0].isCorrect).toBe(true);
    });

    it('grades single question correctly — wrong answer → 0%', async () => {
      mockPrisma.quizLesson.findUnique.mockResolvedValue(makeQuiz(70));
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 'enroll-1' });
      mockPrisma.quizAttempt.count.mockResolvedValue(0);
      mockPrisma.quizAttempt.create.mockResolvedValue({ id: 'attempt-1' });

      const dto = { answers: [{ questionId: 'q-1', optionIds: ['o-wrong'] }] };
      const result = await service.submit('student-1', 'quiz-1', dto);

      expect(result.score).toBe(0);
      expect(result.isPassed).toBe(false);
      expect(result.results[0].isCorrect).toBe(false);
      expect(mockProgressService.markComplete).not.toHaveBeenCalled();
    });

    it('does not mark complete when quiz not passed', async () => {
      mockPrisma.quizLesson.findUnique.mockResolvedValue(makeQuiz(70));
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 'enroll-1' });
      mockPrisma.quizAttempt.count.mockResolvedValue(0);
      mockPrisma.quizAttempt.create.mockResolvedValue({ id: 'attempt-1' });

      const dto = { answers: [{ questionId: 'q-1', optionIds: ['o-wrong'] }] };
      await service.submit('student-1', 'quiz-1', dto);
      expect(mockProgressService.markComplete).not.toHaveBeenCalled();
    });
  });
});
