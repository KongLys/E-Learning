import { Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ModerationService } from './moderation.service';
import { AppealDto } from './dto/appeal.dto';

/** Instructor-facing appeal endpoints for rejected content. */
@Controller()
export class ModerationController {
  constructor(private moderation: ModerationService) {}

  @HttpCode(200)
  @Post('courses/:id/moderation/appeal')
  appealCourse(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: AppealDto,
  ) {
    return this.moderation.appealCourse(id, user.userId, user.role, dto.reason);
  }

  @HttpCode(200)
  @Post('courses/:courseId/materials/:materialId/moderation/appeal')
  appealMaterial(
    @CurrentUser() user: { userId: string; role: string },
    @Param('materialId') materialId: string,
    @Body() dto: AppealDto,
  ) {
    return this.moderation.appealMaterial(materialId, user.userId, user.role, dto.reason);
  }
}
