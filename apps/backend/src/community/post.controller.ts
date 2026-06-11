import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PostService } from './post.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller()
export class PostController {
  constructor(private postService: PostService) {}

  @Post('courses/:courseId/posts')
  createPost(
    @Param('courseId') courseId: string,
    @CurrentUser() u: { userId: string; role: string },
    @Body() dto: CreatePostDto,
  ) {
    return this.postService.createPost(courseId, u.userId, u.role, dto);
  }

  @Get('courses/:courseId/posts')
  listPosts(
    @Param('courseId') courseId: string,
    @Query('type') type?: string,
    @Query('sort') sort?: string,
    @Query('page') page?: string,
  ) {
    return this.postService.listPosts(courseId, {
      type,
      sort,
      page: page ? +page : 1,
    });
  }

  @Get('posts/:id')
  getPost(@Param('id') id: string) {
    return this.postService.getPost(id);
  }

  @Patch('posts/:id')
  updatePost(
    @Param('id') id: string,
    @CurrentUser() u: { userId: string; role: string },
    @Body('body') body: string,
  ) {
    return this.postService.updatePost(id, u.userId, u.role, body);
  }

  @Delete('posts/:id')
  deletePost(
    @Param('id') id: string,
    @CurrentUser() u: { userId: string; role: string },
  ) {
    return this.postService.deletePost(id, u.userId, u.role);
  }

  @Patch('posts/:id/pin')
  pinPost(
    @Param('id') id: string,
    @CurrentUser() u: { userId: string; role: string },
  ) {
    return this.postService.pinPost(id, u.userId, u.role);
  }

  @Patch('posts/:id/hide')
  hidePost(
    @Param('id') id: string,
    @CurrentUser() u: { userId: string; role: string },
  ) {
    return this.postService.hidePost(id, u.userId, u.role);
  }

  @Post('posts/:id/vote')
  votePost(@Param('id') id: string, @CurrentUser() u: { userId: string }) {
    return this.postService.votePost(id, u.userId);
  }
}
