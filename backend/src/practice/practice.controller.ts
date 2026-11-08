import {
  Body,
  Controller,
  DefaultValuePipe,
  ParseBoolPipe,
  Query,
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
import { BlueprintsService } from './blueprints.service';
import {
  AnswerDto,
  BlueprintDto,
  PublishBlueprintDto,
  StartMockDto,
  StartTopicPracticeDto,
  StartWrongPracticeDto,
} from './dto/practice.dto';
import { PracticeService } from './practice.service';
import { StatsService } from './stats.service';

const Id = (name = 'id') => Param(name, ParseUUIDPipe);

/** Học viên ôn tập và thi thử. */
@Controller()
export class PracticeController {
  constructor(
    private readonly practice: PracticeService,
    private readonly stats: StatsService,
  ) {}

  @Get('courses/:courseId/stats')
  overview(@CurrentUser() user: JwtPayload, @Id('courseId') courseId: string) {
    return this.stats.overview(user, courseId);
  }

  @Get('courses/:courseId/wrong-questions')
  wrongQuestions(
    @CurrentUser() user: JwtPayload,
    @Id('courseId') courseId: string,
    @Query('all', new DefaultValuePipe(false), ParseBoolPipe) all: boolean,
  ) {
    return this.stats.wrongQuestions(user, courseId, all);
  }

  @Post('practice/wrong')
  startWrong(
    @CurrentUser() user: JwtPayload,
    @Body() dto: StartWrongPracticeDto,
  ) {
    return this.practice.startWrong(user, dto);
  }

  @Get('courses/:courseId/practice-options')
  options(@CurrentUser() user: JwtPayload, @Id('courseId') courseId: string) {
    return this.practice.options(user, courseId);
  }

  @Get('courses/:courseId/practice-history')
  history(@CurrentUser() user: JwtPayload, @Id('courseId') courseId: string) {
    return this.practice.history(user, courseId);
  }

  @Post('practice/topic')
  startTopic(
    @CurrentUser() user: JwtPayload,
    @Body() dto: StartTopicPracticeDto,
  ) {
    return this.practice.startTopic(user, dto);
  }

  @Post('practice/mock')
  startMock(@CurrentUser() user: JwtPayload, @Body() dto: StartMockDto) {
    return this.practice.startMock(user, dto);
  }

  @Get('practice/:id')
  view(@CurrentUser() user: JwtPayload, @Id() id: string) {
    return this.practice.view(user, id);
  }

  @Put('practice/:id/answers/:questionId')
  answer(
    @CurrentUser() user: JwtPayload,
    @Id() id: string,
    @Id('questionId') questionId: string,
    @Body() dto: AnswerDto,
  ) {
    return this.practice.answer(user, id, questionId, dto.selectedOptionIds);
  }

  @Post('practice/:id/submit')
  @HttpCode(HttpStatus.OK)
  submit(@CurrentUser() user: JwtPayload, @Id() id: string) {
    return this.practice.submit(user, id);
  }
}

/** Giảng viên soạn ma trận đề thi thử. */
@Roles(Role.INSTRUCTOR, Role.ADMIN)
@Controller('manage')
export class BlueprintsController {
  constructor(private readonly blueprints: BlueprintsService) {}

  @Get('courses/:courseId/blueprints')
  list(@CurrentUser() actor: JwtPayload, @Id('courseId') courseId: string) {
    return this.blueprints.list(actor, courseId);
  }

  @Post('courses/:courseId/blueprints')
  create(
    @CurrentUser() actor: JwtPayload,
    @Id('courseId') courseId: string,
    @Body() dto: BlueprintDto,
  ) {
    return this.blueprints.create(actor, courseId, dto);
  }

  @Put('blueprints/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  update(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: BlueprintDto,
  ) {
    return this.blueprints.update(actor, id, dto);
  }

  @Patch('blueprints/:id/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  publish(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: PublishBlueprintDto,
  ) {
    return this.blueprints.setPublished(actor, id, dto.published);
  }

  @Delete('blueprints/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() actor: JwtPayload, @Id() id: string) {
    return this.blueprints.remove(actor, id);
  }
}
