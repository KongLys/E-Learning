import { Module } from '@nestjs/common';
import { PostController } from './post.controller';
import { PostService } from './post.service';
import { CommentController } from './comment.controller';
import { CommentService } from './comment.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PostController, CommentController],
  providers: [PostService, CommentService],
})
export class CommunityModule {}
