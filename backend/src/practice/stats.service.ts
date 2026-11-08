import { Injectable } from '@nestjs/common';
import { JwtPayload } from '../auth/auth.types';
import {
  Difficulty,
  PracticeMode,
  QuestionStatus,
} from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { assertLearner } from './learner-access';
import { accuracy, masteryLevel } from './mastery';

interface TopicRow {
  topic_id: string;
  difficulty: Difficulty;
  answered: bigint;
  correct: bigint;
}

interface WrongRow {
  question_id: string;
  wrong_count: bigint;
  answered: bigint;
  last_wrong_at: Date;
  last_correct: boolean;
}

@Injectable()
export class StatsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Năng lực của học viên trong một khóa, tính từ mọi câu đã được chấm
   * (ôn tập: câu đã trả lời; thi thử: mọi câu sau khi nộp, bỏ trống tính sai).
   */
  async overview(user: JwtPayload, courseId: string) {
    await assertLearner(this.prisma, user, courseId);
    const [rows, topics, mocks] = await Promise.all([
      this.prisma.$queryRaw<TopicRow[]>`
        SELECT q.topic_id, q.difficulty,
               count(*) AS answered,
               count(*) FILTER (WHERE pa.is_correct) AS correct
        FROM practice_answers pa
        JOIN practice_attempts a ON a.id = pa.attempt_id
        JOIN questions q ON q.id = pa.question_id
        WHERE a.user_id = ${user.sub}::uuid
          AND a.course_id = ${courseId}::uuid
          AND pa.is_correct IS NOT NULL
        GROUP BY q.topic_id, q.difficulty`,
      this.prisma.topic.findMany({
        where: { courseId },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      this.prisma.practiceAttempt.findMany({
        where: {
          userId: user.sub,
          courseId,
          mode: PracticeMode.MOCK,
          submittedAt: { not: null },
        },
        orderBy: { submittedAt: 'desc' },
        take: 20,
        select: { id: true, title: true, submittedAt: true, score: true },
      }),
    ]);

    const sum = (filter: (r: TopicRow) => boolean) => {
      const picked = rows.filter(filter);
      const answered = picked.reduce((s, r) => s + Number(r.answered), 0);
      const correct = picked.reduce((s, r) => s + Number(r.correct), 0);
      return {
        answered,
        correct,
        accuracy: accuracy(correct, answered),
        level: masteryLevel(correct, answered),
      };
    };

    const byTopic = topics
      .map((t) => ({ ...t, ...sum((r) => r.topic_id === t.id) }))
      .filter((t) => t.answered > 0);

    return {
      total: sum(() => true),
      byTopic,
      byDifficulty: Object.values(Difficulty).map((difficulty) => ({
        difficulty,
        ...sum((r) => r.difficulty === difficulty),
      })),
      // Cũ trước, mới sau để vẽ theo thời gian
      mockScores: mocks.reverse(),
    };
  }

  /**
   * Sổ tay câu sai: câu từng làm sai ít nhất một lần, kèm số lần sai và
   * đã khắc phục chưa (lần làm gần nhất đúng). Câu đã được chấm nên trả
   * kèm đáp án đúng và giải thích.
   */
  async wrongQuestions(
    user: JwtPayload,
    courseId: string,
    includeResolved: boolean,
  ) {
    await assertLearner(this.prisma, user, courseId);
    const rows = await this.wrongRows(user.sub, courseId);
    const shown = includeResolved ? rows : rows.filter((r) => !r.last_correct);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: shown.map((r) => r.question_id) } },
      select: {
        id: true,
        type: true,
        difficulty: true,
        status: true,
        content: true,
        explanation: true,
        topic: { select: { id: true, name: true } },
        options: {
          orderBy: { position: 'asc' },
          select: { id: true, content: true, isCorrect: true },
        },
      },
    });
    const byId = new Map(questions.map((q) => [q.id, q]));
    return {
      unresolvedCount: rows.filter((r) => !r.last_correct).length,
      resolvedCount: rows.filter((r) => r.last_correct).length,
      items: shown
        .filter((r) => byId.has(r.question_id))
        .map((r) => ({
          question: byId.get(r.question_id)!,
          wrongCount: Number(r.wrong_count),
          answered: Number(r.answered),
          lastWrongAt: r.last_wrong_at,
          resolved: r.last_correct,
        })),
    };
  }

  /** Id các câu sai chưa khắc phục, còn đang dùng trong ngân hàng (để tạo bài ôn lại). */
  async unresolvedWrongIds(
    userId: string,
    courseId: string,
  ): Promise<string[]> {
    const rows = await this.wrongRows(userId, courseId);
    const ids = rows.filter((r) => !r.last_correct).map((r) => r.question_id);
    const active = await this.prisma.question.findMany({
      where: { id: { in: ids }, status: QuestionStatus.ACTIVE },
      select: { id: true },
    });
    const activeIds = new Set(active.map((q) => q.id));
    return ids.filter((id) => activeIds.has(id));
  }

  /** Câu sai nhiều lần và mới sai gần đây xếp trước. */
  private wrongRows(userId: string, courseId: string) {
    return this.prisma.$queryRaw<WrongRow[]>`
      WITH graded AS (
        SELECT pa.question_id, pa.is_correct,
               COALESCE(pa.answered_at, a.submitted_at, a.started_at) AS at
        FROM practice_answers pa
        JOIN practice_attempts a ON a.id = pa.attempt_id
        WHERE a.user_id = ${userId}::uuid
          AND a.course_id = ${courseId}::uuid
          AND pa.is_correct IS NOT NULL
      )
      SELECT question_id,
             count(*) FILTER (WHERE NOT is_correct) AS wrong_count,
             count(*) AS answered,
             max(at) FILTER (WHERE NOT is_correct) AS last_wrong_at,
             (array_agg(is_correct ORDER BY at DESC))[1] AS last_correct
      FROM graded
      GROUP BY question_id
      HAVING count(*) FILTER (WHERE NOT is_correct) > 0
      ORDER BY wrong_count DESC, last_wrong_at DESC`;
  }
}
