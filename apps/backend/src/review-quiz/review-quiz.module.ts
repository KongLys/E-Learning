import { Module } from '@nestjs/common';
import {
  ReviewQuizController,
  ReviewQuizCourseController,
} from './review-quiz.controller';
import { ReviewQuizService } from './review-quiz.service';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [AiModule],
  controllers: [ReviewQuizController, ReviewQuizCourseController],
  providers: [ReviewQuizService],
})
export class ReviewQuizModule {}
