import { Controller, Get, Patch, Param, Query } from '@nestjs/common';
import { NotificationService } from './notification.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('notifications')
export class NotificationController {
  constructor(private notifService: NotificationService) {}

  @Get()
  getNotifications(
    @CurrentUser() u: { userId: string },
    @Query('page') page?: string,
    @Query('unread_only') unreadOnly?: string,
  ) {
    return this.notifService.getNotifications(
      u.userId,
      page ? +page : 1,
      unreadOnly === 'true',
    );
  }

  @Get('unread-count')
  getUnreadCount(@CurrentUser() u: { userId: string }) {
    return this.notifService.getUnreadCount(u.userId);
  }

  @Patch('read-all')
  markAllRead(@CurrentUser() u: { userId: string }) {
    return this.notifService.markAllRead(u.userId);
  }

  @Patch(':id/read')
  markRead(@Param('id') id: string, @CurrentUser() u: { userId: string }) {
    return this.notifService.markRead(id, u.userId);
  }
}
