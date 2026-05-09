import { Body, Controller, Patch, Post } from '@nestjs/common';
import { ProgressService } from './progress.service';
import { UpdateProgressDto } from './dto/update-progress.dto';
import { CompleteLessonDto } from './dto/complete-lesson.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('progress')
export class ProgressController {
  constructor(private progressService: ProgressService) {}

  @Patch()
  updateProgress(
    @CurrentUser() u: { userId: string },
    @Body() dto: UpdateProgressDto,
  ) {
    return this.progressService.updateProgress(u.userId, dto);
  }

  @Post('complete')
  markComplete(
    @CurrentUser() u: { userId: string },
    @Body() dto: CompleteLessonDto,
  ) {
    return this.progressService.markComplete(u.userId, dto.lessonId);
  }
}
