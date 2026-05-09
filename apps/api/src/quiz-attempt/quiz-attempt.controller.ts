import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { QuizAttemptService } from './quiz-attempt.service';
import { SubmitAttemptDto } from './dto/submit-attempt.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('quiz')
export class QuizAttemptController {
  constructor(private quizAttemptService: QuizAttemptService) {}

  @Post(':quizLessonId/attempts')
  submit(
    @CurrentUser() u: { userId: string },
    @Param('quizLessonId') quizLessonId: string,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.quizAttemptService.submit(u.userId, quizLessonId, dto);
  }

  @Get(':quizLessonId/attempts')
  getAttempts(
    @CurrentUser() u: { userId: string },
    @Param('quizLessonId') quizLessonId: string,
  ) {
    return this.quizAttemptService.getAttempts(u.userId, quizLessonId);
  }
}
