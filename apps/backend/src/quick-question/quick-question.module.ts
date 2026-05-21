import { Module } from '@nestjs/common';
import { QuickQuestionController } from './quick-question.controller';
import { QuickQuestionService } from './quick-question.service';

@Module({
  controllers: [QuickQuestionController],
  providers: [QuickQuestionService],
})
export class QuickQuestionModule {}
