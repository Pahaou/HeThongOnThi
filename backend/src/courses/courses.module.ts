import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { CatalogController } from './catalog.controller';
import { CatalogService } from './catalog.service';
import { ManageController } from './manage.controller';
import { ManageService } from './manage.service';
import { StorageService, uploadDir } from './storage.service';
import { attachmentMulterOptions } from './upload.config';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        attachmentMulterOptions(uploadDir(config)),
    }),
  ],
  controllers: [CatalogController, ManageController],
  providers: [CatalogService, ManageService, StorageService],
})
export class CoursesModule {}
