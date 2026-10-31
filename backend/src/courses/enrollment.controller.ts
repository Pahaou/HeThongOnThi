import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ProgressDto } from './dto/progress.dto';
import { EnrollmentService } from './enrollment.service';

@Controller()
export class EnrollmentController {
  constructor(private readonly enrollments: EnrollmentService) {}

  @Post('courses/:id/enroll')
  enroll(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) courseId: string,
  ) {
    return this.enrollments.enroll(user, courseId);
  }

  @Get('me/courses')
  myCourses(@CurrentUser() user: JwtPayload) {
    return this.enrollments.myCourses(user.sub);
  }

  @Put('lessons/:id/progress')
  progress(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseUUIDPipe) lessonId: string,
    @Body() dto: ProgressDto,
  ) {
    return this.enrollments.updateProgress(user, lessonId, dto);
  }
}
