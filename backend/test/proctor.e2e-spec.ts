import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { AddressInfo } from 'node:net';
import { io, Socket } from 'socket.io-client';
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
  token: string;
}
interface Row {
  candidateId: string;
  verdict: string;
  attempt: {
    status: string;
    answeredCount: number;
    violationCount: number;
    online: boolean;
  } | null;
}

describe('Proctor realtime (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let baseUrl: string;
  const emails: string[] = [];
  const sockets: Socket[] = [];
  let instructor: User;
  let otherInstructor: User;
  let student: User;
  let examId: string;
  let candidateId: string;
  const session = randomUUID();

  const http = () => request(app.getHttpServer());
  const as = (u: User) => ({ Authorization: `Bearer ${u.token}` });

  async function createUser(role: Role): Promise<User> {
    const email = `proctor-${randomUUID()}@e2e.local`;
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

  function connect(token?: string): Socket {
    const s = io(`${baseUrl}/proctor`, {
      auth: token ? { token } : {},
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(s);
    return s;
  }

  const connected = (s: Socket) =>
    new Promise<void>((resolve, reject) => {
      s.once('connect', () => resolve());
      s.once('connect_error', (e) => reject(e));
    });

  const join = (s: Socket) =>
    s.emitWithAck('join', { examId }) as Promise<{ ok: boolean; rows?: Row[] }>;

  /** Chờ một cập nhật thỏa điều kiện */
  const nextUpdate = (s: Socket, match: (r: Row) => boolean) =>
    new Promise<Row>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Không nhận được cập nhật')),
        8000,
      );
      const handler = (r: Row) => {
        if (!match(r)) return;
        clearTimeout(timer);
        s.off('candidate:update', handler);
        resolve(r);
      };
      s.on('candidate:update', handler);
    });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.listen(0);
    const server = app.getHttpServer() as unknown as Server;
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
    prisma = app.get(PrismaService);

    instructor = await createUser(Role.INSTRUCTOR);
    otherInstructor = await createUser(Role.INSTRUCTOR);
    student = await createUser(Role.STUDENT);
    const course = await prisma.course.create({
      data: {
        slug: `proctor-${randomUUID()}`,
        title: 'Giám thị',
        instructorId: instructor.id,
        topics: { create: { name: 'A' } },
      },
      include: { topics: true },
    });
    const topicId = course.topics[0].id;
    await prisma.question.create({
      data: {
        courseId: course.id,
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
    const exam = await prisma.exam.create({
      data: {
        courseId: course.id,
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
    examId = exam.id;
    candidateId = exam.candidates[0].id;
  });

  afterAll(async () => {
    sockets.forEach((s) => s.disconnect());
    await prisma.course.deleteMany({ where: { instructorId: instructor.id } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('từ chối kết nối không có token hoặc của học viên', async () => {
    await expect(connected(connect())).rejects.toThrow('Chưa đăng nhập');
    await expect(connected(connect(student.token))).rejects.toThrow(
      'Không có quyền giám thị',
    );
  });

  it('giảng viên khác kết nối được nhưng không vào được phòng kỳ thi', async () => {
    const s = connect(otherInstructor.token);
    await connected(s);
    expect((await join(s)).ok).toBe(false);
  });

  it('nhận cập nhật realtime khi thí sinh vào thi, lưu bài, vi phạm và bị phân xử', async () => {
    const s = connect(instructor.token);
    await connected(s);
    const joined = await join(s);
    expect(joined.ok).toBe(true);
    expect(joined.rows?.[0]).toMatchObject({ candidateId, attempt: null });

    // Vào thi
    const started = nextUpdate(s, (r) => r.attempt?.status === 'IN_PROGRESS');
    const view = (
      await http()
        .post(`/api/exams/${examId}/start`)
        .set(as(student))
        .send({ sessionId: session })
        .expect(200)
    ).body as {
      questions: { questionId: string; options: { id: string }[] }[];
    };
    expect((await started).attempt?.online).toBe(false);

    // Lưu bài: online và số câu đã làm
    const saved = nextUpdate(s, (r) => r.attempt?.answeredCount === 1);
    const q = view.questions[0];
    await http()
      .put(`/api/exams/${examId}/attempt/answers`)
      .set(as(student))
      .send({
        sessionId: session,
        answers: [
          {
            questionId: q.questionId,
            selectedOptionIds: [q.options[0].id],
            clientSavedAt: new Date().toISOString(),
          },
        ],
      })
      .expect(200);
    expect((await saved).attempt?.online).toBe(true);

    // Vi phạm
    const violated = nextUpdate(s, (r) => r.attempt?.violationCount === 1);
    await http()
      .post(`/api/exams/${examId}/attempt/events`)
      .set(as(student))
      .send({
        sessionId: session,
        events: [{ type: 'TAB_HIDDEN', clientAt: new Date().toISOString() }],
      })
      .expect(200);
    await violated;

    // Phân xử vi phạm: buộc nộp bài, thí sinh không vào lại được
    const flagged = nextUpdate(
      s,
      (r) => r.verdict === 'VIOLATION' && r.attempt?.status !== 'IN_PROGRESS',
    );
    await http()
      .patch(`/api/manage/exams/${examId}/candidates/${candidateId}/verdict`)
      .set(as(instructor))
      .send({ verdict: 'VIOLATION', note: 'Dùng tài liệu' })
      .expect(200);
    await flagged;
    await http()
      .get(`/api/exams/${examId}/attempt`)
      .set(as(student))
      .expect(403);

    await http()
      .patch(`/api/manage/exams/${examId}/candidates/${candidateId}/verdict`)
      .set(as(otherInstructor))
      .send({ verdict: 'VALID' })
      .expect(403);
  });
});
