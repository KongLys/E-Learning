import { Module } from '@nestjs/common';
import { CourseController } from './course.controller';
import { AdminCourseController } from './admin-course.controller';
import { CourseService } from './course.service';

@Module({
  controllers: [CourseController, AdminCourseController],
  providers: [CourseService],
  exports: [CourseService],
})
export class CourseModule {}
