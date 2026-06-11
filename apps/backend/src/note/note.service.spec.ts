import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { NoteService } from './note.service';
import { PrismaService } from '../prisma/prisma.service';
import { PositionType } from './dto/create-note.dto';

const mockPrisma = {
  lesson: { findUnique: jest.fn() },
  enrollment: { findFirst: jest.fn() },
  note: {
    create: jest.fn(),
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
};

const lessonWithSection = { id: 'lesson-1', section: { courseId: 'course-1' } };

describe('NoteService', () => {
  let service: NoteService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NoteService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<NoteService>(NoteService);
    jest.clearAllMocks();
  });

  describe('createNote', () => {
    it('throws BadRequestException for video_timestamp with negative positionValue', async () => {
      const dto = {
        lessonId: 'lesson-1',
        content: 'test',
        positionType: PositionType.VIDEO_TIMESTAMP,
        positionValue: -1,
      };
      await expect(service.createNote('student-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws BadRequestException for document_page with positionValue = 0', async () => {
      const dto = {
        lessonId: 'lesson-1',
        content: 'test',
        positionType: PositionType.DOCUMENT_PAGE,
        positionValue: 0,
      };
      await expect(service.createNote('student-1', dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('throws NotFoundException when lesson not found', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(null);
      const dto = {
        lessonId: 'bad',
        content: 'test',
        positionType: PositionType.NONE,
        positionValue: 0,
      };
      await expect(service.createNote('student-1', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws ForbiddenException when not enrolled', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(lessonWithSection);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      const dto = {
        lessonId: 'lesson-1',
        content: 'test',
        positionType: PositionType.NONE,
        positionValue: 0,
      };
      await expect(service.createNote('student-1', dto)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('creates note successfully when enrolled', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(lessonWithSection);
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 'enroll-1' });
      const created = { id: 'note-1', content: 'test', positionValue: 155 };
      mockPrisma.note.create.mockResolvedValue(created);
      const dto = {
        lessonId: 'lesson-1',
        content: 'test',
        positionType: PositionType.VIDEO_TIMESTAMP,
        positionValue: 155,
      };
      const result = await service.createNote('student-1', dto);
      expect(result).toEqual(created);
    });
  });

  describe('getNotesByLesson', () => {
    it('only returns notes for the requesting student', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(lessonWithSection);
      mockPrisma.enrollment.findFirst.mockResolvedValue({ id: 'enroll-1' });
      const notes = [{ id: 'note-1', studentId: 'student-1' }];
      mockPrisma.note.findMany.mockResolvedValue(notes);

      const result = await service.getNotesByLesson('student-1', 'lesson-1');
      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ studentId: 'student-1' }),
        }),
      );
      expect(result).toEqual(notes);
    });

    it('throws ForbiddenException for student-2 when not enrolled', async () => {
      mockPrisma.lesson.findUnique.mockResolvedValue(lessonWithSection);
      mockPrisma.enrollment.findFirst.mockResolvedValue(null);
      await expect(
        service.getNotesByLesson('student-2', 'lesson-1'),
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('updateNote', () => {
    it('throws ForbiddenException when note belongs to different student', async () => {
      mockPrisma.note.findUnique.mockResolvedValue({
        id: 'note-1',
        studentId: 'student-1',
      });
      await expect(
        service.updateNote('note-1', 'student-2', { content: 'new' }),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
