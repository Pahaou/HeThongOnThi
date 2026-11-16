import { pickRandom, Rng } from '../practice/grading';
import { MasteryLevel } from '../practice/mastery';

export interface TopicPool {
  topicId: string;
  name: string;
  level: MasteryLevel;
  accuracy: number | null;
  /** Câu ACTIVE của chủ đề */
  questionIds: string[];
}

/**
 * Chọn câu ôn theo điểm yếu (không cần AI):
 * 1. Câu từng sai mà chưa làm đúng lại
 * 2. Câu thuộc chủ đề yếu (tỉ lệ đúng thấp trước), bỏ qua câu đã làm đúng
 * Không lặp câu; trả tối đa `count` câu.
 */
export function pickWeaknessQuestions(input: {
  unresolvedWrong: readonly string[];
  topics: readonly TopicPool[];
  answeredCorrect: ReadonlySet<string>;
  count: number;
  rng?: Rng;
}): string[] {
  const { count, rng } = input;
  const picked = new Set(pickRandom(input.unresolvedWrong, count, rng));
  const weakFirst = [...input.topics]
    .filter((t) => t.level === 'WEAK' || t.level === 'FAIR')
    .sort((a, b) => (a.accuracy ?? 0) - (b.accuracy ?? 0));
  for (const topic of weakFirst) {
    if (picked.size >= count) break;
    const fresh = topic.questionIds.filter(
      (id) => !picked.has(id) && !input.answeredCorrect.has(id),
    );
    for (const id of pickRandom(fresh, count - picked.size, rng))
      picked.add(id);
  }
  return [...picked];
}

/** Lời khuyên soạn sẵn khi AI không phản hồi (phương án dự phòng). */
export function fallbackAdvice(
  weakTopics: readonly { name: string; accuracy: number | null }[],
  unresolvedWrong: number,
): string {
  if (weakTopics.length === 0 && unresolvedWrong === 0) {
    return 'Bạn chưa có chủ đề yếu rõ rệt. Hãy tiếp tục ôn tập đều các chủ đề và làm thêm đề thi thử để kiểm tra.';
  }
  const parts: string[] = [];
  if (weakTopics.length > 0) {
    const list = weakTopics
      .map((t) => `${t.name} (${Math.round((t.accuracy ?? 0) * 100)}%)`)
      .join(', ');
    parts.push(
      `Các chủ đề cần ưu tiên: ${list}. Hãy đọc lại bài học liên quan trước khi làm bài ôn.`,
    );
  }
  if (unresolvedWrong > 0) {
    parts.push(
      `Bạn còn ${unresolvedWrong} câu từng làm sai chưa làm đúng lại; bài ôn dưới đây ưu tiên những câu này.`,
    );
  }
  parts.push(
    'Sau khi ôn, xem lại giải thích của các câu sai để tránh lặp lại lỗi.',
  );
  return parts.join(' ');
}
