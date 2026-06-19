import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../storage/storage.module';
import { PodcastController, PodcastCourseController } from './podcast.controller';
import { PodcastService } from './podcast.service';
import { PodcastGenerateProcessor } from './processors/podcast-generate.processor';
import { PODCAST_QUEUE } from './podcast.queue';

@Module({
  imports: [
    AiModule,
    StorageModule,
    BullModule.registerQueue({ name: PODCAST_QUEUE }),
  ],
  controllers: [PodcastController, PodcastCourseController],
  providers: [PodcastService, PodcastGenerateProcessor],
})
export class PodcastModule {}
