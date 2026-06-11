import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QuizService } from './quiz.service';
import { PrismaService } from '../../prisma/prisma.service';

const mockPrisma = {
  lesson: { findUnique: jest.fn() },
  quizLesson: { findUnique: jest.fn(), upsert: jest.fn() },
  quizQuestion: {
    create: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  quizOption: { deleteMany: jest.fn() },
};

const lessonWithCourse = (instructorId = 'instructor-1') => ({
  id: 'lesson-1',
  sectionId: 'section-1',
  section: { course: { instructorId } },
});

describe('QuizService', () => {
  let service: QuizService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuizService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<QuizService>(QuizService);
    jest.clearAllMocks();
  });

  describe('addQuestion', () => {
    const quiz = { id: 'quiz-1', lessonId: 'lesson-1' };

    it('throws NotFoundException when lesson not found', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(null);
      await expect(
        service.addQuestion('lesson-1', 'user-1', 'instructor', {} as any),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when not the course instructor', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(
        lessonWithCourse('other-instructor'),
      );
      await expect(
        service.addQuestion('lesson-1', 'user-1', 'instructor', {} as any),
      ).rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when quiz not configured', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(
        lessonWithCourse('instructor-1'),
      );
      mockPrisma.quizLesson.findUnique.mockResolvedValue(null);
      await expect(
        service.addQuestion(
          'lesson-1',
          'instructor-1',
          'instructor',
          {} as any,
        ),
      ).rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException for single-choice with 2 correct answers', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(
        lessonWithCourse('instructor-1'),
      );
      mockPrisma.quizLesson.findUnique.mockResolvedValue(quiz);
      const dto = {
        content: 'Q?',
        questionType: 'single',
        orderIndex: 1,
        options: [
          { content: 'A', isCorrect: true, orderIndex: 1 },
          { content: 'B', isCorrect: true, orderIndex: 2 },
        ],
      };
      await expect(
        service.addQuestion(
          'lesson-1',
          'instructor-1',
          'instructor',
          dto as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for multiple-choice with only 1 correct answer', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(
        lessonWithCourse('instructor-1'),
      );
      mockPrisma.quizLesson.findUnique.mockResolvedValue(quiz);
      const dto = {
        content: 'Q?',
        questionType: 'multiple',
        orderIndex: 1,
        options: [
          { content: 'A', isCorrect: true, orderIndex: 1 },
          { content: 'B', isCorrect: false, orderIndex: 2 },
        ],
      };
      await expect(
        service.addQuestion(
          'lesson-1',
          'instructor-1',
          'instructor',
          dto as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException for true_false with 3 options', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(
        lessonWithCourse('instructor-1'),
      );
      mockPrisma.quizLesson.findUnique.mockResolvedValue(quiz);
      const dto = {
        content: 'Q?',
        questionType: 'true_false',
        orderIndex: 1,
        options: [
          { content: 'True', isCorrect: true, orderIndex: 1 },
          { content: 'False', isCorrect: false, orderIndex: 2 },
          { content: 'Maybe', isCorrect: false, orderIndex: 3 },
        ],
      };
      await expect(
        service.addQuestion(
          'lesson-1',
          'instructor-1',
          'instructor',
          dto as any,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('creates question successfully for valid single-choice dto', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(
        lessonWithCourse('instructor-1'),
      );
      mockPrisma.quizLesson.findUnique.mockResolvedValue(quiz);
      const createdQuestion = { id: 'q-1', content: 'Q?', options: [] };
      mockPrisma.quizQuestion.create.mockResolvedValue(createdQuestion);
      const dto = {
        content: 'Q?',
        questionType: 'single',
        orderIndex: 1,
        options: [
          { content: 'A', isCorrect: true, orderIndex: 1 },
          { content: 'B', isCorrect: false, orderIndex: 2 },
        ],
      };
      const result = await service.addQuestion(
        'lesson-1',
        'instructor-1',
        'instructor',
        dto as any,
      );
      expect(result).toEqual(createdQuestion);
    });
  });

  describe('getQuiz', () => {
    it('throws NotFoundException when quiz not found', async () => {
      mockPrisma.quizLesson.findUnique.mockResolvedValue(null);
      await expect(
        service.getQuiz('lesson-1', 'user-1', 'student'),
      ).rejects.toThrow(NotFoundException);
    });

    it('hides isCorrect for non-instructor users', async () => {
      const quiz = {
        id: 'quiz-1',
        questions: [
          {
            id: 'q-1',
            options: [
              { id: 'o-1', isCorrect: true },
              { id: 'o-2', isCorrect: false },
            ],
          },
        ],
      };
      mockPrisma.quizLesson.findUnique.mockResolvedValue(quiz);
      mockPrisma.lesson.findUnique.mockResolvedValue(
        lessonWithCourse('instructor-1'),
      );

      const result = await service.getQuiz('lesson-1', 'student-1', 'student');
      expect(
        result.questions[0].options.every((o) => o.isCorrect === false),
      ).toBe(true);
    });

    it('returns isCorrect for instructor', async () => {
      const quiz = {
        id: 'quiz-1',
        questions: [
          {
            id: 'q-1',
            options: [
              { id: 'o-1', isCorrect: true },
              { id: 'o-2', isCorrect: false },
            ],
          },
        ],
      };
      mockPrisma.quizLesson.findUnique.mockResolvedValue(quiz);
      mockPrisma.lesson.findUnique.mockResolvedValue(
        lessonWithCourse('instructor-1'),
      );

      const result = await service.getQuiz(
        'lesson-1',
        'instructor-1',
        'instructor',
      );
      expect(result.questions[0].options[0].isCorrect).toBe(true);
    });
  });
});
