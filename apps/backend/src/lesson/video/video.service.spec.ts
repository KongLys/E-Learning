import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { VideoService } from './video.service';
import { PrismaService } from '../../prisma/prisma.service';
import { StorageService } from '../../storage/storage.service';
import { LessonService } from '../lesson.service';

jest.mock('fs', () => ({ ...jest.requireActual('fs'), createReadStream: jest.fn().mockReturnValue('stream') }));
jest.mock('fs/promises', () => ({ ...jest.requireActual('fs/promises'), unlink: jest.fn().mockResolvedValue(undefined) }));

const mockPrisma = {
  lesson: { findUnique: jest.fn(), update: jest.fn() },
  section: { findUnique: jest.fn() },
  videoAsset: { findUnique: jest.fn(), upsert: jest.fn() },
};

const mockStorage = {
  uploadFile: jest.fn(),
  deleteFile: jest.fn(),
  getSignedUrl: jest.fn(),
  extractKeyFromUrl: jest.fn().mockReturnValue('some/key'),
};

const mockLessonService = {
  isEnrolled: jest.fn(),
  updateCourseStats: jest.fn(),
};

describe('VideoService', () => {
  let service: VideoService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorage },
        { provide: LessonService, useValue: mockLessonService },
      ],
    }).compile();

    service = module.get<VideoService>(VideoService);
    jest.clearAllMocks();
  });

  describe('uploadVideo', () => {
    const validFile = { mimetype: 'video/mp4', size: 1024, path: '/tmp/upload-123' } as Express.Multer.File;
    const lesson = { id: 'lesson-1', sectionId: 'section-1', type: 'video' };
    const section = { course: { instructorId: 'instructor-1' } };

    it('throws BadRequestException for non-video mimetype', async () => {
      const file = { mimetype: 'image/png', size: 1024 } as Express.Multer.File;
      await expect(service.uploadVideo('lesson-1', 'instructor-1', 'instructor', file))
        .rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when file exceeds 2GB', async () => {
      const file = { mimetype: 'video/mp4', size: 3 * 1024 * 1024 * 1024 } as Express.Multer.File;
      await expect(service.uploadVideo('lesson-1', 'instructor-1', 'instructor', file))
        .rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when lesson not found', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(null);
      await expect(service.uploadVideo('lesson-1', 'instructor-1', 'instructor', validFile))
        .rejects.toThrow(NotFoundException);
    });

    it('throws BadRequestException when lesson is not video type', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({ ...lesson, type: 'document' });
      await expect(service.uploadVideo('lesson-1', 'instructor-1', 'instructor', validFile))
        .rejects.toThrow(BadRequestException);
    });

    it('throws ForbiddenException when not the instructor', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(lesson);
      mockPrisma.section.findUnique.mockResolvedValue({ course: { instructorId: 'other' } });
      await expect(service.uploadVideo('lesson-1', 'user-2', 'instructor', validFile))
        .rejects.toThrow(ForbiddenException);
    });

    it('uploads video and returns asset', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(lesson);
      mockPrisma.section.findUnique.mockResolvedValue(section);
      mockPrisma.videoAsset.findUnique.mockResolvedValue(null);
      mockStorage.uploadFile.mockResolvedValue('http://minio/videos/lesson-1/uuid.mp4');
      const asset = { id: 'asset-1', lessonId: 'lesson-1', videoUrl: 'http://minio/...', durationSec: null };
      mockPrisma.videoAsset.upsert.mockResolvedValue(asset);
      mockPrisma.lesson.update.mockResolvedValue({});

      const result = await service.uploadVideo('lesson-1', 'instructor-1', 'instructor', validFile);
      expect(result).toEqual(asset);
      expect(mockStorage.uploadFile).toHaveBeenCalled();
    });
  });

  describe('getSignedVideoUrl', () => {
    it('throws NotFoundException when lesson not found', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(null);
      await expect(service.getSignedVideoUrl('lesson-1', 'user-1'))
        .rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException when not enrolled and not preview', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: 'lesson-1',
        isPreview: false,
        videoAsset: { videoUrl: 'http://...' },
        section: { courseId: 'course-1', course: { instructorId: 'instructor-1' } },
      });
      mockLessonService.isEnrolled.mockResolvedValue(false);
      await expect(service.getSignedVideoUrl('lesson-1', 'student-1'))
        .rejects.toThrow(ForbiddenException);
    });

    it('returns public url for preview lessons', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue({
        id: 'lesson-1',
        isPreview: true,
        videoAsset: { videoUrl: 'http://minio/public/video.mp4' },
        section: { courseId: 'course-1', course: { instructorId: 'instructor-1' } },
      });
      const result = await service.getSignedVideoUrl('lesson-1', 'anyone');
      expect(result).toEqual({ url: 'http://minio/public/video.mp4' });
    });
  });
});
