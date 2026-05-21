import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { QuickQuestionService } from './quick-question.service';
import { CreateQuickQuestionDto } from './dto/create-question.dto';
import { CreateReplyDto } from './dto/create-reply.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller()
export class QuickQuestionController {
  constructor(private quickQuestionService: QuickQuestionService) {}

  @Post('quick-questions')
  createQuestion(
    @CurrentUser() u: { userId: string },
    @Body() dto: CreateQuickQuestionDto,
  ) {
    return this.quickQuestionService.createQuestion(u.userId, dto);
  }

  @Get('lessons/:lessonId/quick-questions')
  getByLesson(
    @CurrentUser() u: { userId: string; role: string },
    @Param('lessonId') lessonId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.quickQuestionService.getByLesson(lessonId, u.userId, u.role, status, page ? +page : 1, limit ? +limit : 20);
  }

  @Get('instructor/courses/:courseId/questions')
  getInstructorInbox(
    @CurrentUser() u: { userId: string },
    @Param('courseId') courseId: string,
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.quickQuestionService.getInstructorInbox(u.userId, courseId, status, page ? +page : 1, limit ? +limit : 20);
  }

  @Get('quick-questions/:id')
  getQuestion(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.quickQuestionService.getQuestion(id, u.userId, u.role);
  }

  @Post('quick-questions/:id/replies')
  addReply(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: CreateReplyDto,
  ) {
    return this.quickQuestionService.addReply(id, u.userId, u.role, dto);
  }

  @Post('quick-questions/:id/close')
  closeQuestion(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.quickQuestionService.closeQuestion(id, u.userId, u.role);
  }

  @Post('quick-questions/:id/reopen')
  reopenQuestion(
    @CurrentUser() u: { userId: string },
    @Param('id') id: string,
  ) {
    return this.quickQuestionService.reopenQuestion(id, u.userId);
  }
}
