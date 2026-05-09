import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { NoteService } from './note.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller()
export class NoteController {
  constructor(private noteService: NoteService) {}

  @Post('notes')
  createNote(@CurrentUser() u: { userId: string }, @Body() dto: CreateNoteDto) {
    return this.noteService.createNote(u.userId, dto);
  }

  @Get('lessons/:lessonId/notes')
  getNotesByLesson(
    @CurrentUser() u: { userId: string },
    @Param('lessonId') lessonId: string,
  ) {
    return this.noteService.getNotesByLesson(u.userId, lessonId);
  }

  @Get('courses/:courseId/notes')
  getNotesByCourse(
    @CurrentUser() u: { userId: string },
    @Param('courseId') courseId: string,
  ) {
    return this.noteService.getNotesByCourse(u.userId, courseId);
  }

  @Patch('notes/:id')
  updateNote(
    @CurrentUser() u: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateNoteDto,
  ) {
    return this.noteService.updateNote(id, u.userId, dto);
  }

  @Delete('notes/:id')
  deleteNote(@CurrentUser() u: { userId: string }, @Param('id') id: string) {
    return this.noteService.deleteNote(id, u.userId);
  }
}
