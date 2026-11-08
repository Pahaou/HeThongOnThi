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
const MIN = 60_000;

interface User {
  id: string;
  email: string;
  token: string;
}
interface ExamView {
  status: string;
  deadlineAt: string;
  score: number | null;
  correctCount: number | null;
  questions: {
    questionId: string;
    type: string;
    content: string;
    options: { id: string; content: string }[];
    selectedOptionIds: string[];
  }[];
}
interface MyExam {
  id: string;
  state: string;
  score: number | null;
}

describe('Official exams (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const emails: string[] = [];
  let instructor: User;
  let otherInstructor: User;
  let s1: User;
  let s2: User;
  let outsider: User;
  let courseId: string;
  let topicId: string;
  let blueprintId: string;

  const http = () => request(app.getHttpServer());
  const as = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const ago = (ms: number) => new Date(Date.now() - ms).toISOString();
  const later = (ms: number) => new Date(Date.now() + ms).toISOString();

  async function createUser(role: Role): Promise<User> {
    const email = `exam-${randomUUID()}@e2e.local`;
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
      email,
      token: (res.body as { accessToken: string }).accessToken,
    };
  }

  const createExam = (body: object = {}, u = instructor) =>
    http()
      .post(`/api/manage/courses/${courseId}/exams`)
      .set(as(u))
      .send({
        title: 'Giữa kỳ',
        blueprintId,
        opensAt: ago(60 * MIN),
        closesAt: later(120 * MIN),
        durationSec: 45 * 60,
        ...body,
      });

  /** Tạo kỳ thi đang mở, có sẵn thí sinh và đã công bố. */
  async function openExam(candidates: User[] = [s1], body: object = {}) {
    const exam = (await createExam(body).expect(201)).body as { id: string };
    await http()
      .post(`/api/manage/exams/${exam.id}/candidates`)
      .set(as(instructor))
      .send({ emails: candidates.map((c) => c.email) })
      .expect(200);
    await http()
      .patch(`/api/manage/exams/${exam.id}/publish`)
      .set(as(instructor))
      .send({ published: true })
      .expect(204);
    return exam.id;
  }

  const start = (examId: string, u = s1) =>
    http().post(`/api/exams/${examId}/start`).set(as(u));
  const save = (examId: string, questionId: string, ids: string[], u = s1) =>
    http()
      .put(`/api/exams/${examId}/attempt/answers/${questionId}`)
      .set(as(u))
      .send({ selectedOptionIds: ids });
  const submit = (examId: string, u = s1) =>
    http().post(`/api/exams/${examId}/attempt/submit`).set(as(u));
  const closeNow = (examId: string) =>
    prisma.exam.update({
      where: { id: examId },
      data: { closesAt: new Date(Date.now() - 1000) },
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    instructor = await createUser(Role.INSTRUCTOR);
    otherInstructor = await createUser(Role.INSTRUCTOR);
    s1 = await createUser(Role.STUDENT);
    s2 = await createUser(Role.STUDENT);
    outsider = await createUser(Role.STUDENT);

    const course = await prisma.course.create({
      data: {
        slug: `exam-${randomUUID()}`,
        title: 'Thi',
        instructorId: instructor.id,
        published: true,
        topics: { create: { name: 'A' } },
      },
      include: { topics: true },
    });
    courseId = course.id;
    topicId = course.topics[0].id;
    for (let i = 0; i < 5; i++) {
      await prisma.question.create({
        data: {
          courseId,
          topicId,
          createdById: instructor.id,
          type: QuestionType.SINGLE,
          difficulty: Difficulty.EASY,
          content: `Câu ${i}`,
          options: {
            create: ['Đúng', 'Sai 1', 'Sai 2'].map((content, position) => ({
              content,
              position,
              isCorrect: position === 0,
            })),
          },
        },
      });
    }
    blueprintId = (
      await prisma.examBlueprint.create({
        data: {
          courseId,
          title: 'Ma trận',
          durationSec: 600,
          rules: {
            create: { topicId, difficulty: Difficulty.EASY, count: 3 },
          },
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId: instructor.id } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('tạo kỳ thi: kiểm tra giờ, quyền, đề thuộc khóa', async () => {
    await createExam({ opensAt: later(MIN), closesAt: ago(MIN) }).expect(400);
    await createExam({
      closesAt: later(10 * MIN),
      opensAt: ago(0),
      durationSec: 3600,
    }).expect(400);
    await createExam({}, s1).expect(403);
    await createExam({}, otherInstructor).expect(403);
    await createExam({ blueprintId: randomUUID() }).expect(400);
    const exam = (await createExam().expect(201)).body as { id: string };
    // Ma trận được chép sang kỳ thi
    expect(await prisma.examRule.count({ where: { examId: exam.id } })).toBe(1);
  });

  it('thí sinh: thêm theo email, báo email lạ/trùng; chưa có thí sinh thì không công bố được', async () => {
    const exam = (await createExam().expect(201)).body as { id: string };
    await http()
      .patch(`/api/manage/exams/${exam.id}/publish`)
      .set(as(instructor))
      .send({ published: true })
      .expect(400);

    const res = await http()
      .post(`/api/manage/exams/${exam.id}/candidates`)
      .set(as(instructor))
      .send({ emails: [s1.email.toUpperCase(), 'khong-co@e2e.local'] })
      .expect(200);
    expect(res.body).toEqual({
      added: [s1.email],
      alreadyAdded: [],
      notFound: ['khong-co@e2e.local'],
    });
    const again = await http()
      .post(`/api/manage/exams/${exam.id}/candidates`)
      .set(as(instructor))
      .send({ emails: [s1.email] })
      .expect(200);
    expect(again.body).toMatchObject({ added: [], alreadyAdded: [s1.email] });
  });

  it('chỉ thí sinh thấy kỳ thi đã công bố; chưa mở/đã đóng thì không bắt đầu được', async () => {
    const draft = (await createExam().expect(201)).body as { id: string };
    await http()
      .post(`/api/manage/exams/${draft.id}/candidates`)
      .set(as(instructor))
      .send({ emails: [s1.email] });
    await start(draft.id).expect(404);

    const examId = await openExam();
    const mine = (await http().get('/api/exams').set(as(s1)).expect(200))
      .body as MyExam[];
    expect(mine.find((e) => e.id === examId)?.state).toBe('OPEN');
    expect(mine.find((e) => e.id === draft.id)).toBeUndefined();
    await start(examId, outsider).expect(404);

    const notOpen = await openExam([s1], {
      opensAt: later(60 * MIN),
      closesAt: later(180 * MIN),
    });
    await start(notOpen).expect(409);
    const closed = await openExam([s1], {
      opensAt: ago(180 * MIN),
      closesAt: ago(60 * MIN),
    });
    await start(closed).expect(409);
  });

  it('bắt đầu: không lộ đáp án; vào lại giữ nguyên đề; bấm đồng thời chỉ tạo một lượt', async () => {
    const examId = await openExam([s1, s2]);
    const [a, b] = await Promise.all([start(examId), start(examId)]);
    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(
      await prisma.examAttempt.count({ where: { candidate: { examId } } }),
    ).toBe(1);

    const first = a.body as ExamView;
    expect(first.questions).toHaveLength(3);
    expect(JSON.stringify(first)).not.toMatch(/isCorrect|correctOptionIds/);
    const resumed = (await start(examId).expect(200)).body as ExamView;
    expect(resumed.questions.map((q) => q.questionId)).toEqual(
      first.questions.map((q) => q.questionId),
    );
    expect(resumed.deadlineAt).toBe(first.deadlineAt);
  });

  it('lưu, nộp idempotent, điểm chỉ hiện khi kỳ thi đóng', async () => {
    const examId = await openExam();
    const view = (await start(examId).expect(200)).body as ExamView;
    const [q1, q2] = view.questions;
    const right = (q: ExamView['questions'][0]) =>
      q.options.find((o) => o.content === 'Đúng')!.id;

    await save(examId, q1.questionId, [randomUUID()]).expect(400);
    await save(
      examId,
      q1.questionId,
      q1.options.slice(0, 2).map((o) => o.id),
    ).expect(400);
    await save(examId, q1.questionId, [right(q1)]).expect(200);
    await save(examId, q2.questionId, [right(q2)]).expect(200);
    await save(examId, q1.questionId, [right(q1)], s2).expect(404);

    const done = (await submit(examId).expect(200)).body as ExamView;
    expect(done).toMatchObject({
      status: 'SUBMITTED',
      score: null,
      questions: [],
    });
    const again = (await submit(examId).expect(200)).body as ExamView;
    expect(again.status).toBe('SUBMITTED');
    await save(examId, q1.questionId, [right(q1)]).expect(409);

    let mine = (await http().get('/api/exams').set(as(s1))).body as MyExam[];
    expect(mine.find((e) => e.id === examId)).toMatchObject({
      state: 'SUBMITTED',
      score: null,
    });

    await closeNow(examId);
    mine = (await http().get('/api/exams').set(as(s1))).body as MyExam[];
    expect(mine.find((e) => e.id === examId)?.score).toBe(6.67);
  });

  it('đề đóng băng: sửa đáp án trong ngân hàng giữa giờ thi không đổi cách chấm', async () => {
    const examId = await openExam();
    const view = (await start(examId).expect(200)).body as ExamView;
    for (const q of view.questions) {
      await save(examId, q.questionId, [
        q.options.find((o) => o.content === 'Đúng')!.id,
      ]).expect(200);
    }
    // Giảng viên đổi đáp án đúng và nội dung câu hỏi sau khi thí sinh đã vào thi
    const ids = view.questions.map((q) => q.questionId);
    await prisma.questionOption.updateMany({
      where: { questionId: { in: ids } },
      data: { isCorrect: false },
    });
    await prisma.question.updateMany({
      where: { id: { in: ids } },
      data: { content: 'Đã sửa' },
    });
    const during = (
      await http().get(`/api/exams/${examId}/attempt`).set(as(s1))
    ).body as ExamView;
    expect(during.questions.every((q) => q.content !== 'Đã sửa')).toBe(true);

    await submit(examId).expect(200);
    await closeNow(examId);
    const result = (
      await http().get(`/api/exams/${examId}/attempt`).set(as(s1))
    ).body as ExamView;
    expect(result).toMatchObject({ score: 10, correctCount: 3 });

    // Trả lại đáp án đúng cho các test sau
    await prisma.questionOption.updateMany({
      where: { questionId: { in: ids }, content: 'Đúng' },
      data: { isCorrect: true },
    });
  });

  it('hạn nộp bị cắt ở giờ đóng; quá hạn thì tự nộp với câu đã lưu', async () => {
    const examId = await openExam([s1], {
      opensAt: ago(60 * MIN),
      closesAt: later(2 * MIN),
      durationSec: 60,
    });
    const view = (await start(examId).expect(200)).body as ExamView;
    expect(new Date(view.deadlineAt).getTime()).toBeLessThanOrEqual(
      Date.now() + 2 * MIN,
    );

    const q = view.questions[0];
    await save(examId, q.questionId, [
      q.options.find((o) => o.content === 'Đúng')!.id,
    ]).expect(200);
    await prisma.examAttempt.updateMany({
      where: { candidate: { examId } },
      data: { deadlineAt: new Date(Date.now() - MIN) },
    });
    await save(examId, q.questionId, [q.options[1].id]).expect(409);
    const after = (await http().get(`/api/exams/${examId}/attempt`).set(as(s1)))
      .body as ExamView;
    expect(after.status).toBe('SUBMITTED');
    const attempt = await prisma.examAttempt.findFirstOrThrow({
      where: { candidate: { examId } },
    });
    expect(attempt.correctCount).toBe(1);
  });

  it('sau khi có thí sinh làm bài: khóa sửa giờ/xóa; giảng viên xem kết quả', async () => {
    const examId = await openExam([s1, s2]);
    await start(examId).expect(200);

    const patch = (body: object) =>
      http()
        .patch(`/api/manage/exams/${examId}`)
        .set(as(instructor))
        .send(body);
    await patch({ durationSec: 600 }).expect(409);
    await patch({ closesAt: later(60 * MIN) }).expect(409);
    await patch({ closesAt: later(300 * MIN), title: 'Đổi tên' }).expect(200);
    await http()
      .delete(`/api/manage/exams/${examId}`)
      .set(as(instructor))
      .expect(409);
    await http()
      .patch(`/api/manage/exams/${examId}/publish`)
      .set(as(instructor))
      .send({ published: false })
      .expect(409);

    const results = (
      await http()
        .get(`/api/manage/exams/${examId}/results`)
        .set(as(instructor))
        .expect(200)
    ).body as {
      id: string;
      user: { email: string };
      attempt: { status: string } | null;
    }[];
    expect(results).toHaveLength(2);
    const started = results.find((r) => r.user.email === s1.email)!;
    expect(started.attempt?.status).toBe('IN_PROGRESS');
    expect(results.find((r) => r.user.email === s2.email)?.attempt).toBeNull();

    await http()
      .delete(`/api/manage/exams/${examId}/candidates/${started.id}`)
      .set(as(instructor))
      .expect(409);
    await http()
      .get(`/api/manage/exams/${examId}/results`)
      .set(as(otherInstructor))
      .expect(403);
  });
});
