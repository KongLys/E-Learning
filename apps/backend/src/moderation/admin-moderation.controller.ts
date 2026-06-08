import { Body, Controller, Get, HttpCode, Param, Post, Query, BadRequestException } from '@nestjs/common';
import { IsOptional, IsString, MaxLength } from 'class-validator';
import { Roles } from '../auth/decorators/roles.decorator';
import { ModerationService, ContentType } from './moderation.service';

class RejectDto {
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  reason?: string;
}

/** Admin review queue for auto-rejected / appealed content. */
@Controller('admin/moderation')
@Roles('admin')
export class AdminModerationController {
  constructor(private moderation: ModerationService) {}

  @Get()
  list(@Query('status') status?: string, @Query('type') type?: string) {
    return this.moderation.listForReview({ status, type: this.parseType(type) });
  }

  @HttpCode(200)
  @Post(':type/:id/approve')
  approve(@Param('type') type: string, @Param('id') id: string) {
    return this.moderation.approve(this.requireType(type), id);
  }

  @HttpCode(200)
  @Post(':type/:id/reject')
  reject(@Param('type') type: string, @Param('id') id: string, @Body() dto: RejectDto) {
    return this.moderation.reject(this.requireType(type), id, dto.reason);
  }

  private parseType(type?: string): ContentType | undefined {
    if (!type) return undefined;
    return this.requireType(type);
  }

  private requireType(type: string): ContentType {
    if (type !== 'course' && type !== 'material') {
      throw new BadRequestException('type must be "course" or "material"');
    }
    return type;
  }
}
