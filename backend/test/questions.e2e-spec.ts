import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { Workbook } from 'exceljs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { LessonType, Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { IMPORT_COLUMNS } from '../src/questions/excel-import';
import { setupApp } from '../src/setup-app';

const PASSWORD = 'Password@123';

interface User {
  id: string;
  token: string;
}
interface Topic {
  id: string;
  name: string;
  questionCount?: number;
}
interface Option {
  id: string;
  content: string;
  isCorrect: boolean;
}
interface Question {
  id: string;
  type: string;
  topic: { id: string; name: string };
  lesson: { id: string } | null;
  source: string;
  options: Option[];
}
interface ImportResult {
  created: number;
  createdTopics: string[];
  errors: { row: number; message: string }[];
}

describe('Question bank (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const emails: string[] = [];
  let instructor: User;
  let otherInstructor: User;
  let student: User;
  let courseId: string;
  let lessonId: string;

  const http = () => request(app.getHttpServer());
  const as = (u: User) => ({ Authorization: `Bearer ${u.token}` });

  async function createUser(role: Role): Promise<User> {
    const email = `qb-${randomUUID()}@e2e.local`;
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

  async function createTopic(name: string, cId = courseId) {
    const res = await http()
      .post(`/api/manage/courses/${cId}/topics`)
      .set(as(instructor))
      .send({ name })
      .expect(201);
    return res.body as Topic;
  }

  const single = (topicId: string, extra: object = {}) => ({
    topicId,
    type: 'SINGLE',
    difficulty: 'EASY',
    content: 'Thủ đô Việt Nam?',
    options: [
      { content: 'Hà Nội', isCorrect: true },
      { content: 'Huế', isCorrect: false },
    ],
    ...extra,
  });

  async function xlsx(rows: string[][]): Promise<Buffer> {
    const wb = new Workbook();
    const sheet = wb.addWorksheet('Câu hỏi');
    sheet.addRow([...IMPORT_COLUMNS]);
    rows.forEach((r) => sheet.addRow(r));
    return Buffer.from(await wb.xlsx.writeBuffer());
  }

  /** Dòng Excel: chủ đề, loại, độ khó, câu hỏi, A-F, đáp án đúng, giải thích */
  const excelRow = (
    topic: string,
    type: string,
    content: string,
    options: string[],
    answer: string,
  ) => [
    topic,
    type,
    'Dễ',
    content,
    ...Array.from({ length: 6 }, (_, i) => options[i] ?? ''),
    answer,
    '',
  ];

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
        slug: `qb-${randomUUID()}`,
        title: 'Ngân hàng câu hỏi',
        instructorId: instructor.id,
        chapters: {
          create: {
            title: 'C',
            position: 0,
            lessons: {
              create: { type: LessonType.READING, title: 'L', position: 0 },
            },
          },
        },
      },
      include: { chapters: { include: { lessons: true } } },
    });
    courseId = course.id;
    lessonId = course.chapters[0].lessons[0].id;
  });

  afterAll(async () => {
    await prisma.course.deleteMany({
      where: { instructorId: { in: [instructor.id, otherInstructor.id] } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('chủ đề: không trùng tên, không xóa khi còn câu hỏi', async () => {
    const topic = await createTopic('Mảng');
    await http()
      .post(`/api/manage/courses/${courseId}/topics`)
      .set(as(instructor))
      .send({ name: 'Mảng' })
      .expect(409);

    await http()
      .post(`/api/manage/courses/${courseId}/questions`)
      .set(as(instructor))
      .send(single(topic.id))
      .expect(201);
    await http()
      .delete(`/api/manage/topics/${topic.id}`)
      .set(as(instructor))
      .expect(400);

    const empty = await createTopic('Chủ đề rỗng');
    await http()
      .delete(`/api/manage/topics/${empty.id}`)
      .set(as(instructor))
      .expect(204);
  });

  it('học viên và giảng viên khác không vào được ngân hàng câu hỏi', async () => {
    await http()
      .get(`/api/manage/courses/${courseId}/questions`)
      .set(as(student))
      .expect(403);
    await http()
      .get(`/api/manage/courses/${courseId}/questions`)
      .set(as(otherInstructor))
      .expect(403);
    await http()
      .post(`/api/manage/courses/${courseId}/topics`)
      .set(as(otherInstructor))
      .send({ name: 'X' })
      .expect(403);
  });

  it('kiểm tra đáp án theo loại câu hỏi', async () => {
    const topic = await createTopic(`Luật ${randomUUID()}`);
    const post = (body: object) =>
      http()
        .post(`/api/manage/courses/${courseId}/questions`)
        .set(as(instructor))
        .send(body);

    await post(
      single(topic.id, {
        options: [
          { content: 'A', isCorrect: true },
          { content: 'B', isCorrect: true },
        ],
      }),
    ).expect(400);
    await post(
      single(topic.id, {
        type: 'MULTIPLE',
        options: [
          { content: 'A', isCorrect: false },
          { content: 'B', isCorrect: false },
        ],
      }),
    ).expect(400);
    await post(
      single(topic.id, {
        type: 'TRUE_FALSE',
        options: [
          { content: 'Đúng', isCorrect: true },
          { content: 'Sai', isCorrect: false },
          { content: 'Không rõ', isCorrect: false },
        ],
      }),
    ).expect(400);
    await post(single(topic.id, { difficulty: 'IMPOSSIBLE' })).expect(400);
  });

  it('chủ đề và bài học phải cùng khóa học', async () => {
    const other = await prisma.course.create({
      data: {
        slug: `qb-other-${randomUUID()}`,
        title: 'Khác',
        instructorId: instructor.id,
      },
    });
    const otherTopic = await createTopic('Ngoài', other.id);
    const topic = await createTopic(`Trong ${randomUUID()}`);

    await http()
      .post(`/api/manage/courses/${courseId}/questions`)
      .set(as(instructor))
      .send(single(otherTopic.id))
      .expect(400);

    const ok = await http()
      .post(`/api/manage/courses/${courseId}/questions`)
      .set(as(instructor))
      .send(single(topic.id, { lessonId }))
      .expect(201);
    expect((ok.body as Question).lesson?.id).toBe(lessonId);
  });

  it('sửa phương án giữ id cũ, thêm mới và xóa phương án bị bỏ', async () => {
    const topic = await createTopic(`Sửa ${randomUUID()}`);
    const created = (
      await http()
        .post(`/api/manage/courses/${courseId}/questions`)
        .set(as(instructor))
        .send(
          single(topic.id, {
            options: [
              { content: 'Hà Nội', isCorrect: true },
              { content: 'Huế', isCorrect: false },
              { content: 'Vinh', isCorrect: false },
            ],
          }),
        )
        .expect(201)
    ).body as Question;
    const [hn, hue] = created.options;

    const updated = (
      await http()
        .patch(`/api/manage/questions/${created.id}`)
        .set(as(instructor))
        .send({
          options: [
            { id: hue.id, content: 'Huế (cố đô)', isCorrect: false },
            { id: hn.id, content: 'Hà Nội', isCorrect: true },
            { content: 'Đà Lạt', isCorrect: false },
          ],
        })
        .expect(200)
    ).body as Question;

    expect(updated.options.map((o) => o.content)).toEqual([
      'Huế (cố đô)',
      'Hà Nội',
      'Đà Lạt',
    ]);
    expect(updated.options[0].id).toBe(hue.id);
    expect(updated.options[1].id).toBe(hn.id);

    // Phương án của câu khác thì bị từ chối
    await http()
      .patch(`/api/manage/questions/${created.id}`)
      .set(as(instructor))
      .send({
        options: [
          { id: randomUUID(), content: 'X', isCorrect: true },
          { content: 'Y', isCorrect: false },
        ],
      })
      .expect(400);

    // Đổi sang nhiều đáp án mà không gửi phương án: vẫn hợp lệ (1 đáp án đúng)
    await http()
      .patch(`/api/manage/questions/${created.id}`)
      .set(as(instructor))
      .send({ type: 'MULTIPLE' })
      .expect(200);
  });

  it('lọc theo chủ đề, độ khó và tìm theo nội dung', async () => {
    const topic = await createTopic(`Lọc ${randomUUID()}`);
    const post = (extra: object) =>
      http()
        .post(`/api/manage/courses/${courseId}/questions`)
        .set(as(instructor))
        .send(single(topic.id, extra))
        .expect(201);
    await post({ content: 'Vòng lặp for', difficulty: 'EASY' });
    await post({ content: 'Vòng lặp while', difficulty: 'HARD' });
    await post({ content: 'Hàm đệ quy', difficulty: 'HARD' });

    const res = await http()
      .get(`/api/manage/courses/${courseId}/questions`)
      .query({ topicId: topic.id, difficulty: 'HARD', q: 'VÒNG LẶP' })
      .set(as(instructor))
      .expect(200);
    expect(res.body).toMatchObject({ total: 1 });
  });

  it('tải được file mẫu .xlsx', async () => {
    const res = await http()
      .get('/api/manage/questions/import-template')
      .set(as(instructor))
      .buffer(true)
      .parse((r, cb) => {
        const chunks: Buffer[] = [];
        r.on('data', (c: Buffer) => chunks.push(c));
        r.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    const wb = new Workbook();
    await wb.xlsx.load(res.body as ArrayBuffer);
    expect(wb.worksheets[0].getRow(1).getCell(1).value).toBe('Chủ đề');
  });

  it('import Excel: có dòng lỗi thì không nhập gì và báo đúng số dòng', async () => {
    const before = await prisma.question.count({ where: { courseId } });
    const file = await xlsx([
      excelRow('Import lỗi', '1 đáp án', 'Câu đúng', ['A1', 'B1'], 'A'),
      excelRow('Import lỗi', '1 đáp án', 'Câu sai', ['A2', 'B2'], 'A,B'),
      [],
      excelRow('Import lỗi', 'tự luận', 'Câu sai 2', ['A3', 'B3'], 'A'),
    ]);
    const res = await http()
      .post(`/api/manage/courses/${courseId}/questions/import`)
      .set(as(instructor))
      .attach('file', file, 'cau-hoi.xlsx')
      .expect(201);
    const body = res.body as ImportResult;
    expect(body.created).toBe(0);
    expect(body.errors.map((e) => e.row)).toEqual([3, 5]);
    expect(await prisma.question.count({ where: { courseId } })).toBe(before);
    expect(
      await prisma.topic.count({ where: { courseId, name: 'Import lỗi' } }),
    ).toBe(0);
  });

  it('import Excel hợp lệ: tạo câu hỏi, tự tạo chủ đề mới, khớp chủ đề cũ', async () => {
    await createTopic('Có sẵn');
    const topicName = `Mới ${randomUUID().slice(0, 8)}`;
    const file = await xlsx([
      excelRow('có sẵn', '1 đáp án', 'Câu 1', ['A', 'B', 'C'], 'B'),
      excelRow(topicName, 'Nhiều đáp án', 'Câu 2', ['A', 'B', 'C'], 'A, C'),
      excelRow(topicName, 'Đúng/Sai', 'Câu 3', [], 'Đúng'),
    ]);
    const res = await http()
      .post(`/api/manage/courses/${courseId}/questions/import`)
      .set(as(instructor))
      .attach('file', file, 'cau-hoi.xlsx')
      .expect(201);
    expect(res.body).toEqual({
      created: 3,
      createdTopics: [topicName],
      errors: [],
    });

    const topics = (
      await http()
        .get(`/api/manage/courses/${courseId}/topics`)
        .set(as(instructor))
        .expect(200)
    ).body as Topic[];
    expect(topics.find((t) => t.name === 'Có sẵn')?.questionCount).toBe(1);
    expect(topics.find((t) => t.name === topicName)?.questionCount).toBe(2);

    const tf = await prisma.question.findFirstOrThrow({
      where: { courseId, content: 'Câu 3' },
      include: { options: { orderBy: { position: 'asc' } } },
    });
    expect(tf.source).toBe('IMPORT');
    expect(tf.options.map((o) => [o.content, o.isCorrect])).toEqual([
      ['Đúng', true],
      ['Sai', false],
    ]);
  });

  it('import từ chối file không phải .xlsx hoặc hỏng', async () => {
    await http()
      .post(`/api/manage/courses/${courseId}/questions/import`)
      .set(as(instructor))
      .attach('file', Buffer.from('a,b'), 'cau-hoi.csv')
      .expect(400);
    await http()
      .post(`/api/manage/courses/${courseId}/questions/import`)
      .set(as(instructor))
      .attach('file', Buffer.from('không phải excel'), 'cau-hoi.xlsx')
      .expect(400);
  });

  it('xóa khóa học thì xóa cả chủ đề và câu hỏi', async () => {
    const course = await prisma.course.create({
      data: {
        slug: `qb-del-${randomUUID()}`,
        title: 'Xóa',
        instructorId: instructor.id,
      },
    });
    const topic = await createTopic('T', course.id);
    await http()
      .post(`/api/manage/courses/${course.id}/questions`)
      .set(as(instructor))
      .send(single(topic.id))
      .expect(201);

    await http()
      .delete(`/api/manage/courses/${course.id}`)
      .set(as(instructor))
      .expect(204);
    expect(await prisma.topic.count({ where: { courseId: course.id } })).toBe(
      0,
    );
  });
});
