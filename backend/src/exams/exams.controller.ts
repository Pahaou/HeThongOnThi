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
} from '@nestjs/common';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../generated/prisma/client';
import {
  AddCandidatesDto,
  CreateExamDto,
  PublishExamDto,
  SaveAnswerDto,
  UpdateExamDto,
} from './dto/exam.dto';
import { ExamManageService } from './exam-manage.service';
import { ExamTakeService } from './exam-take.service';

const Id = (name = 'id') => Param(name, ParseUUIDPipe);

/** Thí sinh làm bài thi chính thức. */
@Controller('exams')
export class ExamsController {
  constructor(private readonly take: ExamTakeService) {}

  @Get()
  myExams(@CurrentUser() user: JwtPayload) {
    return this.take.myExams(user);
  }

  @Post(':id/start')
  @HttpCode(HttpStatus.OK)
  start(@CurrentUser() user: JwtPayload, @Id() id: string) {
    return this.take.start(user, id);
  }

  @Get(':id/attempt')
  view(@CurrentUser() user: JwtPayload, @Id() id: string) {
    return this.take.view(user, id);
  }

  @Put(':id/attempt/answers/:questionId')
  save(
    @CurrentUser() user: JwtPayload,
    @Id() id: string,
    @Id('questionId') questionId: string,
    @Body() dto: SaveAnswerDto,
  ) {
    return this.take.save(user, id, questionId, dto.selectedOptionIds);
  }

  @Post(':id/attempt/submit')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentUser() user: JwtPayload, @Id() id: string) {
    return this.take.submit(user, id);
  }
}

/** Giảng viên tổ chức kỳ thi. */
@Roles(Role.INSTRUCTOR, Role.ADMIN)
@Controller('manage')
export class ManageExamsController {
  constructor(private readonly manage: ExamManageService) {}

  @Get('courses/:courseId/exams')
  list(@CurrentUser() actor: JwtPayload, @Id('courseId') courseId: string) {
    return this.manage.list(actor, courseId);
  }

  @Post('courses/:courseId/exams')
  create(
    @CurrentUser() actor: JwtPayload,
    @Id('courseId') courseId: string,
    @Body() dto: CreateExamDto,
  ) {
    return this.manage.create(actor, courseId, dto);
  }

  @Get('exams/:id')
  get(@CurrentUser() actor: JwtPayload, @Id() id: string) {
    return this.manage.get(actor, id);
  }

  @Patch('exams/:id')
  update(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: UpdateExamDto,
  ) {
    return this.manage.update(actor, id, dto);
  }

  @Patch('exams/:id/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  publish(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: PublishExamDto,
  ) {
    return this.manage.setPublished(actor, id, dto.published);
  }

  @Delete('exams/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() actor: JwtPayload, @Id() id: string) {
    return this.manage.remove(actor, id);
  }

  @Post('exams/:id/candidates')
  @HttpCode(HttpStatus.OK)
  addCandidates(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: AddCandidatesDto,
  ) {
    return this.manage.addCandidates(actor, id, dto.emails);
  }

  @Delete('exams/:id/candidates/:candidateId')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCandidate(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Id('candidateId') candidateId: string,
  ) {
    return this.manage.removeCandidate(actor, id, candidateId);
  }

  @Get('exams/:id/results')
  results(@CurrentUser() actor: JwtPayload, @Id() id: string) {
    return this.manage.results(actor, id);
  }
}
