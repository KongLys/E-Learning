import { Module } from '@nestjs/common';
import { CourseController } from './course.controller';
import { AdminCourseController } from './admin-course.controller';
import { CourseService } from './course.service';
import { AiModule } from '../ai/ai.module';
import { ModerationModule } from '../moderation/moderation.module';
import { FinalQuizModule } from '../final-quiz/final-quiz.module';

@Module({
  imports: [AiModule, ModerationModule, FinalQuizModule],
  controllers: [CourseController, AdminCourseController],
  providers: [CourseService],
  exports: [CourseService],
})
export class CourseModule {}
