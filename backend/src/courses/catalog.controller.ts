import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import type { JwtPayload } from '../auth/auth.types';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { CatalogService } from './catalog.service';
import { ListCoursesQuery } from './dto/course.dto';
import { StorageService } from './storage.service';

@Controller()
export class CatalogController {
  constructor(
    private readonly catalog: CatalogService,
    private readonly storage: StorageService,
  ) {}

  @Public()
  @Get('courses')
  list(@Query() query: ListCoursesQuery) {
    return this.catalog.list(query);
  }

  @Public()
  @Get('courses/:slug')
  detail(
    @Param('slug') slug: string,
    @CurrentUser() viewer: JwtPayload | undefined,
  ) {
    return this.catalog.detail(slug, viewer);
  }

  @Get('lessons/:id')
  lesson(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() viewer: JwtPayload,
  ) {
    return this.catalog.lesson(id, viewer);
  }

  @Get('attachments/:id/download')
  async download(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser() viewer: JwtPayload,
  ) {
    const file = await this.catalog.attachment(id, viewer);
    return new StreamableFile(
      createReadStream(this.storage.path(file.storageKey)),
      {
        type: file.mimeType,
        length: file.size,
        disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.fileName)}`,
      },
    );
  }
}
