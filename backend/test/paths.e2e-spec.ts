import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { LessonType, Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

const PASSWORD = 'Password@123';

interface User {
  id: string;
  token: string;
}
interface PathBody {
  id: string;
  slug: string;
}
interface PathDetail {
  canManage: boolean;
  progressPercent: number | null;
  courses: {
    id: string;
    enrolled: boolean;
    progressPercent: number;
  }[];
}

describe('Learning paths (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const emails: string[] = [];
  let instructor: User;
  let otherInstructor: User;
  let admin: User;
  let student: User;

  const http = () => request(app.getHttpServer());
  const as = (u: User) => ({ Authorization: `Bearer ${u.token}` });

  async function createUser(role: Role): Promise<User> {
    const email = `path-${randomUUID()}@e2e.local`;
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

  /** Khóa có 2 bài, trả về id khóa và id các bài. */
  async function createCourse(owner: User, published = true) {
    const course = await prisma.course.create({
      data: {
        slug: `path-course-${randomUUID()}`,
        title: 'Khóa',
        instructorId: owner.id,
        published,
        chapters: {
          create: {
            title: 'C',
            position: 0,
            lessons: {
              create: [0, 1].map((position) => ({
                type: LessonType.READING,
                title: `L${position}`,
                position,
              })),
            },
          },
        },
      },
      include: { chapters: { include: { lessons: true } } },
    });
    return {
      id: course.id,
      lessons: course.chapters[0].lessons.map((l) => l.id),
    };
  }

  async function createPath(owner: User, title = 'Frontend cơ bản') {
    const res = await http()
      .post('/api/manage/paths')
      .set(as(owner))
      .send({ title })
      .expect(201);
    return res.body as PathBody;
  }

  const setCourses = (owner: User, pathId: string, courseIds: string[]) =>
    http()
      .put(`/api/manage/paths/${pathId}/courses`)
      .set(as(owner))
      .send({ courseIds });

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
    admin = await createUser(Role.ADMIN);
    student = await createUser(Role.STUDENT);
  });

  afterAll(async () => {
    const ids = [instructor, otherInstructor, admin].map((u) => u.id);
    await prisma.learningPath.deleteMany({
      where: { createdById: { in: ids } },
    });
    await prisma.course.deleteMany({ where: { instructorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('học viên không tạo được lộ trình; slug tiếng Việt không dấu', async () => {
    await http()
      .post('/api/manage/paths')
      .set(as(student))
      .send({ title: 'X' })
      .expect(403);
    const path = await createPath(instructor, 'Lập trình Frontend');
    expect(path.slug).toMatch(/^lap-trinh-frontend/);
  });

  it('chỉ thêm được khóa đã công bố hoặc khóa nháp của mình', async () => {
    const path = await createPath(instructor);
    const published = await createCourse(otherInstructor);
    const othersDraft = await createCourse(otherInstructor, false);
    const myDraft = await createCourse(instructor, false);

    await setCourses(instructor, path.id, [
      published.id,
      othersDraft.id,
    ]).expect(400);
    await setCourses(instructor, path.id, [published.id, myDraft.id]).expect(
      200,
    );
    await setCourses(instructor, path.id, [randomUUID()]).expect(400);
  });

  it('người khác không sửa được; admin thì được', async () => {
    const path = await createPath(instructor);
    await http()
      .patch(`/api/manage/paths/${path.id}`)
      .set(as(otherInstructor))
      .send({ title: 'Chiếm' })
      .expect(403);
    await http()
      .patch(`/api/manage/paths/${path.id}`)
      .set(as(admin))
      .send({ title: 'Admin sửa' })
      .expect(200);

    const mine = await http()
      .get('/api/manage/paths')
      .set(as(otherInstructor))
      .expect(200);
    expect(mine.body).toEqual([]);
  });

  it('không công bố lộ trình rỗng; lộ trình nháp bị ẩn', async () => {
    const path = await createPath(instructor);
    await http()
      .patch(`/api/manage/paths/${path.id}`)
      .set(as(instructor))
      .send({ published: true })
      .expect(400);
    await http().get(`/api/paths/${path.slug}`).expect(404);
    await http().get(`/api/paths/${path.slug}`).set(as(instructor)).expect(200);

    const list = (await http().get('/api/paths').expect(200)).body as {
      id: string;
    }[];
    expect(list.find((p) => p.id === path.id)).toBeUndefined();
  });

  it('chi tiết: đúng thứ tự, ẩn khóa nháp, kèm tiến độ người xem', async () => {
    const a = await createCourse(instructor);
    const b = await createCourse(instructor);
    const draft = await createCourse(instructor, false);
    const path = await createPath(instructor);
    await setCourses(instructor, path.id, [b.id, draft.id, a.id]).expect(200);
    await http()
      .patch(`/api/manage/paths/${path.id}`)
      .set(as(instructor))
      .send({ published: true })
      .expect(200);

    const guest = (await http().get(`/api/paths/${path.slug}`).expect(200))
      .body as PathDetail;
    expect(guest.courses.map((c) => c.id)).toEqual([b.id, a.id]);
    expect(guest.progressPercent).toBeNull();

    // Chủ lộ trình thấy cả khóa nháp của mình
    const owner = (
      await http()
        .get(`/api/paths/${path.slug}`)
        .set(as(instructor))
        .expect(200)
    ).body as PathDetail;
    expect(owner.canManage).toBe(true);
    expect(owner.courses.map((c) => c.id)).toEqual([b.id, draft.id, a.id]);

    // Học viên hoàn thành 1/2 bài của khóa b
    await http()
      .post(`/api/courses/${b.id}/enroll`)
      .set(as(student))
      .expect(201);
    await http()
      .put(`/api/lessons/${b.lessons[0]}/progress`)
      .set(as(student))
      .send({ completed: true })
      .expect(200);

    const mine = (
      await http().get(`/api/paths/${path.slug}`).set(as(student)).expect(200)
    ).body as PathDetail;
    expect(mine.courses[0]).toMatchObject({
      id: b.id,
      enrolled: true,
      progressPercent: 50,
    });
    expect(mine.courses[1]).toMatchObject({ enrolled: false });
    expect(mine.progressPercent).toBe(25);
  });

  it('xóa lộ trình không xóa khóa học', async () => {
    const course = await createCourse(instructor);
    const path = await createPath(instructor);
    await setCourses(instructor, path.id, [course.id]).expect(200);
    await http()
      .delete(`/api/manage/paths/${path.id}`)
      .set(as(instructor))
      .expect(204);
    expect(
      await prisma.course.findUnique({ where: { id: course.id } }),
    ).not.toBeNull();
  });
});
