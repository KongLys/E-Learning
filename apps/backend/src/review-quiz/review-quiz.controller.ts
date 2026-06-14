import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ReviewQuizService } from './review-quiz.service';
import { SubmitReviewAttemptDto } from './dto/submit-review-attempt.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('lessons')
export class ReviewQuizController {
  constructor(private reviewQuizService: ReviewQuizService) {}

  @Get(':id/review-quiz')
  get(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.reviewQuizService.getReviewQuiz(id, u.userId, u.role);
  }

  @Post(':id/review-quiz')
  generate(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.reviewQuizService.generate(id, u.userId, u.role);
  }

  @Post(':id/review-quiz/attempts')
  submit(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: SubmitReviewAttemptDto,
  ) {
    return this.reviewQuizService.submit(id, u.userId, u.role, dto);
  }
}
