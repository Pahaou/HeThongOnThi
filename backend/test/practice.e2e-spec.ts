import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Difficulty, QuestionType, Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

const PASSWORD = 'Password@123';

interface User {
  id: string;
  token: string;
}
interface AttemptQuestion {
  questionId: string;
  type: string;
  options: { id: string; content: string }[];
  selectedOptionIds: string[];
  answered: boolean;
  isCorrect?: boolean;
  correctOptionIds?: string[];
  explanation?: string;
}
interface Attempt {
  id: string;
  mode: string;
  deadlineAt: string | null;
  submittedAt: string | null;
  totalCount: number;
  correctCount: number | null;
  score: number | null;
  questions: AttemptQuestion[];
}
interface Options {
  topics: { id: string; counts: Record<string, number> }[];
  blueprints: { id: string; totalQuestions: number }[];
}

describe('Practice & mock exam (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const emails: string[] = [];
  let instructor: User;
  let student: User;
  let outsider: User;
  let courseId: string;
  let topicA: string;
  let topicB: string;
  /** Đáp án đúng theo id câu hỏi, để test tự trả lời đúng/sai */
  const correctOf = new Map<string, string[]>();

  const http = () => request(app.getHttpServer());
  const as = (u: User) => ({ Authorization: `Bearer ${u.token}` });

  async function createUser(role: Role): Promise<User> {
    const email = `practice-${randomUUID()}@e2e.local`;
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

  async function addQuestion(
    topicId: string,
    type: QuestionType,
    difficulty: Difficulty,
    correct: number[],
  ) {
    const q = await prisma.question.create({
      data: {
        courseId,
        topicId,
        createdById: instructor.id,
        type,
        difficulty,
        content: `Câu ${randomUUID().slice(0, 6)}`,
        explanation: 'Giải thích mẫu',
        options: {
          create: ['P1', 'P2', 'P3'].map((content, position) => ({
            content,
            position,
            isCorrect: correct.includes(position),
          })),
        },
      },
      include: { options: true },
    });
    correctOf.set(
      q.id,
      q.options.filter((o) => o.isCorrect).map((o) => o.id),
    );
  }

  /** Một phương án sai bất kỳ của câu hỏi */
  const wrongOf = (q: AttemptQuestion) =>
    q.options.find((o) => !correctOf.get(q.questionId)!.includes(o.id))!.id;

  const startTopic = (body: object, u = student) =>
    http()
      .post('/api/practice/topic')
      .set(as(u))
      .send({ courseId, ...body });
  const answer = (
    attemptId: string,
    questionId: string,
    ids: string[],
    u = student,
  ) =>
    http()
      .put(`/api/practice/${attemptId}/answers/${questionId}`)
      .set(as(u))
      .send({ selectedOptionIds: ids });
  const submit = (attemptId: string) =>
    http().post(`/api/practice/${attemptId}/submit`).set(as(student));

  async function createBlueprint(rules: object[], durationSec = 600) {
    const res = await http()
      .post(`/api/manage/courses/${courseId}/blueprints`)
      .set(as(instructor))
      .send({ title: 'Đề thử', durationSec, rules })
      .expect(201);
    return (res.body as { id: string }).id;
  }
  const publish = (id: string, published = true) =>
    http()
      .patch(`/api/manage/blueprints/${id}/publish`)
      .set(as(instructor))
      .send({ published });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    instructor = await createUser(Role.INSTRUCTOR);
    student = await createUser(Role.STUDENT);
    outsider = await createUser(Role.STUDENT);

    const course = await prisma.course.create({
      data: {
        slug: `practice-${randomUUID()}`,
        title: 'Ôn tập',
        instructorId: instructor.id,
        published: true,
        topics: { create: [{ name: 'A' }, { name: 'B' }] },
      },
      include: { topics: true },
    });
    courseId = course.id;
    topicA = course.topics.find((t) => t.name === 'A')!.id;
    topicB = course.topics.find((t) => t.name === 'B')!.id;
    for (let i = 0; i < 4; i++) {
      await addQuestion(topicA, QuestionType.SINGLE, Difficulty.EASY, [0]);
    }
    for (let i = 0; i < 2; i++) {
      await addQuestion(topicB, QuestionType.MULTIPLE, Difficulty.HARD, [0, 2]);
    }
    await prisma.enrollment.create({
      data: { userId: student.id, courseId },
    });
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId: instructor.id } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('chưa ghi danh thì không ôn tập được; đã ghi danh thấy số câu theo độ khó', async () => {
    await http()
      .get(`/api/courses/${courseId}/practice-options`)
      .set(as(outsider))
      .expect(403);
    await startTopic({ count: 2 }, outsider).expect(403);

    const res = await http()
      .get(`/api/courses/${courseId}/practice-options`)
      .set(as(student))
      .expect(200);
    const opts = res.body as Options;
    expect(opts.topics.find((t) => t.id === topicA)?.counts).toEqual({
      EASY: 4,
      MEDIUM: 0,
      HARD: 0,
    });
  });

  it('ôn tập: không lộ đáp án trước khi trả lời, trả lời xong thấy giải thích', async () => {
    const res = await startTopic({ topicIds: [topicA], count: 3 }).expect(201);
    const attempt = res.body as Attempt;
    expect(attempt.mode).toBe('TOPIC');
    expect(attempt.questions).toHaveLength(3);
    // Không trường nào lộ đáp án đúng trước khi trả lời
    expect(JSON.stringify(res.body)).not.toMatch(/isCorrect|correctOptionIds/);

    const [q1, q2] = attempt.questions;
    const right = await answer(
      attempt.id,
      q1.questionId,
      correctOf.get(q1.questionId)!,
    ).expect(200);
    expect(right.body).toMatchObject({
      isCorrect: true,
      explanation: 'Giải thích mẫu',
    });
    await answer(
      attempt.id,
      q1.questionId,
      correctOf.get(q1.questionId)!,
    ).expect(409);

    const wrong = await answer(attempt.id, q2.questionId, [wrongOf(q2)]).expect(
      200,
    );
    expect(wrong.body).toMatchObject({
      isCorrect: false,
      correctOptionIds: correctOf.get(q2.questionId),
    });

    // Xem lại: câu đã trả lời có đáp án, câu chưa trả lời thì không
    const view = (
      await http()
        .get(`/api/practice/${attempt.id}`)
        .set(as(student))
        .expect(200)
    ).body as Attempt;
    expect(view.correctCount).toBe(1);
    expect(view.questions[0].correctOptionIds).toBeDefined();
    expect(view.questions[2].correctOptionIds).toBeUndefined();

    const done = (await submit(attempt.id).expect(200)).body as Attempt;
    expect(done).toMatchObject({ correctCount: 1, score: 3.33 });
    expect(done.questions[2].isCorrect).toBe(false);
  });

  it('chặn phương án không thuộc câu, chọn nhiều cho câu một đáp án, bài của người khác', async () => {
    const attempt = (
      await startTopic({ topicIds: [topicA], count: 1 }).expect(201)
    ).body as Attempt;
    const q = attempt.questions[0];
    await answer(attempt.id, q.questionId, [randomUUID()]).expect(400);
    await answer(
      attempt.id,
      q.questionId,
      q.options.slice(0, 2).map((o) => o.id),
    ).expect(400);
    await http()
      .get(`/api/practice/${attempt.id}`)
      .set(as(outsider))
      .expect(404);
    await answer(attempt.id, q.questionId, [q.options[0].id], outsider).expect(
      404,
    );
  });

  it('ôn tập lọc theo độ khó và báo lỗi khi không có câu phù hợp', async () => {
    const hard = (
      await startTopic({ difficulty: 'HARD', count: 10 }).expect(201)
    ).body as Attempt;
    // Chỉ có 2 câu khó nên lấy tối đa 2
    expect(hard.questions).toHaveLength(2);
    expect(hard.questions.every((q) => q.type === 'MULTIPLE')).toBe(true);
    await startTopic({
      topicIds: [topicA],
      difficulty: 'HARD',
      count: 3,
    }).expect(400);
  });

  it('ma trận đề: chỉ giảng viên; không trùng quy tắc; thiếu câu thì không công bố được', async () => {
    await http()
      .post(`/api/manage/courses/${courseId}/blueprints`)
      .set(as(student))
      .send({ title: 'X', durationSec: 600, rules: [] })
      .expect(403);
    await http()
      .post(`/api/manage/courses/${courseId}/blueprints`)
      .set(as(instructor))
      .send({
        title: 'Trùng',
        durationSec: 600,
        rules: [
          { topicId: topicA, difficulty: 'EASY', count: 1 },
          { topicId: topicA, difficulty: 'EASY', count: 2 },
        ],
      })
      .expect(400);

    const tooMany = await createBlueprint([
      { topicId: topicA, difficulty: 'EASY', count: 10 },
    ]);
    await publish(tooMany).expect(400);
    const list = (
      await http()
        .get(`/api/manage/courses/${courseId}/blueprints`)
        .set(as(instructor))
        .expect(200)
    ).body as { id: string; ready: boolean; rules: { available: number }[] }[];
    expect(list.find((b) => b.id === tooMany)).toMatchObject({
      ready: false,
      rules: [{ available: 4 }],
    });
    // Đề nháp không hiện với học viên và không thi được
    const opts = (
      await http()
        .get(`/api/courses/${courseId}/practice-options`)
        .set(as(student))
    ).body as Options;
    expect(opts.blueprints.find((b) => b.id === tooMany)).toBeUndefined();
    await http()
      .post('/api/practice/mock')
      .set(as(student))
      .send({ blueprintId: tooMany })
      .expect(404);
  });

  it('thi thử: sinh đề đúng ma trận, ẩn đúng sai tới khi nộp, chấm nhiều đáp án kiểu tất cả hoặc không', async () => {
    const blueprintId = await createBlueprint([
      { topicId: topicA, difficulty: 'EASY', count: 2 },
      { topicId: topicB, difficulty: 'HARD', count: 2 },
    ]);
    await publish(blueprintId).expect(204);

    const attempt = (
      await http()
        .post('/api/practice/mock')
        .set(as(student))
        .send({ blueprintId })
        .expect(201)
    ).body as Attempt;
    expect(attempt.mode).toBe('MOCK');
    expect(attempt.deadlineAt).not.toBeNull();
    expect(attempt.questions.filter((q) => q.type === 'SINGLE')).toHaveLength(
      2,
    );
    expect(attempt.questions.filter((q) => q.type === 'MULTIPLE')).toHaveLength(
      2,
    );
    expect(attempt.correctCount).toBeNull();

    const single = attempt.questions.filter((q) => q.type === 'SINGLE');
    const multi = attempt.questions.filter((q) => q.type === 'MULTIPLE');
    // Đổi ý được trước khi nộp: chọn sai rồi sửa thành đúng
    await answer(attempt.id, single[0].questionId, [wrongOf(single[0])]).expect(
      200,
    );
    const saved = await answer(
      attempt.id,
      single[0].questionId,
      correctOf.get(single[0].questionId)!,
    ).expect(200);
    expect(saved.body).toEqual({ saved: true });
    // Câu nhiều đáp án: chọn đủ = đúng, chọn thiếu = sai
    await answer(
      attempt.id,
      multi[0].questionId,
      correctOf.get(multi[0].questionId)!,
    ).expect(200);
    await answer(
      attempt.id,
      multi[1].questionId,
      correctOf.get(multi[1].questionId)!.slice(0, 1),
    ).expect(200);

    const during = await http()
      .get(`/api/practice/${attempt.id}`)
      .set(as(student))
      .expect(200);
    expect(JSON.stringify(during.body)).not.toMatch(
      /isCorrect|correctOptionIds/,
    );

    const result = (await submit(attempt.id).expect(200)).body as Attempt;
    expect(result).toMatchObject({ correctCount: 2, score: 5 });
    expect(result.submittedAt).not.toBeNull();
    // Nộp lại vẫn ra kết quả cũ; sửa đáp án sau khi nộp bị từ chối
    const again = (await submit(attempt.id).expect(200)).body as Attempt;
    expect(again.submittedAt).toBe(result.submittedAt);
    await answer(
      attempt.id,
      single[1].questionId,
      correctOf.get(single[1].questionId)!,
    ).expect(409);
  });

  it('thi thử hết giờ thì tự nộp với những câu đã lưu', async () => {
    const blueprintId = await createBlueprint([
      { topicId: topicA, difficulty: 'EASY', count: 1 },
    ]);
    await publish(blueprintId).expect(204);
    const attempt = (
      await http()
        .post('/api/practice/mock')
        .set(as(student))
        .send({ blueprintId })
        .expect(201)
    ).body as Attempt;
    const q = attempt.questions[0];
    await answer(attempt.id, q.questionId, correctOf.get(q.questionId)!).expect(
      200,
    );

    // Giả lập đã quá hạn nộp
    await prisma.practiceAttempt.update({
      where: { id: attempt.id },
      data: { deadlineAt: new Date(Date.now() - 60_000) },
    });
    await answer(attempt.id, q.questionId, [wrongOf(q)]).expect(409);
    const view = (
      await http()
        .get(`/api/practice/${attempt.id}`)
        .set(as(student))
        .expect(200)
    ).body as Attempt;
    expect(view.submittedAt).not.toBeNull();
    // Lựa chọn đúng đã lưu trước khi hết giờ vẫn được tính
    expect(view.score).toBe(10);
  });

  it('lịch sử làm bài của chính mình, mới nhất trước', async () => {
    const res = await http()
      .get(`/api/courses/${courseId}/practice-history`)
      .set(as(student))
      .expect(200);
    const list = res.body as { mode: string; startedAt: string }[];
    expect(list.length).toBeGreaterThanOrEqual(4);
    expect(list.map((a) => a.startedAt)).toEqual(
      [...list.map((a) => a.startedAt)].sort().reverse(),
    );
  });
});
