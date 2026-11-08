import { accuracy, masteryLevel } from './mastery';

describe('mastery', () => {
  it('chưa đủ 5 câu thì chưa xếp mức', () => {
    expect(masteryLevel(4, 4)).toBe('NOT_ENOUGH');
    expect(masteryLevel(0, 0)).toBe('NOT_ENOUGH');
  });

  it('xếp mức theo ngưỡng 80% và 50%', () => {
    expect(masteryLevel(8, 10)).toBe('STRONG');
    expect(masteryLevel(7, 10)).toBe('FAIR');
    expect(masteryLevel(5, 10)).toBe('FAIR');
    expect(masteryLevel(4, 10)).toBe('WEAK');
  });

  it('tỉ lệ đúng làm tròn 2 chữ số, chưa làm thì null', () => {
    expect(accuracy(2, 3)).toBe(0.67);
    expect(accuracy(0, 0)).toBeNull();
  });
});
