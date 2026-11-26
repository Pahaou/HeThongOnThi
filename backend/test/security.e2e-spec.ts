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

interface User {
  id: string;
  token: string;
}

describe('Security review (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const emails: string[] = [];
  let studentA: User;
  let studentB: User;

  const http = () => request(app.getHttpServer());
  const as = (u: User | string) => ({
    Authorization: `Bearer ${typeof u === 'string' ? u : u.token}`,
  });

  async function createUser(role: Role): Promise<User> {
    const email = `sec-${randomUUID()}@e2e.local`;
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    // Như production: một reverse proxy (Caddy) đứng trước backend
    process.env.TRUST_PROXY = '1';
    setupApp(app);
    delete process.env.TRUST_PROXY;
    await app.init();
    prisma = app.get(PrismaService);
    studentA = await createUser(Role.STUDENT);
    studentB = await createUser(Role.STUDENT);
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('có header bảo mật (helmet)', async () => {
    const res = await http().get('/api/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('SAMEORIGIN');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('từ chối token bị sửa hoặc alg "none"', async () => {
    const [header, payload, signature] = studentA.token.split('.');
    const claims = JSON.parse(
      Buffer.from(payload, 'base64url').toString(),
    ) as Record<string, unknown>;
    // Tự nâng quyền lên ADMIN nhưng giữ chữ ký cũ
    const forged = Buffer.from(
      JSON.stringify({ ...claims, role: 'ADMIN' }),
    ).toString('base64url');
    await http()
      .get('/api/users')
      .set(as(`${header}.${forged}.${signature}`))
      .expect(401);
    const none = Buffer.from(
      JSON.stringify({ alg: 'none', typ: 'JWT' }),
    ).toString('base64url');
    await http()
      .get('/api/auth/me')
      .set(as(`${none}.${forged}.`))
      .expect(401);
  });

  it('rate limit tính theo người dùng: hai học viên cùng IP không chặn nhau', async () => {
    // Nhóm API AI giới hạn 10 lần/phút mỗi người
    for (let i = 0; i < 10; i++) {
      await http().get('/api/ai/status').set(as(studentA)).expect(200);
    }
    await http().get('/api/ai/status').set(as(studentA)).expect(429);
    await http().get('/api/ai/status').set(as(studentB)).expect(200);
  });

  it('sau reverse proxy, giới hạn đăng nhập tính theo IP thật của từng người', async () => {
    const login = (ip: string) =>
      http()
        .post('/api/auth/login')
        .set('X-Forwarded-For', ip)
        .send({ email: 'khong-co@e2e.local', password: 'Sai@12345' });
    for (let i = 0; i < 10; i++) await login('203.0.113.1').expect(401);
    await login('203.0.113.1').expect(429);
    // Người khác sau cùng proxy không bị chặn theo
    await login('203.0.113.2').expect(401);
  });

  it('cả phòng thi chung một IP (NAT) vẫn đăng nhập được; dò mật khẩu một tài khoản vẫn bị chặn', async () => {
    const login = (email: string) =>
      http()
        .post('/api/auth/login')
        .set('X-Forwarded-For', '198.51.100.7')
        .send({ email, password: 'Sai@12345' });
    for (let i = 0; i < 10; i++) await login('nan-nhan@e2e.local').expect(401);
    await login('NAN-NHAN@e2e.local').expect(429);
    // 20 thí sinh khác cùng IP đăng nhập trong cùng phút: không ai bị chặn
    for (let i = 0; i < 20; i++) await login(`thi-sinh-${i}@e2e.local`).expect(401);
  });

  it('học viên không gọi được bất kỳ API quản lý nào', async () => {
    const id = randomUUID();
    const calls: [string, string][] = [
      ['get', '/api/users'],
      ['patch', `/api/users/${id}/role`],
      ['get', '/api/manage/courses'],
      ['post', '/api/manage/courses'],
      ['get', `/api/manage/courses/${id}/questions`],
      ['post', `/api/manage/courses/${id}/questions/import`],
      ['get', `/api/manage/courses/${id}/blueprints`],
      ['get', `/api/manage/courses/${id}/exams`],
      ['get', `/api/manage/exams/${id}/results`],
      ['get', `/api/manage/exams/${id}/proctor`],
      ['patch', `/api/manage/exams/${id}/candidates/${id}/verdict`],
      ['post', `/api/manage/exams/${id}/candidates/${id}/extensions`],
      ['post', `/api/manage/courses/${id}/ai/generate-questions`],
      ['get', '/api/manage/paths'],
    ];
    for (const [method, url] of calls) {
      const res = await (
        http() as unknown as Record<string, (u: string) => request.Test>
      )
        [method](url)
        .set(as(studentB))
        .send({});
      expect({ url, status: res.status }).toEqual({ url, status: 403 });
    }
  });
});
