import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { SectionService } from './section.service';
import { CreateSectionDto } from './dto/create-section.dto';
import { UpdateSectionDto } from './dto/update-section.dto';
import { ReorderSectionsDto } from './dto/reorder-sections.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';

@Controller('courses/:courseId/sections')
export class SectionController {
  constructor(private sectionService: SectionService) {}

  @Public()
  @Get()
  list(@Param('courseId') courseId: string) {
    return this.sectionService.getSections(courseId);
  }

  @Post()
  create(
    @CurrentUser() user: { userId: string; role: string },
    @Param('courseId') courseId: string,
    @Body() dto: CreateSectionDto,
  ) {
    return this.sectionService.addSection(
      courseId,
      user.userId,
      user.role,
      dto,
    );
  }

  @Patch('reorder')
  reorder(
    @CurrentUser() user: { userId: string; role: string },
    @Param('courseId') courseId: string,
    @Body() dto: ReorderSectionsDto,
  ) {
    return this.sectionService.reorderSections(
      courseId,
      user.userId,
      user.role,
      dto,
    );
  }

  @Patch(':sectionId')
  update(
    @CurrentUser() user: { userId: string; role: string },
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
    @Body() dto: UpdateSectionDto,
  ) {
    return this.sectionService.updateSection(
      courseId,
      sectionId,
      user.userId,
      user.role,
      dto,
    );
  }

  @Delete(':sectionId')
  remove(
    @CurrentUser() user: { userId: string; role: string },
    @Param('courseId') courseId: string,
    @Param('sectionId') sectionId: string,
  ) {
    return this.sectionService.deleteSection(
      courseId,
      sectionId,
      user.userId,
      user.role,
    );
  }
}
