import { QuestionType } from '../generated/prisma/client';
import {
  acceptsSync,
  answeredInTime,
  attemptDeadline,
  clampClientTime,
  gradeSnapshot,
  isNewer,
  publicSnapshot,
  SAVE_GRACE_MS,
  SYNC_GRACE_MS,
  windowState,
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

describe('đồng bộ sau mất mạng', () => {
  const deadline = t('09:00');
  const plus = (ms: number) => new Date(deadline.getTime() + ms);

  it('server còn nhận đồng bộ trong SYNC_GRACE_MS sau hạn', () => {
    expect(acceptsSync(deadline, plus(SYNC_GRACE_MS))).toBe(true);
    expect(acceptsSync(deadline, plus(SYNC_GRACE_MS + 1))).toBe(false);
  });

  it('chỉ tính câu được chọn trước hạn (cho trễ SAVE_GRACE_MS)', () => {
    expect(answeredInTime(t('08:59'), deadline)).toBe(true);
    expect(answeredInTime(plus(SAVE_GRACE_MS), deadline)).toBe(true);
    expect(answeredInTime(plus(SAVE_GRACE_MS + 1), deadline)).toBe(false);
  });

  it('giờ client không được vượt giờ server', () => {
    expect(clampClientTime(t('09:10'), t('09:00'))).toEqual(t('09:00'));
    expect(clampClientTime(t('08:50'), t('09:00'))).toEqual(t('08:50'));
  });

  it('bản mới hơn mới được ghi đè', () => {
    expect(isNewer(t('08:30'), null)).toBe(true);
    expect(isNewer(t('08:31'), t('08:30'))).toBe(true);
    expect(isNewer(t('08:30'), t('08:30'))).toBe(false);
    expect(isNewer(t('08:29'), t('08:30'))).toBe(false);
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
