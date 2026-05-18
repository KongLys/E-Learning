import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { InstructorStatsController } from './instructor-stats.controller';
import { InstructorStatsService } from './instructor-stats.service';

@Module({
  imports: [PrismaModule],
  controllers: [InstructorStatsController],
  providers: [InstructorStatsService],
})
export class InstructorStatsModule {}
