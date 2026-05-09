import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { UserService } from './user.service';
import { UpdateUserStatusDto } from './dto/update-user-status.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';

@Controller('admin/users')
@Roles('admin')
export class AdminUserController {
  constructor(private userService: UserService) {}

  @Get()
  listUsers(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('role') role?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
  ) {
    return this.userService.listUsers({ page: page ? +page : 1, limit: limit ? +limit : 20, role, status, search });
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() admin: { userId: string },
    @Param('id') id: string,
    @Body() dto: UpdateUserStatusDto,
  ) {
    return this.userService.updateUserStatus(admin.userId, id, dto);
  }
}
