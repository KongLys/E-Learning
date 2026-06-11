import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { CouponService } from './coupon.service';
import { ValidateCouponDto } from './dto/validate-coupon.dto';

/**
 * Endpoint công khai (cho người dùng đã đăng nhập) để xem trước mã giảm giá
 * trước khi mua. Không gắn @Roles nên mọi role đều gọi được — JwtAuthGuard
 * toàn cục vẫn yêu cầu đăng nhập.
 */
@Controller('coupons')
export class CouponPublicController {
  constructor(private readonly couponService: CouponService) {}

  @Post('validate')
  @HttpCode(200)
  validate(@Body() dto: ValidateCouponDto) {
    return this.couponService.previewCoupon(dto.code, dto.courseId);
  }
}
