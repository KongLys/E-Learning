import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ReviewQuizService } from './review-quiz.service';
import { SubmitReviewAttemptDto } from './dto/submit-review-attempt.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('courses')
export class ReviewQuizCourseController {
  constructor(private reviewQuizService: ReviewQuizService) {}

  /** Danh sách quiz ôn tập (theo bài) đã tạo trong khoá — để xem lại/làm lại. */
  @Get(':courseId/review-quizzes')
  list(
    @CurrentUser() u: { userId: string; role: string },
    @Param('courseId') courseId: string,
  ) {
    return this.reviewQuizService.listByCourse(courseId, u.userId, u.role);
  }
}

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
