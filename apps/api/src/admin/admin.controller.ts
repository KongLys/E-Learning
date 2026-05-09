import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin')
@Roles('admin')
export class AdminController {
  constructor(private prisma: PrismaService) {}

  @Get('stats')
  async getStats() {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [totalUsers, totalPublishedCourses, revenueAgg, activeStudents, pendingCourses, lockedUsers] =
      await Promise.all([
        this.prisma.user.count(),
        this.prisma.course.count({ where: { status: 'published' } }),
        this.prisma.order.aggregate({
          _sum: { totalAmount: true },
          where: { status: 'paid', paidAt: { gte: startOfMonth } },
        }),
        this.prisma.enrollment.count({ where: { status: 'active' } }),
        this.prisma.course.count({ where: { status: 'pending' } }),
        this.prisma.user.count({ where: { status: 'locked' } }),
      ]);

    return {
      totalUsers,
      totalPublishedCourses,
      revenueThisMonth: Number(revenueAgg._sum.totalAmount ?? 0),
      activeStudents,
      pendingCourses,
      lockedUsers,
    };
  }
}
