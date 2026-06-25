import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { InstructorApplicationService } from './instructor-application.service';
import { RejectApplicationDto } from './dto/reject-application.dto';

/** Admin: xét duyệt đơn đăng ký làm giảng viên. */
@Controller('admin/instructor-applications')
@Roles('admin')
export class AdminInstructorApplicationController {
  constructor(private service: InstructorApplicationService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.service.listForReview({ status });
  }

  @HttpCode(200)
  @Post(':id/approve')
  approve(
    @CurrentUser() admin: { userId: string },
    @Param('id') id: string,
  ) {
    return this.service.approve(id, admin.userId);
  }

  @HttpCode(200)
  @Post(':id/reject')
  reject(
    @CurrentUser() admin: { userId: string },
    @Param('id') id: string,
    @Body() dto: RejectApplicationDto,
  ) {
    return this.service.reject(id, admin.userId, dto.reason);
  }
}
