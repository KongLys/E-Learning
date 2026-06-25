import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { ChatQuizService } from './chat-quiz.service';
import { SubmitReviewAttemptDto } from '../../review-quiz/dto/submit-review-attempt.dto';

@Controller()
export class ChatQuizController {
  constructor(private chatQuiz: ChatQuizService) {}

  @Get('courses/:courseId/review-quizzes/mine')
  list(
    @CurrentUser() u: { userId: string },
    @Param('courseId') courseId: string,
  ) {
    return this.chatQuiz.listMine(courseId, u.userId);
  }

  @Get('review-quizzes/:id')
  get(@CurrentUser() u: { userId: string }, @Param('id') id: string) {
    return this.chatQuiz.getMine(id, u.userId);
  }

  @Post('review-quizzes/:id/attempts')
  submit(
    @CurrentUser() u: { userId: string },
    @Param('id') id: string,
    @Body() dto: SubmitReviewAttemptDto,
  ) {
    return this.chatQuiz.submit(id, u.userId, dto);
  }
}
