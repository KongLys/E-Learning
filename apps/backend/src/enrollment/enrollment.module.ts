import { Module } from '@nestjs/common';
import { EnrollmentController } from './enrollment.controller';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentListener } from './enrollment.listener';
import { ProgressReminderSchedulerService } from './progress-reminder.scheduler.service';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [MailModule],
  controllers: [EnrollmentController],
  providers: [
    EnrollmentService,
    EnrollmentListener,
    ProgressReminderSchedulerService,
  ],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
