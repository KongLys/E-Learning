import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Express } from 'express';
import { CourseService } from './course.service';
import { CreateCourseDto } from './dto/create-course.dto';
import { UpdateCourseDto } from './dto/update-course.dto';
import { Public } from '../auth/decorators/public.decorator';
import { OptionalAuth } from '../auth/decorators/optional-auth.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller()
export class CourseController {
  constructor(private courseService: CourseService) {}

  @OptionalAuth()
  @Get('courses')
  listPublic(
    @CurrentUser() user: { userId: string; role: string } | undefined,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
    @Query('category') category?: string,
    @Query('categoryId') categoryId?: string,
    @Query('level') level?: string,
    @Query('search') search?: string,
    @Query('sort') sort?: string,
    @Query('price') price?: string,
  ) {
    const studentId = user?.role === 'student' ? user.userId : undefined;
    return this.courseService.listPublicCourses({
      page: +page! || 1,
      limit: +limit! || 12,
      category,
      categoryId,
      level,
      search,
      sort,
      price,
      studentId,
    });
  }

  @Public()
  @Get('courses/categories')
  listCategories() {
    return this.courseService.listCategories();
  }

  @Public()
  @Get('courses/:slug')
  getBySlug(@Param('slug') slug: string) {
    return this.courseService.getCourseBySlug(slug);
  }

  @Roles('instructor')
  @Post('courses')
  create(
    @CurrentUser() user: { userId: string },
    @Body() dto: CreateCourseDto,
  ) {
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

  @Delete('courses/:id')
  deleteCourse(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.courseService.deleteCourse(id, user.userId, user.role);
  }

  @HttpCode(200)
  @Post('courses/:id/unpublish')
  unpublish(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.courseService.unpublishCourse(id, user.userId, user.role);
  }

  @HttpCode(200)
  @Post('courses/:id/archive')
  archive(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.courseService.archiveCourse(id, user.userId, user.role);
  }

  @Roles('instructor')
  @Get('instructor/courses')
  myCourses(@CurrentUser() user: { userId: string }) {
    return this.courseService.getInstructorCourses(user.userId);
  }

  @Get('courses/:id/manage')
  getForManage(
    @CurrentUser() user: { userId: string; role: string },
    @Param('id') id: string,
  ) {
    return this.courseService.getCourseForManage(id, user.userId, user.role);
  }
}
