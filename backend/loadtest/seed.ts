/**
 * Chuẩn bị dữ liệu đo tải: N thí sinh (email lt-*), một kỳ thi đang mở trong
 * khóa mẫu, và JWT ký sẵn cho từng thí sinh (đăng nhập không nằm trong phép đo).
 *
 *   npx ts-node loadtest/seed.ts 300        tạo dữ liệu, ghi loadtest/data.json
 *   npx ts-node loadtest/seed.ts --clean    xóa dữ liệu đo tải
 */
import 'dotenv/config';
import { JwtService } from '@nestjs/jwt';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcryptjs';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ExamStatus, PrismaClient, Role } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});
const EXAM_TITLE = 'Đo tải (tự động)';

async function clean() {
  await prisma.exam.deleteMany({ where: { title: EXAM_TITLE } });
  const { count } = await prisma.user.deleteMany({
    where: { email: { startsWith: 'lt-' } },
  });
  console.log(`Đã xóa ${count} thí sinh đo tải`);
}

async function seed(n: number) {
  await clean();
  const course = await prisma.course.findUniqueOrThrow({
    where: { slug: 'nhap-mon-lap-trinh-web' },
    include: { blueprints: { include: { rules: true } } },
  });
  const blueprint = course.blueprints[0];
  const passwordHash = await bcrypt.hash('LoadTest@123', 4);
  await prisma.user.createMany({
    data: Array.from({ length: n }, (_, i) => ({
      email: `lt-${String(i).padStart(4, '0')}@load.local`,
      fullName: `Thí sinh ${i}`,
      role: Role.STUDENT,
      passwordHash,
    })),
  });
  const users = await prisma.user.findMany({
    where: { email: { startsWith: 'lt-' } },
    orderBy: { email: 'asc' },
    select: { id: true, email: true },
  });
  const now = Date.now();
  const exam = await prisma.exam.create({
    data: {
      courseId: course.id,
      createdById: course.instructorId,
      title: EXAM_TITLE,
      opensAt: new Date(now - 60_000),
      closesAt: new Date(now + 3 * 60 * 60 * 1000),
      durationSec: 60 * 60,
      status: ExamStatus.PUBLISHED,
      rules: {
        create: blueprint.rules.map(({ topicId, difficulty, count }) => ({
          topicId,
          difficulty,
          count,
        })),
      },
      candidates: { createMany: { data: users.map((u) => ({ userId: u.id })) } },
    },
  });

  const jwt = new JwtService({ secret: process.env.JWT_ACCESS_SECRET });
  const tokens = users.map((u) =>
    jwt.sign({ sub: u.id, email: u.email, role: Role.STUDENT }, { expiresIn: '3h' }),
  );
  writeFileSync(
    join(__dirname, 'data.json'),
    JSON.stringify({ examId: exam.id, tokens }),
  );
  console.log(`Đã tạo ${n} thí sinh, kỳ thi ${exam.id}, ghi loadtest/data.json`);
}

const arg = process.argv[2];
(arg === '--clean' ? clean() : seed(Number(arg) || 300))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
