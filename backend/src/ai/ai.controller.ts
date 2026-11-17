import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { memoryStorage } from 'multer';
import { extname } from 'node:path';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../generated/prisma/client';
import { AiService } from './ai.service';
import { GenerateQuestionsDto } from './dto/ai.dto';

const Id = (name = 'id') => Param(name, ParseUUIDPipe);
// Chặn gọi dồn dập ngoài giới hạn lượt/ngày
const AI_THROTTLE = { default: { limit: 10, ttl: 60_000 } };
const SOURCE_EXTENSIONS = new Set(['.pdf', '.txt', '.md']);

@Throttle(AI_THROTTLE)
@Controller()
export class AiController {
  constructor(private readonly ai: AiService) {}

  @Get('ai/status')
  status() {
    return this.ai.status();
  }

  @Roles(Role.INSTRUCTOR, Role.ADMIN)
  @Post('manage/courses/:courseId/ai/generate-questions')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 10 * 1024 * 1024, files: 1 },
      fileFilter: (_req, file, cb) => {
        if (SOURCE_EXTENSIONS.has(extname(file.originalname).toLowerCase()))
          cb(null, true);
        else
          cb(
            new BadRequestException('Chỉ nhận file .pdf, .txt hoặc .md'),
            false,
          );
      },
    }),
  )
  generate(
    @CurrentUser() actor: JwtPayload,
    @Id('courseId') courseId: string,
    @Body() dto: GenerateQuestionsDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.ai.generateQuestions(actor, courseId, dto, file);
  }

  @Post('ai/questions/:id/explain')
  @HttpCode(HttpStatus.OK)
  explain(@CurrentUser() user: JwtPayload, @Id() id: string) {
    return this.ai.explain(user, id);
  }

  @Get('courses/:courseId/ai/recommendation')
  recommendation(
    @CurrentUser() user: JwtPayload,
    @Id('courseId') courseId: string,
  ) {
    return this.ai.recommendation(user, courseId);
  }

  @Post('courses/:courseId/ai/recommended-practice')
  startRecommended(
    @CurrentUser() user: JwtPayload,
    @Id('courseId') courseId: string,
  ) {
    return this.ai.startRecommended(user, courseId);
  }
}
