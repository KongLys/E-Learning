import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { ReviewService } from './review.service';
import { ResolveReportDto } from './dto/resolve-report.dto';
import { Roles } from '../auth/decorators/roles.decorator';

/** Hàng đợi admin xử lý báo cáo lạm dụng review. */
@Controller('admin/review-reports')
@Roles('admin')
export class AdminReviewController {
  constructor(private reviewService: ReviewService) {}

  @Get()
  list(@Query('status') status?: string) {
    return this.reviewService.listReports({ status });
  }

  @HttpCode(200)
  @Post(':id/resolve')
  resolve(@Param('id') id: string, @Body() dto: ResolveReportDto) {
    return this.reviewService.resolveReport(id, dto.action);
  }
}
