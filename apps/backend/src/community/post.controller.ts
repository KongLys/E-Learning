import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { randomUUID } from 'crypto';
import { PostService } from './post.service';
import { CreatePostDto } from './dto/create-post.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { StorageService } from '../storage/storage.service';

const MAX_MEDIA_BYTES = 100 * 1024 * 1024; // 100MB

@Controller()
export class PostController {
  constructor(
    private postService: PostService,
    private storage: StorageService,
  ) {}

  @Post('community/upload')
  @UseInterceptors(FileInterceptor('file'))
  async uploadMedia(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('No file uploaded');
    const isImage = file.mimetype.startsWith('image/');
    const isVideo = file.mimetype.startsWith('video/');
    if (!isImage && !isVideo) {
      throw new BadRequestException('Only image or video files are allowed');
    }
    if (file.size > MAX_MEDIA_BYTES) {
      throw new BadRequestException('File too large (max 100MB)');
    }
    const key = `community/${randomUUID()}-${file.originalname}`;
    const url = await this.storage.uploadFile(key, file.buffer, file.mimetype);
    return { url, type: isImage ? 'image' : 'video' };
  }

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
