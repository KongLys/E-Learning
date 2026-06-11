import { Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { MindmapService } from './mindmap.service';

@Controller('courses/:courseId')
export class MindmapController {
  constructor(private mindmap: MindmapService) {}

  /** Trigger (or reuse cached) course-wide mind-map generation. */
  @HttpCode(200)
  @Post('mindmap')
  generate(
    @CurrentUser() user: { userId: string },
    @Param('courseId') courseId: string,
    @Query('force') force?: string,
  ) {
    return this.mindmap.requestMindmap(
      courseId,
      user.userId,
      force === 'true' || force === '1',
    );
  }

  /** Fetch the current mind map (frontend polls while status=generating). */
  @Get('mindmap')
  get(
    @CurrentUser() user: { userId: string },
    @Param('courseId') courseId: string,
  ) {
    return this.mindmap.getMindmap(courseId, user.userId);
  }
}
