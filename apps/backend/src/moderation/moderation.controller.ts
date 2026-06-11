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
  @Post('lessons/:lessonId/moderation/appeal')
  appealLesson(
    @CurrentUser() user: { userId: string; role: string },
    @Param('lessonId') lessonId: string,
    @Body() dto: AppealDto,
  ) {
    return this.moderation.appealLesson(
      lessonId,
      user.userId,
      user.role,
      dto.reason,
    );
  }
}
