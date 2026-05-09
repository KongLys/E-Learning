import { ForbiddenException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { QuickQuestionService } from './quick-question.service';
import { PrismaService } from '../prisma/prisma.service';
import { PositionType } from '../note/dto/create-note.dto';

const mockPrisma = {
  lesson: { findUnique: jest.fn() },
  enrollment: { findFirst: jest.fn() },
  course: { findUnique: jest.fn() },
  quickQuestion: { create: jest.fn(), findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn() },
  questionReply: { create: jest.fn() },
};

const makeQuestion = (overrides: Partial<any> = {}) => ({
  id: 'q-1',
  studentId: 'student-1',
  status: 'pending',
  isPublic: true,
  lesson: { section: { course: { instructorId: 'instructor-1' }, courseId: 'course-1' } },
  ...overrides,
});

describe('QuickQuestionService', () => {
  let service: QuickQuestionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuickQuestionService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<QuickQuestionService>(QuickQuestionService);
    jest.clearAllMocks();
  });

  describe('addReply', () => {
    it('throws ForbiddenException when student tries to reply', async () => {
      mockPrisma.quickQuestion.findUnique.mockResolvedValue(makeQuestion());
      await expect(service.addReply('q-1', 'student-2', 'student', { content: 'reply' }))
        .rejects.toThrow(ForbiddenException);
    });

    it('allows instructor to reply', async () => {
      mockPrisma.quickQuestion.findUnique.mockResolvedValue(makeQuestion());
      mockPrisma.questionReply.create.mockResolvedValue({ id: 'reply-1', content: 'reply' });
      mockPrisma.quickQuestion.update.mockResolvedValue({});

      const result = await service.addReply('q-1', 'instructor-1', 'instructor', { content: 'reply' });
      expect(result.id).toBe('reply-1');
      expect(mockPrisma.quickQuestion.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'answered' }) }),
      );
    });
  });

  describe('reopenQuestion', () => {
    it('throws UnprocessableEntityException when status is closed', async () => {
      mockPrisma.quickQuestion.findUnique.mockResolvedValue(makeQuestion({ status: 'closed', studentId: 'student-1' }));
      await expect(service.reopenQuestion('q-1', 'student-1')).rejects.toThrow(UnprocessableEntityException);
    });

    it('throws ForbiddenException when not the owner', async () => {
      mockPrisma.quickQuestion.findUnique.mockResolvedValue(makeQuestion({ status: 'answered' }));
      await expect(service.reopenQuestion('q-1', 'student-2')).rejects.toThrow(ForbiddenException);
    });

    it('reopens from answered status', async () => {
      mockPrisma.quickQuestion.findUnique.mockResolvedValue(makeQuestion({ status: 'answered', studentId: 'student-1' }));
      mockPrisma.quickQuestion.update.mockResolvedValue({ id: 'q-1', status: 'pending' });

      const result = await service.reopenQuestion('q-1', 'student-1');
      expect(result.status).toBe('pending');
    });
  });

  describe('closeQuestion', () => {
    it('throws NotFoundException when question not found', async () => {
      mockPrisma.quickQuestion.findUnique.mockResolvedValue(null);
      await expect(service.closeQuestion('q-1', 'student-1', 'student')).rejects.toThrow(NotFoundException);
    });

    it('allows owner to close', async () => {
      mockPrisma.quickQuestion.findUnique.mockResolvedValue(makeQuestion({ studentId: 'student-1' }));
      mockPrisma.quickQuestion.update.mockResolvedValue({ id: 'q-1', status: 'closed' });

      const result = await service.closeQuestion('q-1', 'student-1', 'student');
      expect(result.status).toBe('closed');
    });
  });
});
