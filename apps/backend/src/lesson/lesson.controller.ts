import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import type { Express } from 'express';
import { LessonService } from './lesson.service';
import { VideoService } from './video/video.service';
import { DocumentService } from './document/document.service';
import { QuizService } from './quiz/quiz.service';
import { CreateLessonDto } from './dto/create-lesson.dto';
import { UpdateLessonDto } from './dto/update-lesson.dto';
import { QuizConfigDto } from './dto/quiz-config.dto';
import { CreateQuestionDto } from './dto/create-question.dto';
import { DocumentConfigDto } from './dto/document-config.dto';
import { VideoConfigDto } from './dto/video-config.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

// Disk-backed multer storage: large uploads stream to a temp file instead of
// being buffered whole in RAM (the service then streams the temp file to R2).
const VIDEO_UPLOAD = {
  storage: diskStorage({ destination: tmpdir() }),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 },
};
const DOCUMENT_UPLOAD = {
  storage: diskStorage({ destination: tmpdir() }),
  limits: { fileSize: 100 * 1024 * 1024 },
};

@Controller()
export class LessonController {
  constructor(
    private lessonService: LessonService,
    private videoService: VideoService,
    private documentService: DocumentService,
    private quizService: QuizService,
  ) {}

  // Admin: re-index toàn bộ bài học (áp chunker mới cho dữ liệu cũ)
  @Post('admin/lessons/reindex')
  @Roles('admin')
  reindexAllLessons() {
    return this.lessonService.reindexAllLessons();
  }

  // Lesson CRUD
  @Post('sections/:sectionId/lessons')
  createLesson(
    @CurrentUser() u: { userId: string; role: string },
    @Param('sectionId') sectionId: string,
    @Body() dto: CreateLessonDto,
  ) {
    return this.lessonService.createLesson(sectionId, u.userId, u.role, dto);
  }

  @Patch('sections/:sectionId/lessons/reorder')
  reorderLessons(
    @CurrentUser() u: { userId: string; role: string },
    @Param('sectionId') sectionId: string,
    @Body() body: { lessonIds: string[] },
  ) {
    return this.lessonService.reorderLessons(
      sectionId,
      u.userId,
      u.role,
      body.lessonIds,
    );
  }

  @Patch('lessons/:id')
  updateLesson(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: UpdateLessonDto,
  ) {
    return this.lessonService.updateLesson(id, u.userId, u.role, dto);
  }

  @Delete('lessons/:id')
  deleteLesson(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.lessonService.deleteLesson(id, u.userId, u.role);
  }

  @Get('lessons/:id')
  getLesson(@CurrentUser() u: { userId: string; role: string }, @Param('id') id: string) {
    return this.lessonService.getLesson(id, u.userId, u.role);
  }

  // Video
  @Post('lessons/:id/video')
  @UseInterceptors(FileInterceptor('video', VIDEO_UPLOAD))
  uploadVideo(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.videoService.uploadVideo(id, u.userId, u.role, file);
  }

  @Delete('lessons/:id/video')
  deleteVideo(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.videoService.deleteVideo(id, u.userId, u.role);
  }

  @Get('lessons/:id/video-url')
  getVideoUrl(@CurrentUser() u: { userId: string; role: string }, @Param('id') id: string) {
    return this.videoService.getSignedVideoUrl(id, u.userId, u.role);
  }

  @Get('lessons/:id/transcript')
  getTranscript(@CurrentUser() u: { userId: string; role: string }, @Param('id') id: string) {
    return this.videoService.getTranscript(id, u.userId, u.role);
  }

  @Post('lessons/:id/video/config')
  configVideo(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: VideoConfigDto,
  ) {
    return this.videoService.configVideo(id, u.userId, u.role, dto);
  }

  // Document
  @Post('lessons/:id/document')
  @UseInterceptors(FileInterceptor('document', DOCUMENT_UPLOAD))
  uploadDocument(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.documentService.uploadDocument(id, u.userId, u.role, file);
  }

  @Delete('lessons/:id/document')
  deleteDocument(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.documentService.deleteDocument(id, u.userId, u.role);
  }

  @Get('lessons/:id/document-url')
  getDocumentUrl(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.documentService.getSignedDocumentUrl(id, u.userId, u.role);
  }

  @Post('lessons/:id/document/config')
  configDocument(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: DocumentConfigDto,
  ) {
    return this.documentService.configDocument(id, u.userId, u.role, dto);
  }

  // Quiz
  @Post('lessons/:id/quiz/config')
  configQuiz(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: QuizConfigDto,
  ) {
    return this.quizService.configQuiz(id, u.userId, u.role, dto);
  }

  @Public()
  @Get('lessons/:id/quiz')
  getQuiz(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.quizService.getQuiz(id, u?.userId, u?.role);
  }

  @Post('lessons/:id/quiz/questions')
  addQuestion(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.quizService.addQuestion(id, u.userId, u.role, dto);
  }

  @Patch('quiz/questions/:questionId')
  updateQuestion(
    @CurrentUser() u: { userId: string; role: string },
    @Param('questionId') qId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.quizService.updateQuestion(qId, u.userId, u.role, dto);
  }

  @Delete('quiz/questions/:questionId')
  deleteQuestion(
    @CurrentUser() u: { userId: string; role: string },
    @Param('questionId') qId: string,
  ) {
    return this.quizService.deleteQuestion(qId, u.userId, u.role);
  }
}
