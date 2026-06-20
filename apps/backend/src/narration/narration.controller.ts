import { Controller, Get, Param } from '@nestjs/common';
import { NarrationService } from './narration.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('lessons')
export class NarrationController {
  constructor(private narrationService: NarrationService) {}

  /** Giọng đọc (TTS) tự sinh của bài — học viên/giảng viên/admin có quyền truy cập. */
  @Get(':id/narration')
  get(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.narrationService.getNarration(id, u.userId, u.role);
  }
}
