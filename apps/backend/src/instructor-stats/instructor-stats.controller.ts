import { Controller, Get, Param, Query } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { InstructorStatsService } from './instructor-stats.service';

@Roles('instructor', 'admin')
@Controller('instructor')
export class InstructorStatsController {
  constructor(private readonly statsService: InstructorStatsService) {}

  @Get('stats/overview')
  getOverview(@CurrentUser() user: { userId: string }) {
    return this.statsService.getOverview(user.userId);
  }

  @Get('stats/revenue')
  getRevenue(
    @CurrentUser() user: { userId: string },
    @Query('period') period: '30d' | '90d' | '1y' = '30d',
  ) {
    return this.statsService.getRevenue(user.userId, period);
  }

  @Get('courses/:courseId/stats')
  getCourseStats(
    @CurrentUser() user: { userId: string },
    @Param('courseId') courseId: string,
  ) {
    return this.statsService.getCourseStats(user.userId, courseId);
  }

  @Get('stats/engagement')
  getEngagement(@CurrentUser() user: { userId: string }) {
    return this.statsService.getEngagement(user.userId);
  }

  @Get('stats/quiz-insights')
  getQuizInsights(@CurrentUser() user: { userId: string }) {
    return this.statsService.getQuizInsights(user.userId);
  }
}
