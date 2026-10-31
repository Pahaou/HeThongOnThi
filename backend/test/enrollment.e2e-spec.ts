import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { LessonType, Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

const PASSWORD = 'Password@123';

interface Summary {
  lastLessonId: string | null;
  completedLessonIds: string[];
  totalLessons: number;
  progressPercent: number;
}
interface Detail {
  canManage: boolean;
  enrollment: Summary | null;
}
interface LessonBody {
  progress: { positionSec: number; completed: boolean } | null;
}
interface MyCourse {
  id: string;
  lastLessonId: string | null;
  completedLessons: number;
  totalLessons: number;
  progressPercent: number;
}

describe('Enrollment (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const uploadDir = mkdtempSync(join(tmpdir(), 'hton-enroll-'));
  const emails: string[] = [];
  let instructorId: string;
  let instructor: string;
  let student: string;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createUser(role: Role) {
    const email = `enroll-${randomUUID()}@e2e.local`;
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

  /** Khóa 1 chương, 3 bài; trả về id khóa, slug và id các bài theo thứ tự. */
  async function createCourse(published = true) {
    const slug = `enroll-${randomUUID()}`;
    const course = await prisma.course.create({
      data: {
        slug,
        title: slug,
        instructorId,
        published,
        chapters: {
          create: {
            title: 'C1',
            position: 0,
            lessons: {
              create: [0, 1, 2].map((position) => ({
                type: LessonType.READING,
                title: `L${position}`,
                content: 'nội dung',
                position,
              })),
            },
          },
        },
      },
      include: {
        chapters: { include: { lessons: { orderBy: { position: 'asc' } } } },
      },
    });
    return {
      id: course.id,
      slug,
      lessons: course.chapters[0].lessons.map((l) => l.id),
    };
  }

  const enroll = (courseId: string, token = student) =>
    http().post(`/api/courses/${courseId}/enroll`).set(as(token));
  const progress = (lessonId: string, body: object, token = student) =>
    http().put(`/api/lessons/${lessonId}/progress`).set(as(token)).send(body);

  beforeAll(async () => {
    process.env.UPLOAD_DIR = uploadDir;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    const inst = await createUser(Role.INSTRUCTOR);
    instructorId = inst.id;
    instructor = inst.token;
    student = (await createUser(Role.STUDENT)).token;
  });

  afterAll(async () => {
    await prisma.course.deleteMany({ where: { instructorId } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
    rmSync(uploadDir, { recursive: true, force: true });
  });

  it('ghi danh: khóa nháp trả 404, gọi lại nhiều lần vẫn một bản ghi', async () => {
    const draft = await createCourse(false);
    await enroll(draft.id).expect(404);

    const course = await createCourse();
    const before = (
      await http()
        .get(`/api/courses/${course.slug}`)
        .set(as(student))
        .expect(200)
    ).body as Detail;
    expect(before).toMatchObject({ canManage: false, enrollment: null });

    const first = (await enroll(course.id).expect(201)).body as Summary;
    expect(first).toMatchObject({ totalLessons: 3, progressPercent: 0 });
    await enroll(course.id).expect(201);
    expect(
      await prisma.enrollment.count({ where: { courseId: course.id } }),
    ).toBe(1);

    const after = (
      await http()
        .get(`/api/courses/${course.slug}`)
        .set(as(student))
        .expect(200)
    ).body as Detail;
    expect(after.enrollment).toMatchObject({ totalLessons: 3 });
  });

  it('lưu tiến độ cần ghi danh trước', async () => {
    const course = await createCourse();
    await progress(course.lessons[0], { completed: true }).expect(403);
  });

  it('đánh dấu hoàn thành, lưu vị trí, bài gần nhất và phần trăm', async () => {
    const course = await createCourse();
    const [l0, l1] = course.lessons;
    await enroll(course.id).expect(201);

    // Mở bài (body rỗng) thì cập nhật bài gần nhất, chưa tính hoàn thành
    await progress(l1, {}).expect(200);
    await progress(l1, { positionSec: 95 }).expect(200);
    const opened = (
      await http().get(`/api/lessons/${l1}`).set(as(student)).expect(200)
    ).body as LessonBody;
    expect(opened.progress).toEqual({ positionSec: 95, completed: false });

    await progress(l0, { completed: true }).expect(200);
    const firstDone = await prisma.lessonProgress.findFirstOrThrow({
      where: { lessonId: l0 },
    });
    // Đánh dấu lại không đổi mốc hoàn thành đầu tiên
    await progress(l0, { completed: true, positionSec: 10 }).expect(200);
    const again = await prisma.lessonProgress.findFirstOrThrow({
      where: { lessonId: l0 },
    });
    expect(again.completedAt).toEqual(firstDone.completedAt);

    const detail = (
      await http()
        .get(`/api/courses/${course.slug}`)
        .set(as(student))
        .expect(200)
    ).body as Detail;
    expect(detail.enrollment).toMatchObject({
      lastLessonId: l0,
      completedLessonIds: [l0],
      progressPercent: 33,
    });

    // Bỏ đánh dấu
    await progress(l0, { completed: false }).expect(200);
    const undone = (
      await http()
        .get(`/api/courses/${course.slug}`)
        .set(as(student))
        .expect(200)
    ).body as Detail;
    expect(undone.enrollment?.progressPercent).toBe(0);

    await progress(l0, { positionSec: -1 }).expect(400);
  });

  it('khóa học của tôi: phần trăm, bài gần nhất, xóa bài thì tính lại', async () => {
    const course = await createCourse();
    const [l0, l1, l2] = course.lessons;
    await enroll(course.id).expect(201);
    await progress(l0, { completed: true }).expect(200);
    await progress(l1, { completed: true }).expect(200);

    let mine = (
      await http().get('/api/me/courses').set(as(student)).expect(200)
    ).body as MyCourse[];
    // Khóa vừa học xếp đầu danh sách
    expect(mine[0]).toMatchObject({
      id: course.id,
      lastLessonId: l1,
      completedLessons: 2,
      totalLessons: 3,
      progressPercent: 67,
    });

    await http()
      .delete(`/api/manage/lessons/${l2}`)
      .set(as(instructor))
      .expect(204);
    mine = (await http().get('/api/me/courses').set(as(student)).expect(200))
      .body as MyCourse[];
    expect(mine[0]).toMatchObject({ totalLessons: 2, progressPercent: 100 });
  });

  it('tài liệu đính kèm chỉ tải được sau khi ghi danh', async () => {
    const course = await createCourse();
    const up = await http()
      .post(`/api/manage/lessons/${course.lessons[0]}/attachments`)
      .set(as(instructor))
      .attach('file', Buffer.from('abc'), 'tai-lieu.txt')
      .expect(201);
    const id = (up.body as { id: string }).id;

    await http()
      .get(`/api/attachments/${id}/download`)
      .set(as(student))
      .expect(403);
    await enroll(course.id).expect(201);
    await http()
      .get(`/api/attachments/${id}/download`)
      .set(as(student))
      .expect(200);
  });

  it('chủ khóa học xem bài không cần ghi danh nhưng không có tiến độ', async () => {
    const course = await createCourse(false);
    const lesson = (
      await http()
        .get(`/api/lessons/${course.lessons[0]}`)
        .set(as(instructor))
        .expect(200)
    ).body as LessonBody;
    expect(lesson.progress).toBeNull();

    const detail = (
      await http()
        .get(`/api/courses/${course.slug}`)
        .set(as(instructor))
        .expect(200)
    ).body as Detail;
    expect(detail).toMatchObject({ canManage: true, enrollment: null });

    await progress(course.lessons[0], { completed: true }, instructor).expect(
      403,
    );
  });
});
