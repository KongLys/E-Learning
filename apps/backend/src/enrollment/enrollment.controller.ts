import { Body, Controller, Get, Param } from '@nestjs/common';
import { Post } from '@nestjs/common';
import { EnrollmentService } from './enrollment.service';
import { CreateEnrollmentDto } from './dto/create-enrollment.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('enrollments')
export class EnrollmentController {
  constructor(private enrollmentService: EnrollmentService) {}

  @Post()
  enroll(
    @CurrentUser() u: { userId: string; role: string },
    @Body() dto: CreateEnrollmentDto,
  ) {
    return this.enrollmentService.enroll(u.userId, u.role, dto.courseId);
  }

  @Get('my-courses')
  getMyEnrollments(@CurrentUser() u: { userId: string }) {
    return this.enrollmentService.getMyEnrollments(u.userId);
  }

  @Get(':courseId/progress')
  getProgress(
    @CurrentUser() u: { userId: string },
    @Param('courseId') courseId: string,
  ) {
    return this.enrollmentService.getEnrollmentProgress(u.userId, courseId);
  }
}
