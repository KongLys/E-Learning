import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { ProgressModule } from '../progress/progress.module';
import { FinalQuizController } from './final-quiz.controller';
import { FinalQuizService } from './final-quiz.service';
import { FinalQuizListener } from './final-quiz.listener';
import { FinalQuizProcessor } from './final-quiz.processor';
import { FINAL_QUIZ_QUEUE } from './final-quiz.queue';

@Module({
  imports: [
    AiModule,
    ProgressModule,
    BullModule.registerQueue({ name: FINAL_QUIZ_QUEUE }),
  ],
  controllers: [FinalQuizController],
  providers: [FinalQuizService, FinalQuizListener, FinalQuizProcessor],
  exports: [FinalQuizService],
})
export class FinalQuizModule {}
