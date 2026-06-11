import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { CreateReviewDto } from './dto/create-review.dto';
import { ReportReviewDto } from './dto/report-review.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller()
export class ReviewController {
  constructor(private reviewService: ReviewService) {}

  @Public()
  @Get('courses/:courseId/reviews')
  list(
    @Param('courseId') courseId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.reviewService.listCourseReviews(courseId, {
      page: page ? +page : 1,
      limit: limit ? +limit : 10,
    });
  }

  @Get('courses/:courseId/reviews/mine')
  getMine(
    @Param('courseId') courseId: string,
    @CurrentUser() u: { userId: string },
  ) {
    return this.reviewService.getMyReview(courseId, u.userId);
  }

  @Post('courses/:courseId/reviews')
  upsert(
    @Param('courseId') courseId: string,
    @CurrentUser() u: { userId: string },
    @Body() dto: CreateReviewDto,
  ) {
    return this.reviewService.upsertReview(courseId, u.userId, dto);
  }

  @Delete('courses/:courseId/reviews/mine')
  deleteMine(
    @Param('courseId') courseId: string,
    @CurrentUser() u: { userId: string },
  ) {
    return this.reviewService.deleteMyReview(courseId, u.userId);
  }

  @Post('reviews/:reviewId/reports')
  report(
    @Param('reviewId') reviewId: string,
    @CurrentUser() u: { userId: string },
    @Body() dto: ReportReviewDto,
  ) {
    return this.reviewService.reportReview(reviewId, u.userId, dto);
  }
}
