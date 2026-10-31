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
import { Public } from '../auth/decorators/public.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../generated/prisma/client';
import {
  CreatePathDto,
  SetPathCoursesDto,
  UpdatePathDto,
} from './dto/path.dto';
import { PathsService } from './paths.service';

@Controller('paths')
export class PathsController {
  constructor(private readonly paths: PathsService) {}

  @Public()
  @Get()
  list() {
    return this.paths.list();
  }

  @Public()
  @Get(':slug')
  detail(
    @Param('slug') slug: string,
    @CurrentUser() viewer: JwtPayload | undefined,
  ) {
    return this.paths.detail(slug, viewer);
  }
}

const Id = () => Param('id', ParseUUIDPipe);

@Roles(Role.INSTRUCTOR, Role.ADMIN)
@Controller('manage/paths')
export class ManagePathsController {
  constructor(private readonly paths: PathsService) {}

  @Get()
  list(@CurrentUser() actor: JwtPayload) {
    return this.paths.listManaged(actor);
  }

  @Post()
  create(@CurrentUser() actor: JwtPayload, @Body() dto: CreatePathDto) {
    return this.paths.create(actor, dto);
  }

  @Get(':id')
  get(@CurrentUser() actor: JwtPayload, @Id() id: string) {
    return this.paths.getManaged(actor, id);
  }

  @Patch(':id')
  update(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: UpdatePathDto,
  ) {
    return this.paths.update(actor, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() actor: JwtPayload, @Id() id: string) {
    return this.paths.remove(actor, id);
  }

  @Put(':id/courses')
  setCourses(
    @CurrentUser() actor: JwtPayload,
    @Id() id: string,
    @Body() dto: SetPathCoursesDto,
  ) {
    return this.paths.setCourses(actor, id, dto);
  }
}
