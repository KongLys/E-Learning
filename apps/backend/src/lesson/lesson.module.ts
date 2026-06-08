import { Module } from '@nestjs/common';
import { LessonController } from './lesson.controller';
import { LessonService } from './lesson.service';
import { VideoService } from './video/video.service';
import { DocumentService } from './document/document.service';
import { QuizService } from './quiz/quiz.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [LessonController],
  providers: [LessonService, VideoService, DocumentService, QuizService],
  exports: [LessonService],
})
export class LessonModule {}
