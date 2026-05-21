import { ConflictException, ForbiddenException, HttpException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { EnrollmentService } from './enrollment.service';
import { PrismaService } from '../prisma/prisma.service';

const mockPrisma = {
  course: { findUnique: jest.fn() },
  enrollment: { findFirst: jest.fn(), create: jest.fn(), findMany: jest.fn() },
};

const publishedFreeCourse = { id: 'course-1', status: 'published', price: 0 };
const publishedPaidCourse = { id: 'course-2', status: 'published', price: 100000 };

describe('EnrollmentService', () => {
  let service: EnrollmentService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrollmentService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<EnrollmentService>(EnrollmentService);
    jest.clearAllMocks();
  });

  describe('enroll', () => {
    it('throws ForbiddenException for instructor role', async () => {
      await expect(service.enroll('user-1', 'instructor', 'course-1'))
        .rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException for admin role', async () => {
      await expect(service.enroll('user-1', 'admin', 'course-1'))
        .rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when course not found', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(null);
      await expect(service.enroll('student-1', 'student', 'bad-course'))
        .rejects.toThrow(NotFoundException);
    });

    it('throws ConflictException when already enrolled', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(publishedFreeCourse);
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 'enroll-1' });
      await expect(service.enroll('student-1', 'student', 'course-1'))
        .rejects.toThrow(ConflictException);
    });

    it('throws 402 for paid course without payment', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(publishedPaidCourse);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      await expect(service.enroll('student-1', 'student', 'course-2'))
        .rejects.toThrow(HttpException);
    });

    it('creates enrollment for free course', async () => {
      mockPrisma.course.findUnique.mockResolvedValue(publishedFreeCourse);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      mockPrisma.enrollment.create.mockResolvedValue({ id: 'enroll-1', courseId: 'course-1', status: 'active' });

      const result = await service.enroll('student-1', 'student', 'course-1');
      expect(result.status).toBe('active');
      expect(mockPrisma.enrollment.create).toHaveBeenCalled();
    });
  });
});
