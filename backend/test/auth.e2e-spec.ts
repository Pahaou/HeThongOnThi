import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { Role } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import { setupApp } from '../src/setup-app';

const PASSWORD = 'Password@123';

interface AuthBody {
  accessToken: string;
  user: { id: string; email: string; role: string; passwordHash?: string };
}

function setCookies(res: request.Response): string[] {
  return (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
}

function refreshCookie(res: request.Response): string {
  const cookie = setCookies(res).find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('Không có cookie refresh_token');
  return cookie.split(';')[0];
}

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const emails: string[] = [];
  const newEmail = () => {
    const email = `test-${randomUUID()}@e2e.local`;
    emails.push(email);
    return email;
  };
  const http = () => request(app.getHttpServer());
  const register = async (email = newEmail()) => {
    const res = await http()
      .post('/api/auth/register')
      .send({ email, password: PASSWORD, fullName: 'Học viên' })
      .expect(201);
    return { res, body: res.body as AuthBody };
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    setupApp(app);
    await app.init();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('đăng ký trả access token, cookie httpOnly và không lộ passwordHash', async () => {
    const email = newEmail();
    const { res, body } = await register(email);

    expect(body.accessToken).toEqual(expect.any(String));
    expect(body.user).toMatchObject({ email, role: 'STUDENT' });
    expect(body.user.passwordHash).toBeUndefined();
    const raw = setCookies(res).join(';');
    expect(raw).toMatch(/HttpOnly/i);
    expect(raw).toMatch(/Path=\/api\/auth/);
  });

  it('không cho đăng ký trùng email và không cho tự chọn role', async () => {
    const email = newEmail();
    await register(email);
    await http()
      .post('/api/auth/register')
      .send({ email: email.toUpperCase(), password: PASSWORD, fullName: 'A' })
      .expect(409);
    await http()
      .post('/api/auth/register')
      .send({
        email: newEmail(),
        password: PASSWORD,
        fullName: 'A',
        role: 'ADMIN',
      })
      .expect(400);
  });

  it('sai mật khẩu và email không tồn tại trả cùng một lỗi 401', async () => {
    const email = newEmail();
    await register(email);

    const wrongPass = await http()
      .post('/api/auth/login')
      .send({ email, password: 'sai-mat-khau' })
      .expect(401);
    const noUser = await http()
      .post('/api/auth/login')
      .send({ email: `none-${randomUUID()}@e2e.local`, password: PASSWORD })
      .expect(401);
    expect((wrongPass.body as { message: string }).message).toBe(
      (noUser.body as { message: string }).message,
    );
  });

  it('/me cần access token hợp lệ', async () => {
    const email = newEmail();
    const { body } = await register(email);

    await http().get('/api/auth/me').expect(401);
    await http()
      .get('/api/auth/me')
      .set('Authorization', 'Bearer khong-hop-le')
      .expect(401);
    const me = await http()
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${body.accessToken}`)
      .expect(200);
    expect((me.body as AuthBody['user']).email).toBe(email);
  });

  it('refresh xoay vòng token; dùng lại token cũ thì thu hồi cả chuỗi', async () => {
    const { res } = await register();
    const first = refreshCookie(res);

    const r1 = await http()
      .post('/api/auth/refresh')
      .set('Cookie', first)
      .expect(200);
    const second = refreshCookie(r1);
    expect(second).not.toBe(first);
    expect((r1.body as AuthBody).accessToken).toEqual(expect.any(String));

    // Kẻ gian dùng lại token đầu tiên thì bị từ chối...
    await http().post('/api/auth/refresh').set('Cookie', first).expect(401);
    // ...và token hợp lệ của người dùng thật cũng bị thu hồi theo
    await http().post('/api/auth/refresh').set('Cookie', second).expect(401);
  });

  it('logout thu hồi refresh token', async () => {
    const { res } = await register();
    const cookie = refreshCookie(res);

    await http().post('/api/auth/logout').set('Cookie', cookie).expect(204);
    await http().post('/api/auth/refresh').set('Cookie', cookie).expect(401);
  });

  it('chỉ admin được xem danh sách và đổi vai trò người dùng', async () => {
    const adminEmail = newEmail();
    await prisma.user.create({
      data: {
        email: adminEmail,
        fullName: 'Admin',
        role: Role.ADMIN,
        passwordHash: await bcrypt.hash(PASSWORD, 4),
      },
    });
    const adminRes = await http()
      .post('/api/auth/login')
      .send({ email: adminEmail, password: PASSWORD })
      .expect(200);
    const admin = adminRes.body as AuthBody;
    const { body: student } = await register();

    const asAdmin = `Bearer ${admin.accessToken}`;
    const asStudent = `Bearer ${student.accessToken}`;

    await http().get('/api/users').set('Authorization', asStudent).expect(403);
    await http().get('/api/users').set('Authorization', asAdmin).expect(200);

    const updated = await http()
      .patch(`/api/users/${student.user.id}/role`)
      .set('Authorization', asAdmin)
      .send({ role: 'INSTRUCTOR' })
      .expect(200);
    expect((updated.body as AuthBody['user']).role).toBe('INSTRUCTOR');

    await http()
      .patch(`/api/users/${admin.user.id}/role`)
      .set('Authorization', asAdmin)
      .send({ role: 'STUDENT' })
      .expect(400);
  });
});
