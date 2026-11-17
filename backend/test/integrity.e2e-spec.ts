import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import {
  Difficulty,
  ExamStatus,
  QuestionType,
  Role,
} from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

const PASSWORD = 'Password@123';
const MIN = 60_000;

interface User {
  id: string;
  email: string;
  token: string;
}
interface Log {
  violationCount: number;
  sessionTakeovers: number;
  extensions: { minutes: number; reason: string; grantedBy: string }[];
  events: { type: string; detail: string | null }[];
}

describe('Exam integrity: extensions & events (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const emails: string[] = [];
  let instructor: User;
  let otherInstructor: User;
  let student: User;
  let courseId: string;
  let topicId: string;

  const http = () => request(app.getHttpServer());
  const as = (u: User) => ({ Authorization: `Bearer ${u.token}` });
  const session = randomUUID();

  async function createUser(role: Role): Promise<User> {
    const email = `integrity-${randomUUID()}@e2e.local`;
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

  /** Kỳ thi đang mở với một thí sinh; trả về examId và candidateId. */
  async function openExam() {
    const exam = await prisma.exam.create({
      data: {
        courseId,
        createdById: instructor.id,
        title: 'Kỳ thi',
        opensAt: new Date(Date.now() - 60 * MIN),
        closesAt: new Date(Date.now() + 120 * MIN),
        durationSec: 30 * 60,
        status: ExamStatus.PUBLISHED,
        rules: { create: { topicId, difficulty: Difficulty.EASY, count: 1 } },
        candidates: { create: { userId: student.id } },
      },
      include: { candidates: true },
    });
    return { examId: exam.id, candidateId: exam.candidates[0].id };
  }

  const start = (examId: string, sessionId = session) =>
    http()
      .post(`/api/exams/${examId}/start`)
      .set(as(student))
      .send({ sessionId });
  const extend = (
    examId: string,
    candidateId: string,
    body: object,
    u = instructor,
  ) =>
    http()
      .post(`/api/manage/exams/${examId}/candidates/${candidateId}/extensions`)
      .set(as(u))
      .send(body);
  const sendEvents = (examId: string, events: object[]) =>
    http()
      .post(`/api/exams/${examId}/attempt/events`)
      .set(as(student))
      .send({ sessionId: session, events });
  const log = async (examId: string, candidateId: string) =>
    (
      await http()
        .get(`/api/manage/exams/${examId}/candidates/${candidateId}/log`)
        .set(as(instructor))
        .expect(200)
    ).body as Log;

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
    student = await createUser(Role.STUDENT);
    const course = await prisma.course.create({
      data: {
        slug: `integrity-${randomUUID()}`,
        title: 'Liêm chính',
        instructorId: instructor.id,
        topics: { create: { name: 'A' } },
      },
      include: { topics: true },
    });
    courseId = course.id;
    topicId = course.topics[0].id;
    await prisma.question.create({
      data: {
        courseId,
        topicId,
        createdById: instructor.id,
        type: QuestionType.SINGLE,
        difficulty: Difficulty.EASY,
        content: 'Câu',
        options: {
          create: [
            { content: 'Đúng', isCorrect: true, position: 0 },
            { content: 'Sai', isCorrect: false, position: 1 },
          ],
        },
      },
    });
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId: instructor.id } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('gia hạn: cần lý do, chỉ khi đang làm, cộng dồn đúng kể cả gửi đồng thời, có nhật ký', async () => {
    const { examId, candidateId } = await openExam();
    await extend(examId, candidateId, {
      minutes: 5,
      reason: 'Mất điện',
    }).expect(409);

    const before = (await start(examId).expect(200)).body as {
      deadlineAt: string;
    };
    await extend(examId, candidateId, { minutes: 5 }).expect(400);
    await extend(examId, candidateId, { minutes: 0, reason: 'x x x' }).expect(
      400,
    );
    await extend(
      examId,
      candidateId,
      { minutes: 5, reason: 'Mất điện' },
      otherInstructor,
    ).expect(403);

    await Promise.all([
      extend(examId, candidateId, {
        minutes: 5,
        reason: 'Mất điện phòng thi',
      }).expect(201),
      extend(examId, candidateId, {
        minutes: 10,
        reason: 'Máy hỏng, đổi máy',
      }).expect(201),
    ]);
    const status = (
      await http()
        .get(`/api/exams/${examId}/attempt/status`)
        .set(as(student))
        .expect(200)
    ).body as { deadlineAt: string };
    expect(
      new Date(status.deadlineAt).getTime() -
        new Date(before.deadlineAt).getTime(),
    ).toBe(15 * MIN);

    const l = await log(examId, candidateId);
    expect(l.extensions.map((e) => e.minutes).sort()).toEqual([10, 5]);
    expect(l.extensions[0].grantedBy).toBe('INSTRUCTOR');

    await http()
      .post(`/api/exams/${examId}/attempt/submit`)
      .set(as(student))
      .send({ sessionId: session })
      .expect(200);
    await extend(examId, candidateId, {
      minutes: 5,
      reason: 'Muộn rồi',
    }).expect(409);
  });

  it('sự kiện: ghi theo lô, đếm vi phạm, bỏ qua sau khi nộp, chặn loại không hợp lệ', async () => {
    const { examId, candidateId } = await openExam();
    await start(examId).expect(200);
    const at = new Date().toISOString();

    const res = await sendEvents(examId, [
      { type: 'TAB_HIDDEN', clientAt: at },
      { type: 'COPY', clientAt: at, detail: 'ctrl+c' },
      { type: 'FULLSCREEN_ENTER', clientAt: at },
    ]).expect(200);
    expect(res.body).toEqual({ recorded: 3, violationCount: 2 });

    // Thí sinh không được tự ghi sự kiện đổi thiết bị
    await sendEvents(examId, [
      { type: 'SESSION_TAKEOVER', clientAt: at },
    ]).expect(400);
    await sendEvents(examId, [{ type: 'HACK', clientAt: at }]).expect(400);

    // Mở ở thiết bị khác: server tự ghi SESSION_TAKEOVER và tính vi phạm
    await start(examId, randomUUID()).expect(200);
    const l = await log(examId, candidateId);
    expect(l.violationCount).toBe(3);
    expect(l.sessionTakeovers).toBe(1);
    expect(l.events.map((e) => e.type)).toEqual([
      'TAB_HIDDEN',
      'COPY',
      'FULLSCREEN_ENTER',
      'SESSION_TAKEOVER',
    ]);

    await prisma.examAttempt.updateMany({
      where: { candidateId },
      data: { status: 'SUBMITTED', submittedAt: new Date() },
    });
    const after = await sendEvents(examId, [
      { type: 'PASTE', clientAt: at },
    ]).expect(200);
    expect(after.body).toMatchObject({ recorded: 0 });
  });

  it('kết quả của giảng viên có số vi phạm và số lần đổi thiết bị', async () => {
    const { examId } = await openExam();
    await start(examId).expect(200);
    await sendEvents(examId, [
      { type: 'WINDOW_BLUR', clientAt: new Date().toISOString() },
    ]).expect(200);
    const rows = (
      await http()
        .get(`/api/manage/exams/${examId}/results`)
        .set(as(instructor))
        .expect(200)
    ).body as {
      attempt: { violationCount: number; sessionTakeovers: number };
    }[];
    expect(rows[0].attempt).toMatchObject({
      violationCount: 1,
      sessionTakeovers: 0,
    });
  });
});
