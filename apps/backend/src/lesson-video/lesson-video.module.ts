import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../storage/storage.module';
import { LessonVideoController } from './lesson-video.controller';
import { LessonVideoService } from './lesson-video.service';
import { LessonVideoListener } from './lesson-video.listener';
import { LessonVideoGenerateProcessor } from './processors/lesson-video-generate.processor';
import { LESSON_VIDEO_QUEUE } from './lesson-video.queue';

@Module({
  imports: [
    AiModule,
    StorageModule,
    BullModule.registerQueue({ name: LESSON_VIDEO_QUEUE }),
  ],
  controllers: [LessonVideoController],
  providers: [
    LessonVideoService,
    LessonVideoListener,
    LessonVideoGenerateProcessor,
  ],
})
export class LessonVideoModule {}
