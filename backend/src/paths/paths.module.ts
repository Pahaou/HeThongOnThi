import { Module } from '@nestjs/common';
import { ManagePathsController, PathsController } from './paths.controller';
import { PathsService } from './paths.service';

@Module({
  controllers: [PathsController, ManagePathsController],
  providers: [PathsService],
})
export class PathsModule {}
