import {
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { MindmapService } from './mindmap.service';

@Controller('courses/:courseId')
export class MindmapController {
  constructor(private mindmap: MindmapService) {}

  /** Materials a learner can build a mind map from (parsed + approved). */
  @Get('mindmap/materials')
  listMaterials(
    @CurrentUser() user: { userId: string },
    @Param('courseId') courseId: string,
  ) {
    return this.mindmap.listMaterials(courseId, user.userId);
  }

  /** Trigger (or reuse cached) mind-map generation for one material. */
  @HttpCode(200)
  @Post('materials/:materialId/mindmap')
  generate(
    @CurrentUser() user: { userId: string },
    @Param('courseId') courseId: string,
    @Param('materialId') materialId: string,
    @Query('force') force?: string,
  ) {
    return this.mindmap.requestMindmap(
      courseId,
      materialId,
      user.userId,
      force === 'true' || force === '1',
    );
  }

  /** Fetch the current mind map (frontend polls while status=generating). */
  @Get('materials/:materialId/mindmap')
  get(
    @CurrentUser() user: { userId: string },
    @Param('courseId') courseId: string,
    @Param('materialId') materialId: string,
  ) {
    return this.mindmap.getMindmap(courseId, materialId, user.userId);
  }
}
