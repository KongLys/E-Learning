import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ProgressService } from './progress.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  lesson: { findUnique: jest.fn(), count: jest.fn() },
  enrollment: { findFirst: jest.fn(), update: jest.fn() },
  lessonProgress: { upsert: jest.fn(), count: jest.fn() },
};

describe('ProgressService', () => {
  let service: ProgressService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProgressService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<ProgressService>(ProgressService);
    jest.clearAllMocks();
  });

  describe('recalculateProgress', () => {
    it('calculates 50% when 3 of 6 lessons completed', async () => {
      mockPrisma.lesson.count.mockResolvedValue(6);
      mockPrisma.lessonProgress.count.mockResolvedValue(3);
      mockPrisma.enrollment.update.mockResolvedValue({ progressPercent: 50, status: 'active' });

      await service.recalculateProgress('enroll-1', 'course-1');
      expect(mockPrisma.enrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ progressPercent: 50, status: 'active' }) }),
      );
    });

    it('sets status to completed when 100% progress', async () => {
      mockPrisma.lesson.count.mockResolvedValue(4);
      mockPrisma.lessonProgress.count.mockResolvedValue(4);
      mockPrisma.enrollment.update.mockResolvedValue({ progressPercent: 100, status: 'completed' });

      await service.recalculateProgress('enroll-1', 'course-1');
      expect(mockPrisma.enrollment.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'completed' }) }),
      );
    });
  });

  describe('markComplete', () => {
    it('throws NotFoundException when lesson not found', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(null);
      await expect(service.markComplete('student-1', 'lesson-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when not enrolled', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: 'lesson-1', section: { courseId: 'course-1' },
      });
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      await expect(service.markComplete('student-1', 'lesson-1'))
        .rejects.toThrow(ForbiddenException);
    });
  });
});
