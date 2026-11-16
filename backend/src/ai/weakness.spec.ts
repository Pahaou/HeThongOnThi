import { fallbackAdvice, pickWeaknessQuestions, TopicPool } from './weakness';

const topic = (
  name: string,
  level: TopicPool['level'],
  accuracy: number,
  ids: string[],
): TopicPool => ({ topicId: name, name, level, accuracy, questionIds: ids });

describe('pickWeaknessQuestions', () => {
  it('ưu tiên câu sai chưa khắc phục, rồi chủ đề yếu nhất', () => {
    const ids = pickWeaknessQuestions({
      unresolvedWrong: ['w1'],
      topics: [
        topic('Khá', 'FAIR', 0.6, ['f1', 'f2']),
        topic('Yếu', 'WEAK', 0.2, ['y1', 'y2']),
        topic('Mạnh', 'STRONG', 0.9, ['s1']),
      ],
      answeredCorrect: new Set(),
      count: 3,
    });
    expect(ids[0]).toBe('w1');
    expect(ids.slice(1).sort()).toEqual(['y1', 'y2']);
  });

  it('bỏ câu đã làm đúng, không lấy chủ đề mạnh, không trùng', () => {
    const ids = pickWeaknessQuestions({
      unresolvedWrong: ['y1'],
      topics: [
        topic('Yếu', 'WEAK', 0.3, ['y1', 'y2', 'y3']),
        topic('Mạnh', 'STRONG', 0.95, ['s1']),
      ],
      answeredCorrect: new Set(['y2']),
      count: 10,
    });
    expect(ids.sort()).toEqual(['y1', 'y3']);
  });

  it('không vượt quá số câu yêu cầu', () => {
    const ids = pickWeaknessQuestions({
      unresolvedWrong: ['a', 'b', 'c', 'd'],
      topics: [],
      answeredCorrect: new Set(),
      count: 2,
    });
    expect(ids).toHaveLength(2);
  });
});

describe('fallbackAdvice', () => {
  it('nêu chủ đề yếu và số câu sai', () => {
    const text = fallbackAdvice([{ name: 'HTML', accuracy: 0.18 }], 3);
    expect(text).toContain('HTML (18%)');
    expect(text).toContain('3 câu');
  });

  it('chưa có điểm yếu thì khuyên ôn đều', () => {
    expect(fallbackAdvice([], 0)).toContain('chưa có chủ đề yếu');
  });
});
