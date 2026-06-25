import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationModule } from '../notification/notification.module';
import { InstructorApplicationService } from './instructor-application.service';
import { InstructorApplicationController } from './instructor-application.controller';
import { AdminInstructorApplicationController } from './admin-instructor-application.controller';

@Module({
  imports: [PrismaModule, NotificationModule],
  controllers: [
    InstructorApplicationController,
    AdminInstructorApplicationController,
  ],
  providers: [InstructorApplicationService],
})
export class InstructorApplicationModule {}
