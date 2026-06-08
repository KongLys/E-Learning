import { Module } from '@nestjs/common';
import { CourseController } from './course.controller';
import { AdminCourseController } from './admin-course.controller';
import { CourseService } from './course.service';
import { MaterialController } from './material/material.controller';
import { MaterialService } from './material/material.service';
import { AiModule } from '../ai/ai.module';
import { ModerationModule } from '../moderation/moderation.module';

@Module({
  imports: [AiModule, ModerationModule],
  controllers: [CourseController, AdminCourseController, MaterialController],
  providers: [CourseService, MaterialService],
  exports: [CourseService],
})
export class CourseModule {}
