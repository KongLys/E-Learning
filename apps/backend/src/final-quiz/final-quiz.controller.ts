import { Body, Controller, Param, Patch } from '@nestjs/common';
import { FinalQuizService } from './final-quiz.service';
import { ToggleFinalQuizDto } from './dto/toggle-final-quiz.dto';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('courses')
export class FinalQuizController {
  constructor(private finalQuiz: FinalQuizService) {}

  /** Giảng viên bật/tắt bài kiểm tra cuối khóa của khóa học. */
  @Roles('instructor', 'admin')
  @Patch(':id/final-quiz')
  toggle(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: ToggleFinalQuizDto,
  ) {
    return this.finalQuiz.setEnabled(id, dto.enabled, user.userId, user.role);
  }
}
