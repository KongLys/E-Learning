import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { AiModule } from '../ai/ai.module';
import { StorageModule } from '../storage/storage.module';
import { NarrationController } from './narration.controller';
import { NarrationService } from './narration.service';
import { NarrationListener } from './narration.listener';
import { NarrationGenerateProcessor } from './processors/narration-generate.processor';
import { NARRATION_QUEUE } from './narration.queue';

@Module({
  imports: [
    AiModule,
    StorageModule,
    BullModule.registerQueue({ name: NARRATION_QUEUE }),
  ],
  controllers: [NarrationController],
  providers: [NarrationService, NarrationListener, NarrationGenerateProcessor],
})
export class NarrationModule {}
