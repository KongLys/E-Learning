import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { CourseService } from './course.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ModerationService } from '../moderation/moderation.service';
import { FinalQuizService } from '../final-quiz/final-quiz.service';

const mockPrisma = {
  course: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  section: { count: jest.fn() },
  lesson: { count: jest.fn() },
  documentAsset: { count: jest.fn() },
};
const mockStorage = {
  deleteFile: jest.fn(),
  uploadFile: jest.fn(),
  extractKeyFromUrl: jest.fn(),
};
const mockModeration = { moderateCourse: jest.fn() };
const mockFinalQuiz = { enqueueForCourse: jest.fn() };
const mockEvents = { emit: jest.fn() };

describe('CourseService', () => {
  let service: CourseService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CourseService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: ModerationService, useValue: mockModeration },
        { provide: FinalQuizService, useValue: mockFinalQuiz },
        { provide: EventEmitter2, useValue: mockEvents },
      ],
    }).compile();
    service = module.get<CourseService>(CourseService);
    jest.clearAllMocks();
  });

  describe('submitForReview', () => {
    it('throws when course has no sections', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        instructorId: 'u1',
        status: 'draft',
        moderationStatus: 'approved',
      });
      mockPrisma.section.count.mockResolvedValue(0);
      await expect(service.submitForReview('c1', 'u1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when course has no lessons', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        instructorId: 'u1',
        status: 'draft',
        moderationStatus: 'approved',
      });
      mockPrisma.section.count.mockResolvedValue(1);
      mockPrisma.lesson.count.mockResolvedValue(0);
      await expect(service.submitForReview('c1', 'u1')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws when status is not draft/rejected', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        instructorId: 'u1',
        status: 'published',
      });
      await expect(service.submitForReview('c1', 'u1')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('approveCourse', () => {
    it('throws when course is not pending', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        status: 'draft',
      });
      await expect(service.approveCourse('c1')).rejects.toThrow(
        UnprocessableEntityException,
      );
    });
  });

  describe('updateCourse', () => {
    it('throws ForbiddenException when instructor B edits course of instructor A', async () => {
      mockPrisma.course.findUnique.mockResolvedValue({
        id: 'c1',
        instructorId: 'instructorA',
        status: 'draft',
      });
      await expect(
        service.updateCourse('c1', 'instructorB', 'instructor', {
          title: 'hack',
        }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
