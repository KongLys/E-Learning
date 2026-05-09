import { Module } from '@nestjs/common';
import { LessonController } from './lesson.controller';
import { LessonService } from './lesson.service';
import { VideoService } from './video/video.service';
import { DocumentService } from './document/document.service';
import { QuizService } from './quiz/quiz.service';

@Module({
  controllers: [LessonController],
  providers: [LessonService, VideoService, DocumentService, QuizService],
  exports: [LessonService],
})
export class LessonModule {}
