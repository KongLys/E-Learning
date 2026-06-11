import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { CourseService } from './course.service';
import { RejectCourseDto } from './dto/approve-reject.dto';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin/courses')
@Roles('admin')
export class AdminCourseController {
  constructor(private courseService: CourseService) {}

  @Get()
  list(
    @Query('status') status?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.courseService.listAdminCourses({
      status,
      page: +page! || 1,
      limit: +limit! || 20,
    });
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string) {
    return this.courseService.approveCourse(id);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body() dto: RejectCourseDto) {
    return this.courseService.rejectCourse(id, dto.reason);
  }
}
