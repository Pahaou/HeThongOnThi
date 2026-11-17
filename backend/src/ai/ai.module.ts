import { Module } from '@nestjs/common';
import { PracticeModule } from '../practice/practice.module';
import { AI_CLIENT, AnthropicAiClient } from './ai-client';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';

@Module({
  imports: [PracticeModule],
  controllers: [AiController],
  providers: [AiService, { provide: AI_CLIENT, useClass: AnthropicAiClient }],
})
export class AiModule {}
