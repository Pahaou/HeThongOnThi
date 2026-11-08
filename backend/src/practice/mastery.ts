export type MasteryLevel = 'NOT_ENOUGH' | 'WEAK' | 'FAIR' | 'STRONG';

/** Dưới số câu này thì chưa đủ dữ liệu để kết luận mạnh hay yếu */
export const MIN_ANSWERS_FOR_LEVEL = 5;
export const STRONG_FROM = 0.8;
export const FAIR_FROM = 0.5;

/** Tỉ lệ đúng (0-1), làm tròn 2 chữ số; chưa làm câu nào thì null. */
export function accuracy(correct: number, answered: number): number | null {
  if (answered <= 0) return null;
  return Math.round((correct / answered) * 100) / 100;
}

/** Xếp mức năng lực theo tỉ lệ đúng: >= 80% mạnh, >= 50% khá, còn lại yếu. */
export function masteryLevel(correct: number, answered: number): MasteryLevel {
  if (answered < MIN_ANSWERS_FOR_LEVEL) return 'NOT_ENOUGH';
  const rate = correct / answered;
  if (rate >= STRONG_FROM) return 'STRONG';
  if (rate >= FAIR_FROM) return 'FAIR';
  return 'WEAK';
}
