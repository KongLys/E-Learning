import { Body, Controller, Delete, Param, Patch, Post } from '@nestjs/common';
import { CommentService } from './comment.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller()
export class CommentController {
  constructor(private commentService: CommentService) {}

  @Post('posts/:postId/comments')
  addComment(
    @Param('postId') postId: string,
    @CurrentUser() u: { userId: string; role: string },
    @Body() dto: CreateCommentDto,
  ) {
    return this.commentService.addComment(postId, u.userId, u.role, dto);
  }

  @Patch('comments/:id')
  updateComment(
    @Param('id') id: string,
    @CurrentUser() u: { userId: string },
    @Body('body') body: string,
  ) {
    return this.commentService.updateComment(id, u.userId, body);
  }

  @Delete('comments/:id')
  deleteComment(@Param('id') id: string, @CurrentUser() u: { userId: string; role: string }) {
    return this.commentService.deleteComment(id, u.userId, u.role);
  }

  @Post('comments/:id/solution')
  markSolution(@Param('id') id: string, @CurrentUser() u: { userId: string }) {
    return this.commentService.markSolution(id, u.userId);
  }
}
