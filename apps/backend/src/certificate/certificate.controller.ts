import { Controller, Get, Param } from '@nestjs/common';
import { CertificateService } from './certificate.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('certificates')
export class CertificateController {
  constructor(private certificates: CertificateService) {}

  /** Danh sách chứng chỉ của học viên đang đăng nhập. */
  @Get()
  listMine(@CurrentUser() user: { userId: string }) {
    return this.certificates.listMine(user.userId);
  }

  /** Xác minh công khai một chứng chỉ theo mã (không cần đăng nhập). */
  @Public()
  @Get('verify/:code')
  verify(@Param('code') code: string) {
    return this.certificates.verify(code);
  }

  /** Chứng chỉ của học viên cho một khóa (lazy-create nếu đã hoàn thành). */
  @Get('course/:courseId')
  getForCourse(
    @CurrentUser() user: { userId: string },
    @Param('courseId') courseId: string,
  ) {
    return this.certificates.getForCourse(user.userId, courseId);
  }
}
