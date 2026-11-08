import { Module } from '@nestjs/common';
import { BlueprintsService } from './blueprints.service';
import {
  BlueprintsController,
  PracticeController,
} from './practice.controller';
import { PracticeService } from './practice.service';

@Module({
  controllers: [PracticeController, BlueprintsController],
  providers: [PracticeService, BlueprintsService],
})
export class PracticeModule {}
