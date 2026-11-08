import { QuestionType } from '../generated/prisma/client';
import { isAnswerCorrect } from '../practice/grading';

/** Cho phép trễ vài giây so với hạn để bù độ trễ mạng khi lưu/nộp. */
export const SAVE_GRACE_MS = 5_000;

export type WindowState = 'NOT_OPEN' | 'OPEN' | 'CLOSED';

export function windowState(
  exam: { opensAt: Date; closesAt: Date },
  now: Date,
): WindowState {
  if (now < exam.opensAt) return 'NOT_OPEN';
  if (now >= exam.closesAt) return 'CLOSED';
  return 'OPEN';
}

/** Hạn nộp = bắt đầu + thời lượng, nhưng không vượt giờ đóng kỳ thi. */
export function attemptDeadline(
  startedAt: Date,
  durationSec: number,
  closesAt: Date,
): Date {
  const byDuration = startedAt.getTime() + durationSec * 1000;
  return new Date(Math.min(byDuration, closesAt.getTime()));
}

/** Còn được lưu/nộp không (tính cả thời gian ân hạn). */
export function withinDeadline(deadlineAt: Date, now: Date): boolean {
  return now.getTime() <= deadlineAt.getTime() + SAVE_GRACE_MS;
}

export interface SnapshotOption {
  id: string;
  content: string;
  isCorrect: boolean;
}

/** Câu hỏi đã đóng băng trong bài thi. */
export interface QuestionSnapshot {
  type: QuestionType;
  content: string;
  options: SnapshotOption[];
}

export function gradeSnapshot(
  snapshot: QuestionSnapshot,
  selectedOptionIds: readonly string[],
): boolean {
  const correct = snapshot.options.filter((o) => o.isCorrect).map((o) => o.id);
  return isAnswerCorrect(selectedOptionIds, correct);
}

/** Bản gửi cho thí sinh: bỏ trường isCorrect. */
export function publicSnapshot(snapshot: QuestionSnapshot) {
  return {
    type: snapshot.type,
    content: snapshot.content,
    options: snapshot.options.map(({ id, content }) => ({ id, content })),
  };
}
