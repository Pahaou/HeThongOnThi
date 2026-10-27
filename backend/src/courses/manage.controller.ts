import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../generated/prisma/client';
import { ChapterDto, ReorderDto } from './dto/chapter.dto';
import { CreateCourseDto, UpdateCourseDto } from './dto/course.dto';
import { CreateLessonDto, UpdateLessonDto } from './dto/lesson.dto';
import { ManageService } from './manage.service';

const Id = (name = 'id') => Param(name, ParseUUIDPipe);

/** API cho giảng viên soạn khóa học. Admin quản lý được mọi khóa. */
@Roles(Role.INSTRUCTOR, Role.ADMIN)
@Controller('manage')
export class ManageController {
  constructor(private readonly manage: ManageService) {}

  @Get('courses')
  listCourses(@CurrentUser() actor: JwtPayload) {
    return this.manage.listCourses(actor);
  }

  @Post('courses')
  createCourse(@CurrentUser() actor: JwtPayload, @Body() dto: CreateCourseDto) {
    return this.manage.createCourse(actor, dto);
  }

  @Get('courses/:id')
  getCourse(@CurrentUser() actor: JwtPayload, @Id() id: string) {
    return this.manage.getCourse(actor, id);
  }

  @Patch('courses/:id')
  updateCourse(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: UpdateCourseDto,
  ) {
    return this.manage.updateCourse(actor, id, dto);
  }

  @Delete('courses/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteCourse(@CurrentUser() actor: JwtPayload, @Id() id: string) {
    return this.manage.deleteCourse(actor, id);
  }

  @Post('courses/:id/chapters')
  addChapter(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: ChapterDto,
  ) {
    return this.manage.addChapter(actor, id, dto);
  }

  @Put('courses/:id/chapter-order')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderChapters(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: ReorderDto,
  ) {
    return this.manage.reorderChapters(actor, id, dto.ids);
  }

  @Patch('chapters/:id')
  updateChapter(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: ChapterDto,
  ) {
    return this.manage.updateChapter(actor, id, dto);
  }

  @Delete('chapters/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteChapter(@CurrentUser() actor: JwtPayload, @Id() id: string) {
    return this.manage.deleteChapter(actor, id);
  }

  @Post('chapters/:id/lessons')
  addLesson(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: CreateLessonDto,
  ) {
    return this.manage.addLesson(actor, id, dto);
  }

  @Put('chapters/:id/lesson-order')
  @HttpCode(HttpStatus.NO_CONTENT)
  reorderLessons(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: ReorderDto,
  ) {
    return this.manage.reorderLessons(actor, id, dto.ids);
  }

  @Patch('lessons/:id')
  updateLesson(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: UpdateLessonDto,
  ) {
    return this.manage.updateLesson(actor, id, dto);
  }

  @Delete('lessons/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteLesson(@CurrentUser() actor: JwtPayload, @Id() id: string) {
    return this.manage.deleteLesson(actor, id);
  }

  @Post('lessons/:id/attachments')
  @UseInterceptors(FileInterceptor('file'))
  addAttachment(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.manage.addAttachment(actor, id, file);
  }

  @Delete('attachments/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteAttachment(@CurrentUser() actor: JwtPayload, @Id() id: string) {
    return this.manage.deleteAttachment(actor, id);
  }
}
