import {
  Body, Controller, Get, HttpCode, Param, Patch, Post, Query, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller()
export class CourseController {
  constructor(private courseService: CourseService) {}

  @Public()
  @Get('courses')
  listPublic(
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('category') category?: string,
    @Query('level') level?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
  ) {
    return this.courseService.listPublicCourses({ page: +page! || 1, limit: +limit! || 12, category, level, search, sort });
  }

  @Public()
  @Get('courses/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.courseService.getCourseBySlug(slug);
  }

  @Roles('instructor')
  @Post('courses')
  create(@CurrentUser() user: { userId: string }, @Body() dto: CreateCourseDto) {
    return this.courseService.createCourse(user.userId, dto);
  }

  @Patch('courses/:id')
  update(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.courseService.updateCourse(id, user.userId, user.role, dto);
  }

  @Post('courses/:id/thumbnail')
  @UseInterceptors(FileInterceptor('file'))
  uploadThumbnail(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.courseService.uploadThumbnail(id, user.userId, user.role, file);
  }

  @HttpCode(200)
  @Post('courses/:id/submit')
  submit(@CurrentUser() user: { userId: string }, @Param('id') id: string) {
    return this.courseService.submitForReview(id, user.userId);
  }

  @HttpCode(200)
  @Post('courses/:id/archive')
  archive(@CurrentUser() user: { userId: string; role: string }, @Param('id') id: string) {
    return this.courseService.archiveCourse(id, user.userId, user.role);
  }

  @Roles('instructor')
  @Get('instructor/courses')
  myCourses(@CurrentUser() user: { userId: string }) {
    return this.courseService.getInstructorCourses(user.userId);
  }
}
