import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  AI_CLIENT,
  type AiClient,
  AiUnavailableError,
  type GenerateInput,
  type GeneratedQuestion,
} from '../src/ai/ai-client';
import { AppModule } from '../src/app.module';
import {
  Difficulty,
  LessonType,
  QuestionType,
  Role,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

const PASSWORD = 'Password@123';
const usage = { inputTokens: 100, outputTokens: 50 };

/** AI giả: không gọi Claude thật; bật `failing` để kiểm tra phương án dự phòng. */
class FakeAi implements AiClient {
  available = true;
  failing = false;
  calls = { generate: 0, explain: 0, advise: 0 };
  lastGenerate?: GenerateInput;
  generated: GeneratedQuestion[] = [];

  private guard() {
    if (this.failing) throw new AiUnavailableError('AI phản hồi quá lâu');
  }
  generateQuestions(input: GenerateInput) {
    this.calls.generate++;
    this.lastGenerate = input;
    this.guard();
    return Promise.resolve({ questions: this.generated, usage });
  }
  explain() {
    this.calls.explain++;
    this.guard();
    return Promise.resolve({ text: 'Giải thích từ AI', usage, model: 'fake' });
  }
  advise() {
    this.calls.advise++;
    this.guard();
    return Promise.resolve({ text: 'Lời khuyên từ AI', usage });
  }
}

interface User {
  id: string;
  token: string;
}
interface Attempt {
  id: string;
  mode: string;
  questions: {
    questionId: string;
    options: { id: string; content: string }[];
  }[];
}

describe('AI features (e2e, AI giả)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const fake = new FakeAi();
  const emails: string[] = [];
  let instructor: User;
  let student: User;
  let courseId: string;
  let topicId: string;
  let lessonId: string;
  let questionId: string;

  const http = () => request(app.getHttpServer());
  const as = (u: User) => ({ Authorization: `Bearer ${u.token}` });

  async function createUser(role: Role): Promise<User> {
    const email = `ai-${randomUUID()}@e2e.local`;
    emails.push(email);
    const user = await prisma.user.create({
      data: {
        email,
        fullName: role,
        role,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
      },
    });
    const res = await http()
      .post('/api/auth/login')
      .send({ email, password: PASSWORD })
      .expect(200);
    return {
      id: user.id,
      token: (res.body as { accessToken: string }).accessToken,
    };
  }

  const generate = (
    fields: Record<string, string>,
    file?: { buffer: Buffer; name: string },
    u = instructor,
  ) => {
    const req = http()
      .post(`/api/manage/courses/${courseId}/ai/generate-questions`)
      .set(as(u));
    for (const [k, v] of Object.entries(fields)) void req.field(k, v);
    if (file) void req.attach('file', file.buffer, file.name);
    return req;
  };
  const explain = (u = student) =>
    http().post(`/api/ai/questions/${questionId}/explain`).set(as(u));

  beforeAll(async () => {
    // Giới hạn thấp để kiểm tra hết lượt
    process.env.AI_LIMIT_GENERATE = '3';
    process.env.AI_LIMIT_EXPLAIN = '3';
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(AI_CLIENT)
      .useValue(fake)
      .compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    instructor = await createUser(Role.INSTRUCTOR);
    student = await createUser(Role.STUDENT);
    const course = await prisma.course.create({
      data: {
        slug: `ai-${randomUUID()}`,
        title: 'AI',
        instructorId: instructor.id,
        published: true,
        topics: { create: { name: 'HTML' } },
        chapters: {
          create: {
            title: 'C',
            position: 0,
            lessons: {
              create: {
                type: LessonType.READING,
                title: 'Thẻ liên kết',
                position: 0,
                content:
                  '## Thẻ a\nThẻ `<a>` tạo liên kết bằng thuộc tính href.',
              },
            },
          },
        },
      },
      include: { topics: true, chapters: { include: { lessons: true } } },
    });
    courseId = course.id;
    topicId = course.topics[0].id;
    lessonId = course.chapters[0].lessons[0].id;
    const q = await prisma.question.create({
      data: {
        courseId,
        topicId,
        lessonId,
        createdById: instructor.id,
        type: QuestionType.SINGLE,
        difficulty: Difficulty.EASY,
        content: 'Thẻ nào tạo liên kết?',
        explanation: 'Thẻ a dùng href.',
        options: {
          create: [
            { content: '<a>', isCorrect: true, position: 0 },
            { content: '<link>', isCorrect: false, position: 1 },
          ],
        },
      },
    });
    questionId = q.id;
    await prisma.enrollment.create({ data: { userId: student.id, courseId } });
  });

  afterAll(async () => {
    delete process.env.AI_LIMIT_GENERATE;
    delete process.env.AI_LIMIT_EXPLAIN;
    await prisma.course.deleteMany({ where: { instructorId: instructor.id } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  beforeEach(() => {
    fake.failing = false;
  });

  it('sinh câu hỏi: chỉ giảng viên, cần tài liệu, câu sai định dạng bị bỏ, câu hợp lệ chờ duyệt', async () => {
    fake.generated = [
      {
        type: 'SINGLE',
        content: 'Thuộc tính nào chứa địa chỉ liên kết?',
        options: [
          { content: 'href', isCorrect: true },
          { content: 'src', isCorrect: false },
        ],
        explanation: 'href chứa URL.',
      },
      {
        type: 'TRUE_FALSE',
        content: 'Thẻ a dùng để tạo liên kết.',
        options: [
          { content: 'Đúng', isCorrect: true },
          { content: 'Sai', isCorrect: false },
        ],
        explanation: '',
      },
      // Sai luật: câu một đáp án có hai đáp án đúng
      {
        type: 'SINGLE',
        content: 'Câu lỗi',
        options: [
          { content: 'x', isCorrect: true },
          { content: 'y', isCorrect: true },
        ],
        explanation: '',
      },
    ];
    await generate(
      { topicId, difficulty: 'EASY', count: '3', lessonId },
      undefined,
      student,
    ).expect(403);
    await generate({ topicId, difficulty: 'EASY', count: '3' }).expect(400);

    const res = await generate({
      topicId,
      difficulty: 'EASY',
      count: '3',
      lessonId,
    }).expect(201);
    expect(res.body).toEqual({ created: 2, skipped: 1 });
    expect(fake.lastGenerate?.text).toContain('Thẻ liên kết');

    const drafts = await prisma.question.findMany({
      where: { courseId, source: 'AI' },
    });
    expect(drafts.map((d) => d.status)).toEqual(['DRAFT', 'DRAFT']);
    // Câu nháp chưa vào ngân hàng ôn tập cho tới khi duyệt
    const opts = (
      await http()
        .get(`/api/courses/${courseId}/practice-options`)
        .set(as(student))
        .expect(200)
    ).body as { topics: { counts: Record<string, number> }[] };
    expect(opts.topics[0].counts.EASY).toBe(1);
    await http()
      .patch(`/api/manage/questions/${drafts[0].id}`)
      .set(as(instructor))
      .send({ status: 'ACTIVE' })
      .expect(200);
  });

  it('sinh câu hỏi từ PDF gửi tài liệu dạng base64; AI lỗi thì báo 503 và ghi nhật ký', async () => {
    fake.generated = [];
    const pdf = Buffer.from('%PDF-1.4 giả');
    await generate(
      { topicId, difficulty: 'MEDIUM', count: '2' },
      { buffer: pdf, name: 'bai.pdf' },
    ).expect(201);
    expect(fake.lastGenerate?.pdfBase64).toBe(pdf.toString('base64'));

    await generate(
      { topicId, difficulty: 'EASY', count: '2' },
      { buffer: Buffer.from('x'), name: 'a.exe' },
    ).expect(400);

    fake.failing = true;
    const failed = await generate({
      topicId,
      difficulty: 'EASY',
      count: '2',
      text: 'Nội dung',
    }).expect(503);
    expect((failed.body as { message: string }).message).toContain(
      'soạn câu hỏi thủ công',
    );
    expect(
      await prisma.aiUsage.count({
        where: { userId: instructor.id, status: 'FAILED' },
      }),
    ).toBe(1);
  });

  it('sinh câu hỏi: hết lượt trong 24 giờ thì 429 (lượt lỗi không bị tính)', async () => {
    fake.generated = [];
    // Đã dùng 2 lượt thành công ở các test trước; giới hạn là 3
    await generate({
      topicId,
      difficulty: 'EASY',
      count: '1',
      text: 'a',
    }).expect(201);
    await generate({
      topicId,
      difficulty: 'EASY',
      count: '1',
      text: 'a',
    }).expect(429);
  });

  it('giải thích: phải làm câu trước, có cache dùng chung, AI lỗi thì dùng giải thích giảng viên + bài học', async () => {
    await explain().expect(403);

    const attempt = (
      await http()
        .post('/api/practice/topic')
        .set(as(student))
        .send({ courseId, count: 5 })
        .expect(201)
    ).body as Attempt;
    const q = attempt.questions.find((x) => x.questionId === questionId)!;
    await http()
      .put(`/api/practice/${attempt.id}/answers/${questionId}`)
      .set(as(student))
      .send({
        selectedOptionIds: [q.options.find((o) => o.content === '<link>')!.id],
      })
      .expect(200);

    fake.failing = true;
    const fallback = (await explain().expect(200)).body as {
      source: string;
      content: string;
      note: string;
    };
    expect(fallback.source).toBe('FALLBACK');
    expect(fallback.content).toContain('Thẻ a dùng href.');
    expect(fallback.content).toContain('Thẻ liên kết');
    expect(fallback.note).toContain('quá lâu');

    fake.failing = false;
    const ai = (await explain().expect(200)).body as {
      source: string;
      content: string;
    };
    expect(ai).toEqual({ source: 'AI', content: 'Giải thích từ AI' });
    const before = fake.calls.explain;
    await explain().expect(200);
    await explain(instructor).expect(200);
    // Lần sau đọc từ cache, không gọi AI nữa
    expect(fake.calls.explain).toBe(before);
  });

  it('gợi ý ôn theo điểm yếu: chọn câu sai trước, lời khuyên AI, AI lỗi vẫn có lời khuyên dự phòng', async () => {
    const rec = (
      await http()
        .get(`/api/courses/${courseId}/ai/recommendation`)
        .set(as(student))
        .expect(200)
    ).body as {
      unresolvedWrong: number;
      questionCount: number;
      advice: { source: string; text: string };
    };
    expect(rec.unresolvedWrong).toBe(1);
    expect(rec.questionCount).toBeGreaterThanOrEqual(1);
    expect(rec.advice).toEqual({ source: 'AI', text: 'Lời khuyên từ AI' });

    fake.failing = true;
    const fb = (
      await http()
        .get(`/api/courses/${courseId}/ai/recommendation`)
        .set(as(student))
        .expect(200)
    ).body as { advice: { source: string; text: string } };
    expect(fb.advice.source).toBe('FALLBACK');
    expect(fb.advice.text).toContain('1 câu');

    const attempt = (
      await http()
        .post(`/api/courses/${courseId}/ai/recommended-practice`)
        .set(as(student))
        .expect(201)
    ).body as Attempt;
    expect(attempt.mode).toBe('WEAKNESS');
    expect(attempt.questions.map((x) => x.questionId)).toContain(questionId);
    // Ôn theo điểm yếu chấm từng câu như ôn tập
    const q = attempt.questions.find((x) => x.questionId === questionId)!;
    const res = await http()
      .put(`/api/practice/${attempt.id}/answers/${questionId}`)
      .set(as(student))
      .send({
        selectedOptionIds: [q.options.find((o) => o.content === '<a>')!.id],
      })
      .expect(200);
    expect(res.body).toMatchObject({ isCorrect: true });
  });
});
