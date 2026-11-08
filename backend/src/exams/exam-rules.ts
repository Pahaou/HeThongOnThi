import { QuestionType } from '../generated/prisma/client';
import { isAnswerCorrect } from '../practice/grading';

/** Câu trả lời chọn trễ tối đa vài giây so với hạn vẫn được tính (bù độ trễ). */
export const SAVE_GRACE_MS = 5_000;

/**
 * Sau hạn nộp, server còn nhận đồng bộ thêm một lúc để máy vừa có mạng
 * lại gửi nốt các câu đã chọn TRƯỚC hạn. Hết khoảng này thì bài bị tự nộp.
 * Đổi lại, người cố tình sửa giờ máy chỉ lợi tối đa khoảng thời gian này.
 */
export const SYNC_GRACE_MS = 60_000;

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

/** Server còn nhận đồng bộ bài không (hạn nộp + thời gian chờ đồng bộ). */
export function acceptsSync(deadlineAt: Date, now: Date): boolean {
  return now.getTime() <= deadlineAt.getTime() + SYNC_GRACE_MS;
}

/** Câu trả lời có được chọn trước hạn không (cho trễ SAVE_GRACE_MS). */
export function answeredInTime(clientSavedAt: Date, deadlineAt: Date): boolean {
  return clientSavedAt.getTime() <= deadlineAt.getTime() + SAVE_GRACE_MS;
}

/**
 * Thời điểm lưu theo client, không cho vượt giờ server (máy chạy nhanh
 * hoặc cố tình đặt giờ tương lai để luôn "thắng" khi gộp).
 */
export function clampClientTime(clientSavedAt: Date, now: Date): Date {
  return clientSavedAt > now ? now : clientSavedAt;
}

/** Bản lưu mới hơn mới được ghi đè, để hàng đợi offline cũ không đè lựa chọn mới. */
export function isNewer(incoming: Date, existing: Date | null): boolean {
  return existing === null || incoming > existing;
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
