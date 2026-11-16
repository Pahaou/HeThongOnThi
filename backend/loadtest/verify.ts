/**
 * Đối chiếu sau khi đo tải: mọi câu lưu thành công phải còn trong DB và mọi
 * bài phải được chấm (chờ hàng đợi tối đa 2 phút).
 *
 *   npx ts-node loadtest/verify.ts <saves_ok> <submits_ok>
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL! }),
});

async function main() {
  const expectedSaves = Number(process.argv[2]);
  const expectedSubmits = Number(process.argv[3]);
  const { examId } = JSON.parse(
    readFileSync(join(__dirname, 'data.json'), 'utf8'),
  ) as { examId: string };
  const where = { candidate: { examId } };

  const started = Date.now();
  let graded = 0;
  while (Date.now() - started < 120_000) {
    graded = await prisma.examAttempt.count({ where: { ...where, status: 'GRADED' } });
    if (graded >= expectedSubmits) break;
    await new Promise((r) => setTimeout(r, 1000));
  }
  const gradingMs = Date.now() - started;
  const attempts = await prisma.examAttempt.count({ where });
  const savedAnswers = await prisma.attemptQuestion.count({
    where: { attempt: where, NOT: { selectedOptionIds: { isEmpty: true } } },
  });

  const result = {
    attempts,
    graded,
    expectedSubmits,
    savedAnswers,
    expectedSaves,
    lostAnswers: expectedSaves - savedAnswers,
    secondsToGradeAll: Math.round(gradingMs / 100) / 10,
  };
  console.log(JSON.stringify(result, null, 2));
  const ok = savedAnswers >= expectedSaves && graded >= expectedSubmits;
  console.log(ok ? 'KHÔNG MẤT DỮ LIỆU' : 'CÓ DỮ LIỆU BỊ MẤT');
  process.exitCode = ok ? 0 : 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
