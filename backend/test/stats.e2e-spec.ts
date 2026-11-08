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
  options: { id: string }[];
}
interface Attempt {
  id: string;
  title: string;
  questions: AttemptQuestion[];
}
interface Bucket {
  answered: number;
  correct: number;
  accuracy: number | null;
  level: string;
}
interface Stats {
  total: Bucket;
  byTopic: (Bucket & { id: string; name: string })[];
  byDifficulty: (Bucket & { difficulty: string })[];
  mockScores: { id: string; score: number }[];
}
interface WrongList {
  unresolvedCount: number;
  resolvedCount: number;
  items: {
    question: { id: string; options: { isCorrect: boolean }[] };
    wrongCount: number;
    resolved: boolean;
  }[];
}

describe('Stats & wrong notebook (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const emails: string[] = [];
  let instructor: User;
  let student: User;
  let other: User;
  let courseId: string;
  let topicA: string;
  let topicB: string;
  const correctOf = new Map<string, string>();

  const http = () => request(app.getHttpServer());
  const as = (u: User) => ({ Authorization: `Bearer ${u.token}` });

  async function createUser(role: Role): Promise<User> {
    const email = `stats-${randomUUID()}@e2e.local`;
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

  async function addQuestion(topicId: string, difficulty: Difficulty) {
    const q = await prisma.question.create({
      data: {
        courseId,
        topicId,
        createdById: instructor.id,
        type: QuestionType.SINGLE,
        difficulty,
        content: `Câu ${randomUUID().slice(0, 6)}`,
        options: {
          create: ['Đúng', 'Sai 1', 'Sai 2'].map((content, position) => ({
            content,
            position,
            isCorrect: position === 0,
          })),
        },
      },
      include: { options: true },
    });
    correctOf.set(q.id, q.options.find((o) => o.isCorrect)!.id);
  }

  const answer = (
    u: User,
    attemptId: string,
    q: AttemptQuestion,
    right: boolean,
  ) =>
    http()
      .put(`/api/practice/${attemptId}/answers/${q.questionId}`)
      .set(as(u))
      .send({
        selectedOptionIds: [
          right
            ? correctOf.get(q.questionId)!
            : q.options.find((o) => o.id !== correctOf.get(q.questionId))!.id,
        ],
      })
      .expect(200);
  const stats = async (u = student) =>
    (await http().get(`/api/courses/${courseId}/stats`).set(as(u)).expect(200))
      .body as Stats;
  const wrong = async (all = false) =>
    (
      await http()
        .get(`/api/courses/${courseId}/wrong-questions`)
        .query(all ? { all: 'true' } : {})
        .set(as(student))
        .expect(200)
    ).body as WrongList;

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
    other = await createUser(Role.STUDENT);
    const course = await prisma.course.create({
      data: {
        slug: `stats-${randomUUID()}`,
        title: 'Thống kê',
        instructorId: instructor.id,
        published: true,
        topics: { create: [{ name: 'A' }, { name: 'B' }] },
      },
      include: { topics: true },
    });
    courseId = course.id;
    topicA = course.topics.find((t) => t.name === 'A')!.id;
    topicB = course.topics.find((t) => t.name === 'B')!.id;
    for (let i = 0; i < 6; i++) await addQuestion(topicA, Difficulty.EASY);
    for (let i = 0; i < 2; i++) await addQuestion(topicB, Difficulty.HARD);
    await prisma.enrollment.createMany({
      data: [student, other].map((u) => ({ userId: u.id, courseId })),
    });
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId: instructor.id } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('chưa ghi danh thì không xem được thống kê; chưa làm bài thì rỗng', async () => {
    const outsider = await createUser(Role.STUDENT);
    await http()
      .get(`/api/courses/${courseId}/stats`)
      .set(as(outsider))
      .expect(403);
    await http()
      .get(`/api/courses/${courseId}/wrong-questions`)
      .set(as(outsider))
      .expect(403);

    const empty = await stats();
    expect(empty.total).toEqual({
      answered: 0,
      correct: 0,
      accuracy: null,
      level: 'NOT_ENOUGH',
    });
    expect(empty.byTopic).toEqual([]);
  });

  it('tính tỉ lệ đúng theo chủ đề, độ khó và điểm thi thử', async () => {
    // Ôn tập chủ đề A: 5 đúng, 1 sai
    const topic = (
      await http()
        .post('/api/practice/topic')
        .set(as(student))
        .send({ courseId, topicIds: [topicA], count: 6 })
        .expect(201)
    ).body as Attempt;
    for (const [i, q] of topic.questions.entries()) {
      await answer(student, topic.id, q, i !== 0);
    }

    // Thi thử 2 câu chủ đề B, nộp trắng: bỏ trống tính sai
    const blueprint = await prisma.examBlueprint.create({
      data: {
        courseId,
        title: 'Đề B',
        durationSec: 600,
        published: true,
        rules: {
          create: { topicId: topicB, difficulty: Difficulty.HARD, count: 2 },
        },
      },
    });
    const mock = (
      await http()
        .post('/api/practice/mock')
        .set(as(student))
        .send({ blueprintId: blueprint.id })
        .expect(201)
    ).body as Attempt;
    await http()
      .post(`/api/practice/${mock.id}/submit`)
      .set(as(student))
      .expect(200);

    // Người khác làm bài không ảnh hưởng thống kê của mình
    const theirs = (
      await http()
        .post('/api/practice/topic')
        .set(as(other))
        .send({ courseId, count: 2 })
        .expect(201)
    ).body as Attempt;
    await answer(other, theirs.id, theirs.questions[0], false);

    const s = await stats();
    expect(s.byTopic).toEqual([
      expect.objectContaining({
        name: 'A',
        answered: 6,
        correct: 5,
        accuracy: 0.83,
        level: 'STRONG',
      }),
      expect.objectContaining({
        name: 'B',
        answered: 2,
        correct: 0,
        level: 'NOT_ENOUGH',
      }),
    ]);
    expect(s.total).toMatchObject({ answered: 8, correct: 5, level: 'FAIR' });
    expect(s.byDifficulty.find((d) => d.difficulty === 'HARD')).toMatchObject({
      answered: 2,
      correct: 0,
    });
    expect(s.mockScores).toEqual([
      expect.objectContaining({ id: mock.id, score: 0 }),
    ]);
  });

  it('sổ tay câu sai: ôn lại, làm đúng thì chuyển sang đã khắc phục', async () => {
    const before = await wrong();
    expect(before.unresolvedCount).toBe(3);
    expect(before.items).toHaveLength(3);
    // Đã chấm nên được xem đáp án đúng
    expect(before.items[0].question.options.some((o) => o.isCorrect)).toBe(
      true,
    );

    const retry = (
      await http()
        .post('/api/practice/wrong')
        .set(as(student))
        .send({ courseId, count: 10 })
        .expect(201)
    ).body as Attempt;
    expect(retry.title).toBe('Ôn lại câu sai');
    expect(retry.questions).toHaveLength(3);
    const fixed = retry.questions[0];
    await answer(student, retry.id, fixed, true);
    await answer(student, retry.id, retry.questions[1], false);

    const after = await wrong();
    expect(after).toMatchObject({ unresolvedCount: 2, resolvedCount: 1 });
    expect(after.items.map((i) => i.question.id)).not.toContain(
      fixed.questionId,
    );
    // Câu sai 2 lần xếp lên đầu
    expect(after.items[0]).toMatchObject({
      question: { id: retry.questions[1].questionId },
      wrongCount: 2,
    });

    const all = await wrong(true);
    expect(all.items).toHaveLength(3);
    expect(
      all.items.find((i) => i.question.id === fixed.questionId)?.resolved,
    ).toBe(true);
  });

  it('hết câu sai thì không tạo được bài ôn lại', async () => {
    const fresh = await createUser(Role.STUDENT);
    await prisma.enrollment.create({ data: { userId: fresh.id, courseId } });
    await http()
      .post('/api/practice/wrong')
      .set(as(fresh))
      .send({ courseId, count: 5 })
      .expect(400);
  });
});
