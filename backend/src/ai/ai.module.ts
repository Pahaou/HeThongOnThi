import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PracticeModule } from '../practice/practice.module';
import { AI_CLIENT, AnthropicAiClient } from './ai-client';
import { AiController } from './ai.controller';
import { AiService } from './ai.service';
import { OllamaAiClient } from './ollama-client';

@Module({
  imports: [PracticeModule],
  controllers: [AiController],
  providers: [
    AiService,
    {
      provide: AI_CLIENT,
      inject: [ConfigService],
      // AI_PROVIDER=ollama: AI chạy trên máy, miễn phí; mặc định Claude API
      useFactory: (config: ConfigService) =>
        config.get<string>('AI_PROVIDER') === 'ollama'
          ? new OllamaAiClient(config)
          : new AnthropicAiClient(config),
    },
  ],
})
export class AiModule {}
