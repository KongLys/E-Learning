import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { tmpdir } from 'os';
import type { Express } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ReferenceMaterialService } from './reference-material.service';
import { CreateReferenceMaterialDto } from './dto/create-reference-material.dto';

// Disk-backed multer: video tham khảo có thể lớn → stream qua temp file.
const REFERENCE_UPLOAD = {
  storage: diskStorage({ destination: tmpdir() }),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
};

@Controller()
export class ReferenceMaterialController {
  constructor(private service: ReferenceMaterialService) {}

  @Post('courses/:courseId/reference-materials')
  @UseInterceptors(FileInterceptor('file', REFERENCE_UPLOAD))
  create(
    @CurrentUser() u: { userId: string; role: string },
    @Param('courseId') courseId: string,
    @Body() dto: CreateReferenceMaterialDto,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    return this.service.create(courseId, u.userId, u.role, dto, file);
  }

  @Get('courses/:courseId/reference-materials')
  list(
    @CurrentUser() u: { userId: string; role: string },
    @Param('courseId') courseId: string,
  ) {
    return this.service.list(courseId, u.userId, u.role);
  }

  @Get('courses/:courseId/lesson-files')
  lessonFiles(
    @CurrentUser() u: { userId: string; role: string },
    @Param('courseId') courseId: string,
  ) {
    return this.service.lessonFiles(courseId, u.userId, u.role);
  }

  @Get('reference-materials/:id/url')
  getUrl(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.service.getUrl(id, u.userId, u.role);
  }

  @Delete('reference-materials/:id')
  remove(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.service.remove(id, u.userId, u.role);
  }
}
