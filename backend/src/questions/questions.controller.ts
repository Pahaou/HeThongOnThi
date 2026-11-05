import {
  BadRequestException,
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
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'node:path';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../generated/prisma/client';
import {
  CreateQuestionDto,
  ListQuestionsQuery,
  TopicDto,
  UpdateQuestionDto,
} from './dto/question.dto';
import { buildQuestionTemplate } from './excel-workbook';
import { QuestionsService } from './questions.service';

const Id = (name = 'id') => Param(name, ParseUUIDPipe);

const XLSX_MIME =
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Ngân hàng câu hỏi của từng khóa học, chỉ giảng viên khóa và admin dùng. */
@Roles(Role.INSTRUCTOR, Role.ADMIN)
@Controller('manage')
export class QuestionsController {
  constructor(private readonly questions: QuestionsService) {}

  // Chủ đề

  @Get('courses/:courseId/topics')
  listTopics(
    @CurrentUser() actor: JwtPayload,
    @Id('courseId') courseId: string,
  ) {
    return this.questions.listTopics(actor, courseId);
  }

  @Post('courses/:courseId/topics')
  createTopic(
    @CurrentUser() actor: JwtPayload,
    @Id('courseId') courseId: string,
    @Body() dto: TopicDto,
  ) {
    return this.questions.createTopic(actor, courseId, dto);
  }

  @Patch('topics/:id')
  renameTopic(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: TopicDto,
  ) {
    return this.questions.renameTopic(actor, id, dto);
  }

  @Delete('topics/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteTopic(@CurrentUser() actor: JwtPayload, @Id() id: string) {
    return this.questions.deleteTopic(actor, id);
  }

  // Câu hỏi

  @Get('courses/:courseId/questions')
  list(
    @CurrentUser() actor: JwtPayload,
    @Id('courseId') courseId: string,
    @Query() query: ListQuestionsQuery,
  ) {
    return this.questions.list(actor, courseId, query);
  }

  @Post('courses/:courseId/questions')
  create(
    @CurrentUser() actor: JwtPayload,
    @Id('courseId') courseId: string,
    @Body() dto: CreateQuestionDto,
  ) {
    return this.questions.create(actor, courseId, dto);
  }

  @Get('questions/import-template')
  async template() {
    return new StreamableFile(await buildQuestionTemplate(), {
      type: XLSX_MIME,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent('mau-cau-hoi.xlsx')}`,
    });
  }

  @Post('courses/:courseId/questions/import')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 5 * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (extname(file.originalname).toLowerCase() === '.xlsx')
          cb(null, true);
        else cb(new BadRequestException('Chỉ nhận file .xlsx'), false);
      },
    }),
  )
  importExcel(
    @CurrentUser() actor: JwtPayload,
    @Id('courseId') courseId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.questions.importExcel(actor, courseId, file);
  }

  @Get('questions/:id')
  get(@CurrentUser() actor: JwtPayload, @Id() id: string) {
    return this.questions.get(actor, id);
  }

  @Patch('questions/:id')
  update(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: UpdateQuestionDto,
  ) {
    return this.questions.update(actor, id, dto);
  }

  @Delete('questions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() actor: JwtPayload, @Id() id: string) {
    return this.questions.remove(actor, id);
  }
}
