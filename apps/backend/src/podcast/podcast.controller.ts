import { Controller, Get, Param, Post } from '@nestjs/common';
import { PodcastService } from './podcast.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('lessons')
export class PodcastController {
  constructor(private podcastService: PodcastService) {}

  @Get(':id/podcast')
  get(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.podcastService.getPodcast(id, u.userId, u.role);
  }

  @Post(':id/podcast')
  generate(
    @CurrentUser() u: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.podcastService.generate(id, u.userId, u.role);
  }
}
