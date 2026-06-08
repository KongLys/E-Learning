import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ModerationService } from './moderation.service';
import { ModerationController } from './moderation.controller';
import { AdminModerationController } from './admin-moderation.controller';

@Module({
  imports: [PrismaModule],
  controllers: [ModerationController, AdminModerationController],
  providers: [ModerationService],
  exports: [ModerationService],
})
export class ModerationModule {}
