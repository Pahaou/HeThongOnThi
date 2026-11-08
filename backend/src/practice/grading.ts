/** Hàm sinh số ngẫu nhiên trong [0, 1); truyền vào để test được kết quả cố định. */
export type Rng = () => number;

/** Xáo trộn Fisher-Yates, không sửa mảng gốc. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Lấy ngẫu nhiên n phần tử khác nhau (ít hơn n nếu không đủ). */
export function pickRandom<T>(
  items: readonly T[],
  n: number,
  rng: Rng = Math.random,
): T[] {
  return shuffle(items, rng).slice(0, Math.max(0, n));
}

/**
 * Đúng khi chọn đúng y tập phương án đúng: thiếu hay thừa đều sai
 * (câu nhiều đáp án chấm kiểu tất cả hoặc không).
 */
export function isAnswerCorrect(
  selected: readonly string[],
  correct: readonly string[],
): boolean {
  if (selected.length === 0) return false;
  const want = new Set(correct);
  const got = new Set(selected);
  return got.size === want.size && [...got].every((id) => want.has(id));
}

/** Điểm thang 10, làm tròn 2 chữ số. */
export function score10(correct: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((correct / total) * 1000) / 100;
}

export interface PaperRule {
  topicId: string;
  difficulty: string;
  count: number;
}

export interface RuleShortage extends PaperRule {
  available: number;
}

export type PaperResult =
  | { ok: true; questionIds: string[] }
  | { ok: false; shortages: RuleShortage[] };

/**
 * Sinh đề theo ma trận: mỗi quy tắc bốc ngẫu nhiên `count` câu từ kho
 * cùng chủ đề + độ khó, rồi xáo thứ tự toàn đề. Kho nào thiếu câu thì
 * báo lại để giảng viên bổ sung, không sinh đề thiếu.
 */
export function buildPaper(
  rules: readonly PaperRule[],
  pool: (rule: PaperRule) => readonly string[],
  rng: Rng = Math.random,
): PaperResult {
  const shortages: RuleShortage[] = [];
  const picked: string[] = [];
  for (const rule of rules) {
    const candidates = pool(rule);
    if (candidates.length < rule.count) {
      shortages.push({ ...rule, available: candidates.length });
      continue;
    }
    picked.push(...pickRandom(candidates, rule.count, rng));
  }
  if (shortages.length > 0) return { ok: false, shortages };
  return { ok: true, questionIds: shuffle(picked, rng) };
}
