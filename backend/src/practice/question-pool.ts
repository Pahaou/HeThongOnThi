import { QuestionStatus } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Khóa nhóm câu hỏi theo chủ đề + độ khó, dùng chung cho đếm và sinh đề. */
export const poolKey = (topicId: string, difficulty: string) =>
  `${topicId}:${difficulty}`;

/** Id các câu ACTIVE của khóa, nhóm theo chủ đề + độ khó. */
export async function loadPools(
  prisma: PrismaService,
  courseId: string,
  topicIds?: string[],
): Promise<Map<string, string[]>> {
  const rows = await prisma.question.findMany({
    where: {
      courseId,
      status: QuestionStatus.ACTIVE,
      topicId: topicIds ? { in: topicIds } : undefined,
    },
    select: { id: true, topicId: true, difficulty: true },
  });
  const pools = new Map<string, string[]>();
  for (const q of rows) {
    const key = poolKey(q.topicId, q.difficulty);
    const list = pools.get(key) ?? [];
    list.push(q.id);
    pools.set(key, list);
  }
  return pools;
}
