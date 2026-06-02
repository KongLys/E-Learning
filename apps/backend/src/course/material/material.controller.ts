import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { MaterialService } from './material.service';

@Controller('courses/:courseId/materials')
export class MaterialController {
  constructor(private materialService: MaterialService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(
    @CurrentUser() user: { userId: string; role: string },
    @Param('courseId') courseId: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.materialService.uploadMaterial(courseId, user.userId, user.role, file);
  }

  @Get()
  list(@CurrentUser() user: { userId: string; role: string }, @Param('courseId') courseId: string) {
    return this.materialService.listMaterials(courseId, user.userId, user.role);
  }

  @Delete(':materialId')
  remove(
    @CurrentUser() user: { userId: string; role: string },
    @Param('courseId') courseId: string,
    @Param('materialId') materialId: string,
  ) {
    return this.materialService.deleteMaterial(courseId, materialId, user.userId, user.role);
  }

  @HttpCode(200)
  @Post(':materialId/retry')
  retry(
    @CurrentUser() user: { userId: string; role: string },
    @Param('courseId') courseId: string,
    @Param('materialId') materialId: string,
  ) {
    return this.materialService.retryMaterial(courseId, materialId, user.userId, user.role);
  }
}
