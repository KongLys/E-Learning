import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { getQueueToken } from '@nestjs/bullmq';
import { CourseService } from './course.service';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { ModerationService } from '../moderation/moderation.service';
import { FinalQuizService } from '../final-quiz/final-quiz.service';
import { RaptorService } from '../ai/raptor/raptor.service';
import { LESSON_INDEX_QUEUE } from '../ai/processors/lesson-index.processor';
import { VIDEO_TRANSCRIBE_QUEUE } from '../ai/processors/video-transcribe.processor';

const mockPrisma = {
  course: {
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    findMany: jest.fn(),
    count: jest.fn(),
  },
  section: { count: jest.fn() },
  lesson: { count: jest.fn(), findMany: jest.fn().mockResolvedValue([]) },
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
const mockRaptor = { enqueueBuild: jest.fn() };
const mockLessonIndexQueue = { add: jest.fn() };
const mockVideoTranscribeQueue = { add: jest.fn() };

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
        { provide: RaptorService, useValue: mockRaptor },
        {
          provide: getQueueToken(LESSON_INDEX_QUEUE),
          useValue: mockLessonIndexQueue,
        },
        {
          provide: getQueueToken(VIDEO_TRANSCRIBE_QUEUE),
          useValue: mockVideoTranscribeQueue,
        },
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
