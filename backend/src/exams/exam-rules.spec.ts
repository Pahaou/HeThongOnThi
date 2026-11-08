import { QuestionType } from '../generated/prisma/client';
import {
  attemptDeadline,
  gradeSnapshot,
  publicSnapshot,
  SAVE_GRACE_MS,
  windowState,
  withinDeadline,
} from './exam-rules';

const t = (iso: string) => new Date(`2026-11-10T${iso}:00Z`);

describe('windowState', () => {
  const exam = { opensAt: t('08:00'), closesAt: t('10:00') };

  it('chưa mở, đang mở, đã đóng', () => {
    expect(windowState(exam, t('07:59'))).toBe('NOT_OPEN');
    expect(windowState(exam, t('08:00'))).toBe('OPEN');
    expect(windowState(exam, t('09:59'))).toBe('OPEN');
    expect(windowState(exam, t('10:00'))).toBe('CLOSED');
  });
});

describe('attemptDeadline', () => {
  it('bắt đầu sớm: hạn = bắt đầu + thời lượng', () => {
    expect(attemptDeadline(t('08:00'), 45 * 60, t('10:00'))).toEqual(
      t('08:45'),
    );
  });

  it('bắt đầu muộn: hạn bị cắt ở giờ đóng kỳ thi', () => {
    expect(attemptDeadline(t('09:30'), 45 * 60, t('10:00'))).toEqual(
      t('10:00'),
    );
  });
});

describe('withinDeadline', () => {
  const deadline = t('09:00');

  it('cho phép trễ trong thời gian ân hạn, quá thì chặn', () => {
    expect(withinDeadline(deadline, t('08:59'))).toBe(true);
    expect(
      withinDeadline(deadline, new Date(deadline.getTime() + SAVE_GRACE_MS)),
    ).toBe(true);
    expect(
      withinDeadline(
        deadline,
        new Date(deadline.getTime() + SAVE_GRACE_MS + 1),
      ),
    ).toBe(false);
  });
});

describe('gradeSnapshot và publicSnapshot', () => {
  const snapshot = {
    type: QuestionType.MULTIPLE,
    content: 'Chọn số chẵn',
    options: [
      { id: 'a', content: '2', isCorrect: true },
      { id: 'b', content: '3', isCorrect: false },
      { id: 'c', content: '4', isCorrect: true },
    ],
  };

  it('chấm theo đáp án đã đóng băng', () => {
    expect(gradeSnapshot(snapshot, ['c', 'a'])).toBe(true);
    expect(gradeSnapshot(snapshot, ['a'])).toBe(false);
  });

  it('bản gửi thí sinh không có isCorrect', () => {
    expect(JSON.stringify(publicSnapshot(snapshot))).not.toContain('isCorrect');
  });
});
