import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { COURSE_ACCESS_STATUSES } from '../common/enrollment-access.const';
import { CreateNoteDto, PositionType } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';

@Injectable()
export class NoteService {
  constructor(private prisma: PrismaService) {}

  async createNote(studentId: string, dto: CreateNoteDto) {
    this.validatePosition(dto.positionType, dto.positionValue);

    const lesson = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
      include: { section: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const enrolled = await this.prisma.enrollment.findFirst({
      where: {
        studentId,
        courseId: lesson.section.courseId,
        status: { in: COURSE_ACCESS_STATUSES },
      },
    });
    if (!enrolled) throw new ForbiddenException('Not enrolled in this course');

    return this.prisma.note.create({
      data: {
        studentId,
        lessonId: dto.lessonId,
        content: dto.content,
        positionType: dto.positionType,
        positionValue:
          dto.positionType === PositionType.NONE ? 0 : dto.positionValue,
      },
    });
  }

  async getNotesByLesson(studentId: string, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: { section: true },
    });
    if (!lesson) throw new NotFoundException('Lesson not found');

    const enrolled = await this.prisma.enrollment.findFirst({
      where: {
        studentId,
        courseId: lesson.section.courseId,
        status: { in: COURSE_ACCESS_STATUSES },
      },
    });
    if (!enrolled) throw new ForbiddenException('Not enrolled in this course');

    return this.prisma.note.findMany({
      where: { studentId, lessonId },
      orderBy: { positionValue: 'asc' },
    });
  }

  async getNotesByCourse(studentId: string, courseId: string) {
    const enrolled = await this.prisma.enrollment.findFirst({
      where: { studentId, courseId, status: { in: COURSE_ACCESS_STATUSES } },
    });
    if (!enrolled) throw new ForbiddenException('Not enrolled in this course');

    const notes = await this.prisma.note.findMany({
      where: { studentId, lesson: { section: { courseId } } },
      include: { lesson: { select: { id: true, title: true } } },
      orderBy: [{ lessonId: 'asc' }, { positionValue: 'asc' }],
    });

    const grouped: Record<
      string,
      { lesson: { id: string; title: string }; notes: typeof notes }
    > = {};
    for (const note of notes) {
      const key = note.lessonId;
      if (!grouped[key]) grouped[key] = { lesson: note.lesson, notes: [] };
      grouped[key].notes.push(note);
    }
    return Object.values(grouped);
  }

  async updateNote(noteId: string, studentId: string, dto: UpdateNoteDto) {
    const note = await this.prisma.note.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Note not found');
    if (note.studentId !== studentId)
      throw new ForbiddenException('Access denied');
    return this.prisma.note.update({
      where: { id: noteId },
      data: { content: dto.content },
    });
  }

  async deleteNote(noteId: string, studentId: string) {
    const note = await this.prisma.note.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Note not found');
    if (note.studentId !== studentId)
      throw new ForbiddenException('Access denied');
    await this.prisma.note.delete({ where: { id: noteId } });
    return { message: 'Note deleted' };
  }

  private validatePosition(positionType: PositionType, positionValue: number) {
    if (positionType === PositionType.VIDEO_TIMESTAMP && positionValue < 0) {
      throw new BadRequestException('Video timestamp position must be >= 0');
    }
    if (positionType === PositionType.DOCUMENT_PAGE && positionValue < 1) {
      throw new BadRequestException('Document page position must be >= 1');
    }
  }
}
