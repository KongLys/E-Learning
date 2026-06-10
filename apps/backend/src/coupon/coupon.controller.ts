import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CouponService } from './coupon.service';
import { CreateCouponDto } from './dto/create-coupon.dto';

function parseCsvRows(csv: string) {
  const lines = csv.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  return lines.slice(1).map((line) => {
    const values = line.match(/(".*?"|[^,]+)(?=,|$)/g)?.map((v) => v.replace(/^"|"$/g, '').trim()) ?? line.split(',').map((v) => v.trim());
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] ?? ''; });
    return {
      code: row['code'] ?? '',
      courseId: row['courseid'] || undefined,
      discountPct: parseInt(row['discountpct'] ?? row['discount_pct'] ?? '10'),
      maxUses: parseInt(row['maxuses'] ?? row['max_uses'] ?? '0') || 0,
      expiresAt: row['expiresat'] ?? row['expires_at'] ?? undefined,
    };
  });
}

@Roles('instructor', 'admin')
@Controller('instructor/coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  @Get()
  getCoupons(@CurrentUser() user: { userId: string }) {
    return this.couponService.getCoupons(user.userId);
  }

  @Post()
  createCoupon(@CurrentUser() user: { userId: string }, @Body() dto: CreateCouponDto) {
    return this.couponService.createCoupon(user.userId, dto);
  }

  @Post('bulk')
  @UseInterceptors(FileInterceptor('file'))
  async bulkCreate(
    @CurrentUser() user: { userId: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    const csv = file.buffer.toString('utf-8');
    const rows = parseCsvRows(csv);
    return this.couponService.bulkCreate(user.userId, rows);
  }

  @Get('courses-export')
  async exportCourses(@CurrentUser() user: { userId: string }, @Res() res: Response) {
    const csv = await this.couponService.getCoursesExport(user.userId);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="courses.csv"');
    res.send('﻿' + csv);
  }

  @Delete(':id')
  @HttpCode(204)
  deleteCoupon(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.couponService.deleteCoupon(user.userId, id);
  }
}
