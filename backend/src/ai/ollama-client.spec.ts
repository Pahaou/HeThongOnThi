import { ConfigService } from '@nestjs/config';
import { AiUnavailableError } from './ai-client';
import { OllamaAiClient } from './ollama-client';

const config = (env: Record<string, string>) =>
  ({ get: (k: string) => env[k] }) as unknown as ConfigService;

function reply(content: string, extra: object = {}) {
  return new Response(
    JSON.stringify({
      model: 'qwen2.5:3b',
      message: { role: 'assistant', content },
      done_reason: 'stop',
      prompt_eval_count: 120,
      eval_count: 45,
      ...extra,
    }),
    { status: 200 },
  );
}

describe('OllamaAiClient', () => {
  const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();
  const client = new OllamaAiClient(
    config({ OLLAMA_URL: 'http://ollama:11434/', OLLAMA_MODEL: 'qwen2.5:3b' }),
  );

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('báo model đang dùng và luôn sẵn sàng (lỗi kết nối xử lý khi gọi)', () => {
    expect(client.available).toBe(true);
    expect(client.model).toBe('qwen2.5:3b');
  });

  it('sinh câu hỏi: gửi JSON schema, đọc kết quả và số token', async () => {
    const questions = [
      {
        type: 'TRUE_FALSE',
        content: 'HTTP là giao thức không trạng thái?',
        options: [
          { content: 'Đúng', isCorrect: true },
          { content: 'Sai', isCorrect: false },
        ],
        explanation: 'Mỗi request độc lập.',
      },
    ];
    fetchMock.mockResolvedValue(reply(JSON.stringify({ questions })));

    const out = await client.generateQuestions({
      topicName: 'HTTP',
      difficulty: 'EASY',
      count: 1,
      text: 'HTTP không lưu trạng thái giữa các request.',
    });

    expect(out.questions).toEqual(questions);
    expect(out.usage).toEqual({ inputTokens: 120, outputTokens: 45 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://ollama:11434/api/chat');
    const body = JSON.parse(init.body as string) as {
      model: string;
      stream: boolean;
      think: boolean;
      options: { num_predict: number };
      format: { properties: { questions: unknown } };
      messages: { role: string; content: string }[];
    };
    expect(body.model).toBe('qwen2.5:3b');
    expect(body.stream).toBe(false);
    expect(body.think).toBe(false);
    expect(body.options.num_predict).toBeGreaterThan(0);
    expect(body.format.properties.questions).toBeDefined();
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toContain('HTTP không lưu trạng thái');
  });

  it('model trả JSON sai cấu trúc thì dùng phương án dự phòng', async () => {
    fetchMock.mockResolvedValue(reply('{"questions":[{"type":"ESSAY"}]}'));
    await expect(
      client.generateQuestions({
        topicName: 'HTTP',
        difficulty: 'EASY',
        count: 1,
        text: 'x',
      }),
    ).rejects.toBeInstanceOf(AiUnavailableError);
  });

  it('chưa đọc được PDF: báo rõ để giảng viên dán nội dung', async () => {
    await expect(
      client.generateQuestions({
        topicName: 'HTTP',
        difficulty: 'EASY',
        count: 1,
        pdfBase64: 'JVBERi0=',
      }),
    ).rejects.toThrow(/PDF/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('giải thích: trả văn bản và số token', async () => {
    fetchMock.mockResolvedValue(reply('  Vì HTTP không lưu trạng thái.  '));
    const out = await client.explain({
      question: 'HTTP có trạng thái không?',
      options: [
        { content: 'Có', isCorrect: false },
        { content: 'Không', isCorrect: true },
      ],
      teacherExplanation: '',
    });
    expect(out).toEqual({
      text: 'Vì HTTP không lưu trạng thái.',
      usage: { inputTokens: 120, outputTokens: 45 },
    });
  });

  it('Ollama tắt, lỗi HTTP, trả rỗng hay hết giờ đều thành AiUnavailableError', async () => {
    const input = { courseTitle: 'Web', weakTopics: [], unresolvedWrong: 0 };
    fetchMock.mockRejectedValueOnce(new TypeError('fetch failed'));
    await expect(client.advise(input)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    fetchMock.mockResolvedValueOnce(
      new Response('{"error":"model not found"}', { status: 404 }),
    );
    await expect(client.advise(input)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    fetchMock.mockResolvedValueOnce(reply('   '));
    await expect(client.advise(input)).rejects.toBeInstanceOf(
      AiUnavailableError,
    );
    fetchMock.mockRejectedValueOnce(
      new DOMException('The operation was aborted', 'TimeoutError'),
    );
    await expect(client.advise(input)).rejects.toThrow(/quá lâu/);
  });
});
