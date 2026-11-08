import {
  buildPaper,
  isAnswerCorrect,
  pickRandom,
  score10,
  shuffle,
} from './grading';

/** RNG cố định (LCG) để kết quả lặp lại được giữa các lần chạy. */
function seeded(seed = 42) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

describe('shuffle và pickRandom', () => {
  it('giữ đủ phần tử, không sửa mảng gốc', () => {
    const items = [1, 2, 3, 4, 5, 6];
    const out = shuffle(items, seeded());
    expect([...out].sort()).toEqual(items);
    expect(items).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('cùng seed cho cùng kết quả, khác seed thường cho kết quả khác', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(items, seeded(1))).toEqual(shuffle(items, seeded(1)));
    expect(shuffle(items, seeded(1))).not.toEqual(shuffle(items, seeded(2)));
  });

  it('pickRandom lấy đúng số lượng, không trùng, không vượt quá kho', () => {
    const picked = pickRandom(['a', 'b', 'c', 'd'], 3, seeded());
    expect(new Set(picked).size).toBe(3);
    expect(pickRandom(['a', 'b'], 5)).toHaveLength(2);
    expect(pickRandom(['a'], 0)).toEqual([]);
  });
});

describe('isAnswerCorrect', () => {
  it('một đáp án', () => {
    expect(isAnswerCorrect(['a'], ['a'])).toBe(true);
    expect(isAnswerCorrect(['b'], ['a'])).toBe(false);
  });

  it('nhiều đáp án: phải chọn đủ và không thừa', () => {
    expect(isAnswerCorrect(['b', 'a'], ['a', 'b'])).toBe(true);
    expect(isAnswerCorrect(['a'], ['a', 'b'])).toBe(false);
    expect(isAnswerCorrect(['a', 'b', 'c'], ['a', 'b'])).toBe(false);
  });

  it('bỏ trống là sai; chọn trùng không được tính thêm', () => {
    expect(isAnswerCorrect([], ['a'])).toBe(false);
    expect(isAnswerCorrect(['a', 'a'], ['a'])).toBe(true);
  });
});

describe('score10', () => {
  it('quy về thang 10, làm tròn 2 chữ số', () => {
    expect(score10(7, 10)).toBe(7);
    expect(score10(2, 3)).toBe(6.67);
    expect(score10(0, 5)).toBe(0);
    expect(score10(0, 0)).toBe(0);
  });
});

describe('buildPaper (sinh đề theo ma trận)', () => {
  const pools: Record<string, string[]> = {
    'html:EASY': ['h1', 'h2', 'h3', 'h4'],
    'css:HARD': ['c1', 'c2'],
  };
  const pool = (r: { topicId: string; difficulty: string }) =>
    pools[`${r.topicId}:${r.difficulty}`] ?? [];

  it('lấy đúng số câu mỗi quy tắc, không trùng, đúng kho', () => {
    const result = buildPaper(
      [
        { topicId: 'html', difficulty: 'EASY', count: 3 },
        { topicId: 'css', difficulty: 'HARD', count: 2 },
      ],
      pool,
      seeded(),
    );
    if (!result.ok) throw new Error('mong đợi sinh đề thành công');
    expect(result.questionIds).toHaveLength(5);
    expect(new Set(result.questionIds).size).toBe(5);
    expect(result.questionIds.filter((id) => id.startsWith('h'))).toHaveLength(
      3,
    );
    expect(
      [...result.questionIds].filter((id) => id.startsWith('c')).sort(),
    ).toEqual(['c1', 'c2']);
  });

  it('báo mọi quy tắc thiếu câu thay vì sinh đề thiếu', () => {
    const result = buildPaper(
      [
        { topicId: 'html', difficulty: 'EASY', count: 5 },
        { topicId: 'css', difficulty: 'HARD', count: 1 },
        { topicId: 'js', difficulty: 'EASY', count: 2 },
      ],
      pool,
    );
    expect(result).toEqual({
      ok: false,
      shortages: [
        { topicId: 'html', difficulty: 'EASY', count: 5, available: 4 },
        { topicId: 'js', difficulty: 'EASY', count: 2, available: 0 },
      ],
    });
  });

  it('mỗi lần sinh cho đề khác nhau', () => {
    const rules = [{ topicId: 'html', difficulty: 'EASY', count: 4 }];
    const a = buildPaper(rules, pool, seeded(1));
    const b = buildPaper(rules, pool, seeded(7));
    if (!a.ok || !b.ok) throw new Error('mong đợi sinh đề thành công');
    expect(a.questionIds).not.toEqual(b.questionIds);
  });
});
