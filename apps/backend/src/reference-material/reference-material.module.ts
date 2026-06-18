import { Module } from '@nestjs/common';
import { ReferenceMaterialController } from './reference-material.controller';
import { ReferenceMaterialService } from './reference-material.service';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [StorageModule],
  controllers: [ReferenceMaterialController],
  providers: [ReferenceMaterialService],
})
export class ReferenceMaterialModule {}
