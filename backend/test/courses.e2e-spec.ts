import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { existsSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

const PASSWORD = 'Password@123';

interface Course {
  id: string;
  slug: string;
  title: string;
  published: boolean;
}
interface Chapter {
  id: string;
  position: number;
}
interface Lesson {
  id: string;
  title: string;
  content: string;
  position: number;
}
interface Attachment {
  id: string;
  fileName: string;
}
interface Outline extends Course {
  chapters: { id: string; lessons: Record<string, unknown>[] }[];
}

describe('Courses (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const uploadDir = mkdtempSync(join(tmpdir(), 'hton-upload-'));
  const emails: string[] = [];
  let instructor: string;
  let otherInstructor: string;
  let student: string;

  const http = () => request(app.getHttpServer());
  const as = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function userToken(role: Role): Promise<string> {
    const email = `course-${randomUUID()}@e2e.local`;
    emails.push(email);
    await prisma.user.create({
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
    return (res.body as { accessToken: string }).accessToken;
  }

  async function createCourse(title = 'Lập trình Web cơ bản') {
    const res = await http()
      .post('/api/manage/courses')
      .set(as(instructor))
      .send({ title, description: 'Mô tả' })
      .expect(201);
    return res.body as Course;
  }

  async function addChapter(courseId: string, title = 'Chương 1') {
    const res = await http()
      .post(`/api/manage/courses/${courseId}/chapters`)
      .set(as(instructor))
      .send({ title })
      .expect(201);
    return res.body as Chapter;
  }

  async function addLesson(chapterId: string, title = 'Bài đọc') {
    const res = await http()
      .post(`/api/manage/chapters/${chapterId}/lessons`)
      .set(as(instructor))
      .send({ type: 'READING', title, content: '# Nội dung bí mật' })
      .expect(201);
    return res.body as Lesson;
  }

  beforeAll(async () => {
    process.env.UPLOAD_DIR = uploadDir;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);

    instructor = await userToken(Role.INSTRUCTOR);
    otherInstructor = await userToken(Role.INSTRUCTOR);
    student = await userToken(Role.STUDENT);
  });

  afterAll(async () => {
    await prisma.course.deleteMany({
      where: { instructor: { email: { in: emails } } },
    });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
    rmSync(uploadDir, { recursive: true, force: true });
  });

  it('tạo khóa học sinh slug không dấu và không trùng', async () => {
    const a = await createCourse('Đại số tuyến tính');
    const b = await createCourse('Đại số tuyến tính');
    expect(a.slug).toBe('dai-so-tuyen-tinh');
    expect(b.slug).toMatch(/^dai-so-tuyen-tinh-[0-9a-f]{6}$/);
    expect(a.published).toBe(false);
  });

  it('học viên không được dùng API quản lý', async () => {
    await http().get('/api/manage/courses').set(as(student)).expect(403);
    await http()
      .post('/api/manage/courses')
      .set(as(student))
      .send({ title: 'X' })
      .expect(403);
  });

  it('giảng viên khác không sửa được khóa học không phải của mình', async () => {
    const course = await createCourse();
    const chapter = await addChapter(course.id);
    const lesson = await addLesson(chapter.id);

    await http()
      .patch(`/api/manage/courses/${course.id}`)
      .set(as(otherInstructor))
      .send({ title: 'Chiếm' })
      .expect(403);
    await http()
      .post(`/api/manage/courses/${course.id}/chapters`)
      .set(as(otherInstructor))
      .send({ title: 'X' })
      .expect(403);
    await http()
      .delete(`/api/manage/lessons/${lesson.id}`)
      .set(as(otherInstructor))
      .expect(403);

    const mine = await http()
      .get('/api/manage/courses')
      .set(as(otherInstructor))
      .expect(200);
    expect(mine.body).toEqual([]);
  });

  it('không công bố được khóa học rỗng; khóa nháp không hiện ở danh mục', async () => {
    const course = await createCourse('Khóa nháp e2e');
    await http()
      .patch(`/api/manage/courses/${course.id}`)
      .set(as(instructor))
      .send({ published: true })
      .expect(400);

    await http().get(`/api/courses/${course.slug}`).expect(404);
    await http()
      .get(`/api/courses/${course.slug}`)
      .set(as(student))
      .expect(404);
    // Chủ khóa học xem trước được bản nháp
    await http()
      .get(`/api/courses/${course.slug}`)
      .set(as(instructor))
      .expect(200);

    const list = await http()
      .get('/api/courses')
      .query({ q: 'Khóa nháp e2e' })
      .expect(200);
    expect((list.body as { total: number }).total).toBe(0);
  });

  it('khóa đã công bố: danh mục tìm được, mục lục không lộ nội dung bài', async () => {
    const title = `Công bố ${randomUUID()}`;
    const course = await createCourse(title);
    const chapter = await addChapter(course.id);
    const lesson = await addLesson(chapter.id);
    await http()
      .patch(`/api/manage/courses/${course.id}`)
      .set(as(instructor))
      .send({ published: true })
      .expect(200);

    const list = await http()
      .get('/api/courses')
      .query({ q: title.toUpperCase() })
      .expect(200);
    expect(list.body).toMatchObject({
      total: 1,
      items: [{ id: course.id, lessonCount: 1 }],
    });

    const outline = (
      await http().get(`/api/courses/${course.slug}`).expect(200)
    ).body as Outline;
    expect(outline.chapters[0].lessons[0]).toMatchObject({ id: lesson.id });
    expect(outline.chapters[0].lessons[0].content).toBeUndefined();

    await http().get(`/api/lessons/${lesson.id}`).expect(401);
    // Chưa ghi danh thì chưa xem được nội dung
    await http().get(`/api/lessons/${lesson.id}`).set(as(student)).expect(403);
    await http()
      .post(`/api/courses/${course.id}/enroll`)
      .set(as(student))
      .expect(201);
    const full = await http()
      .get(`/api/lessons/${lesson.id}`)
      .set(as(student))
      .expect(200);
    expect((full.body as Lesson).content).toBe('# Nội dung bí mật');
  });

  it('bài video bắt buộc có videoUrl', async () => {
    const course = await createCourse();
    const chapter = await addChapter(course.id);
    await http()
      .post(`/api/manage/chapters/${chapter.id}/lessons`)
      .set(as(instructor))
      .send({ type: 'VIDEO', title: 'Video' })
      .expect(400);
    await http()
      .post(`/api/manage/chapters/${chapter.id}/lessons`)
      .set(as(instructor))
      .send({ type: 'VIDEO', title: 'Video', videoUrl: 'javascript:alert(1)' })
      .expect(400);
    await http()
      .post(`/api/manage/chapters/${chapter.id}/lessons`)
      .set(as(instructor))
      .send({
        type: 'VIDEO',
        title: 'Video',
        videoUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      })
      .expect(201);
  });

  it('sắp xếp lại chương và bài học', async () => {
    const course = await createCourse();
    const c1 = await addChapter(course.id, 'C1');
    const c2 = await addChapter(course.id, 'C2');
    const l1 = await addLesson(c1.id, 'L1');
    const l2 = await addLesson(c1.id, 'L2');

    await http()
      .put(`/api/manage/courses/${course.id}/chapter-order`)
      .set(as(instructor))
      .send({ ids: [c1.id] })
      .expect(400);
    await http()
      .put(`/api/manage/courses/${course.id}/chapter-order`)
      .set(as(instructor))
      .send({ ids: [c2.id, c1.id] })
      .expect(204);
    await http()
      .put(`/api/manage/chapters/${c1.id}/lesson-order`)
      .set(as(instructor))
      .send({ ids: [l2.id, l1.id] })
      .expect(204);

    const tree = (
      await http()
        .get(`/api/manage/courses/${course.id}`)
        .set(as(instructor))
        .expect(200)
    ).body as { chapters: { id: string; lessons: { id: string }[] }[] };
    expect(tree.chapters.map((c) => c.id)).toEqual([c2.id, c1.id]);
    expect(tree.chapters[1].lessons.map((l) => l.id)).toEqual([l2.id, l1.id]);
  });

  it('upload, tải và xóa tài liệu đính kèm', async () => {
    const course = await createCourse();
    const chapter = await addChapter(course.id);
    const lesson = await addLesson(chapter.id);

    await http()
      .post(`/api/manage/lessons/${lesson.id}/attachments`)
      .set(as(instructor))
      .attach('file', Buffer.from('MZ'), 'virus.exe')
      .expect(400);

    const up = await http()
      .post(`/api/manage/lessons/${lesson.id}/attachments`)
      .set(as(instructor))
      .attach('file', Buffer.from('xin chào'), 'Bài giảng 1.txt')
      .expect(201);
    const attachment = up.body as Attachment;
    expect(attachment.fileName).toBe('Bài giảng 1.txt');
    expect(readdirSync(uploadDir)).toHaveLength(1);

    // Khóa chưa công bố: học viên không tải được, chủ khóa thì được
    await http()
      .get(`/api/attachments/${attachment.id}/download`)
      .set(as(student))
      .expect(404);
    const dl = await http()
      .get(`/api/attachments/${attachment.id}/download`)
      .set(as(instructor))
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((dl.body as Buffer).toString()).toBe('xin chào');
    expect(dl.headers['content-disposition']).toContain(
      encodeURIComponent('Bài giảng 1.txt'),
    );

    // Xóa khóa học thì file trên đĩa cũng bị xóa
    await http()
      .delete(`/api/manage/courses/${course.id}`)
      .set(as(instructor))
      .expect(204);
    expect(readdirSync(uploadDir)).toHaveLength(0);
    expect(existsSync(uploadDir)).toBe(true);
  });
});
