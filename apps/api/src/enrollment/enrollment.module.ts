import { Module } from '@nestjs/common';
import { EnrollmentController } from './enrollment.controller';
import { EnrollmentService } from './enrollment.service';
import { EnrollmentListener } from './enrollment.listener';

@Module({
  controllers: [EnrollmentController],
  providers: [EnrollmentService, EnrollmentListener],
  exports: [EnrollmentService],
})
export class EnrollmentModule {}
