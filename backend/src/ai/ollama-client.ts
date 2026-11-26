import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import {
  ADVICE_SYSTEM,
  ADVICE_TIMEOUT_MS,
  AdviceInput,
  adviceMessage,
  AiClient,
  AiUnavailableError,
  AiUsageInfo,
  EXPLAIN_SYSTEM,
  EXPLAIN_TIMEOUT_MS,
  ExplainInput,
  explainMessage,
  GENERATE_SYSTEM,
  GENERATE_TIMEOUT_MS,
  GeneratedSetSchema,
  GenerateInput,
  generatePrompt,
} from './ai-client';

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * AI chạy trên máy (Ollama), miễn phí và không cần Internet. Dùng chung prompt
 * với Claude; sinh câu hỏi ép đúng cấu trúc bằng JSON schema (tham số `format`).
 * Bật bằng AI_PROVIDER=ollama, xem README.
 */
export class OllamaAiClient implements AiClient {
  private readonly logger = new Logger(OllamaAiClient.name);
  private readonly url: string;
  // Lỗi kết nối (Ollama chưa chạy, chưa tải model) xử lý lúc gọi và rơi về dự phòng
  readonly available = true;
  readonly model: string;

  constructor(config: ConfigService) {
    this.url = (
      config.get<string>('OLLAMA_URL') ?? 'http://localhost:11434'
    ).replace(/\/+$/, '');
    this.model = config.get<string>('OLLAMA_MODEL') ?? 'qwen2.5:3b';
  }

  async generateQuestions(input: GenerateInput) {
    if (input.pdfBase64) {
      throw new AiUnavailableError(
        'AI chạy trên máy chưa đọc được PDF: hãy chọn bài học hoặc dán nội dung',
      );
    }
    const res = await this.chat(
      GENERATE_SYSTEM,
      generatePrompt(input),
      { timeoutMs: GENERATE_TIMEOUT_MS, maxTokens: 6000 },
      z.toJSONSchema(GeneratedSetSchema),
    );
    let parsed: z.ZodSafeParseResult<z.infer<typeof GeneratedSetSchema>>;
    try {
      parsed = GeneratedSetSchema.safeParse(JSON.parse(res.text));
    } catch {
      throw new AiUnavailableError('AI không trả về bộ câu hỏi hợp lệ');
    }
    if (!parsed.success) {
      throw new AiUnavailableError('AI không trả về bộ câu hỏi hợp lệ');
    }
    return { questions: parsed.data.questions, usage: res.usage };
  }

  async explain(input: ExplainInput) {
    return this.chat(EXPLAIN_SYSTEM, explainMessage(input), {
      timeoutMs: EXPLAIN_TIMEOUT_MS,
      maxTokens: 800,
    });
  }

  async advise(input: AdviceInput) {
    return this.chat(ADVICE_SYSTEM, adviceMessage(input), {
      timeoutMs: ADVICE_TIMEOUT_MS,
      maxTokens: 500,
    });
  }

  /** Mọi lỗi mạng/HTTP/hết giờ/trả rỗng đều thành AiUnavailableError để dùng dự phòng. */
  private async chat(
    system: string,
    user: string,
    // maxTokens: model nhỏ đôi khi lặp chữ không dừng, chặn lại thay vì chờ tới hết giờ
    { timeoutMs, maxTokens }: { timeoutMs: number; maxTokens: number },
    format?: object,
  ): Promise<{ text: string; usage: AiUsageInfo }> {
    let res: Response;
    try {
      res = await fetch(`${this.url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format,
          // Model có chế độ suy nghĩ (vd. qwen3) chạy chậm gấp nhiều lần; model khác bỏ qua cờ này
          think: false,
          // Giữ model trong bộ nhớ lâu hơn mặc định 5 phút để buổi demo không phải nạp lại
          keep_alive: '30m',
          // Bài học dài vượt ngữ cảnh mặc định của Ollama thì bị cắt mất phần đầu
          options: { temperature: 0.3, num_ctx: 8192, num_predict: maxTokens },
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
          ],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'TimeoutError') {
        throw new AiUnavailableError('AI phản hồi quá lâu');
      }
      this.logger.warn(`Không gọi được Ollama tại ${this.url}: ${String(e)}`);
      throw new AiUnavailableError('AI tạm thời không phản hồi');
    }
    if (!res.ok) {
      this.logger.warn(`Ollama lỗi ${res.status}: ${await res.text()}`);
      throw new AiUnavailableError('AI tạm thời không phản hồi');
    }
    const data = (await res.json()) as OllamaChatResponse;
    const text = data.message?.content?.trim() ?? '';
    if (!text) throw new AiUnavailableError('AI không trả lời');
    return {
      text,
      usage: {
        inputTokens: data.prompt_eval_count ?? 0,
        outputTokens: data.eval_count ?? 0,
      },
    };
  }
}
