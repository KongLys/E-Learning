import { Module } from '@nestjs/common';
import { ReviewController } from './review.controller';
import { AdminReviewController } from './admin-review.controller';
import { ReviewService } from './review.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ReviewController, AdminReviewController],
  providers: [ReviewService],
})
export class ReviewModule {}
