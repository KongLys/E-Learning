import {
  Body,
  Controller,
  Get,
  Post,
  UploadedFiles,
  UseInterceptors,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { InstructorApplicationService } from './instructor-application.service';
import { ApplyInstructorDto } from './dto/apply-instructor.dto';

// Bằng cấp: tối đa 5 file, mỗi file 10MB (ảnh/PDF) — đệm trong RAM rồi đẩy lên storage.
const CREDENTIAL_UPLOAD = {
  limits: { fileSize: 10 * 1024 * 1024, files: 5 },
};

/** Học viên: gửi đơn và xem trạng thái đơn của mình. */
@Controller('instructor-applications')
@Roles('student')
export class InstructorApplicationController {
  constructor(private service: InstructorApplicationService) {}

  @Post()
  @UseInterceptors(FilesInterceptor('files', 5, CREDENTIAL_UPLOAD))
  apply(
    @CurrentUser() user: { userId: string },
    @Body() dto: ApplyInstructorDto,
    @UploadedFiles() files?: Express.Multer.File[],
  ) {
    return this.service.apply(user.userId, dto, files);
  }

  @Get('me')
  getMine(@CurrentUser() user: { userId: string }) {
    return this.service.getMine(user.userId);
  }
}
