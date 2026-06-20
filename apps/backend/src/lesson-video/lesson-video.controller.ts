import { Controller, Get, Param } from '@nestjs/common';
import { LessonVideoService } from './lesson-video.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('lessons')
export class LessonVideoController {
  constructor(private lessonVideo: LessonVideoService) {}

  /** Video ngắn do AI tạo của bài đọc — tùy chọn xem. */
  @Get(':id/ai-video')
  get(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.lessonVideo.getVideo(id, u.userId, u.role);
  }
}
