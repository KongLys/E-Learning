import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { AiQuizService } from './ai-quiz.service';
import { SubmitAiQuizDto } from './dto/submit-ai-quiz.dto';

@Controller()
export class AiQuizController {
  constructor(private aiQuiz: AiQuizService) {}

  @Get('courses/:courseId/ai-quizzes')
  list(
    @CurrentUser() u: { userId: string },
    @Param('courseId') courseId: string,
  ) {
    return this.aiQuiz.listMine(courseId, u.userId);
  }

  @Get('ai-quizzes/:id')
  get(@CurrentUser() u: { userId: string }, @Param('id') id: string) {
    return this.aiQuiz.getMine(id, u.userId);
  }

  @Post('ai-quizzes/:id/attempts')
  submit(
    @CurrentUser() u: { userId: string },
    @Param('id') id: string,
    @Body() dto: SubmitAiQuizDto,
  ) {
    return this.aiQuiz.submit(id, u.userId, dto);
  }
}
