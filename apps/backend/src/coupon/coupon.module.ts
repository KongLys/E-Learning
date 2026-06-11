import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CouponController } from './coupon.controller';
import { CouponPublicController } from './coupon-public.controller';
import { CouponService } from './coupon.service';

@Module({
  imports: [PrismaModule],
  controllers: [CouponController, CouponPublicController],
  providers: [CouponService],
  exports: [CouponService],
})
export class CouponModule {}
