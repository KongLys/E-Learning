import { Body, Controller, Get, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { InstructorApplicationService } from './instructor-application.service';
import { ApplyInstructorDto } from './dto/apply-instructor.dto';

/** Học viên: gửi đơn và xem trạng thái đơn của mình. */
@Controller('instructor-applications')
@Roles('student')
export class InstructorApplicationController {
  constructor(private service: InstructorApplicationService) {}

  @Post()
  apply(
    @CurrentUser() user: { userId: string },
    @Body() dto: ApplyInstructorDto,
  ) {
    return this.service.apply(user.userId, dto);
  }

  @Get('me')
  getMine(@CurrentUser() user: { userId: string }) {
    return this.service.getMine(user.userId);
  }
}
