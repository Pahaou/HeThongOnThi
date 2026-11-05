import { Difficulty, QuestionType } from '../generated/prisma/client';
import { parseRow } from './excel-import';

/** Dựng một dòng theo thứ tự cột: chủ đề, loại, độ khó, câu hỏi, A-F, đáp án, giải thích. */
function row(p: {
  topic?: string;
  type?: string;
  difficulty?: string;
  content?: string;
  options?: string[];
  answer?: string;
  explanation?: string;
}): string[] {
  const options = p.options ?? ['Hà Nội', 'Huế', 'Đà Nẵng'];
  return [
    p.topic ?? 'Địa lý',
    p.type ?? '1 đáp án',
    p.difficulty ?? 'Dễ',
    p.content ?? 'Thủ đô Việt Nam?',
    ...Array.from({ length: 6 }, (_, i) => options[i] ?? ''),
    p.answer ?? 'A',
    p.explanation ?? '',
  ];
}

function ok(cells: string[]) {
  const r = parseRow(cells);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}

function error(cells: string[]) {
  const r = parseRow(cells);
  if (r.ok) throw new Error('Mong đợi lỗi nhưng dòng hợp lệ');
  return r.error;
}

describe('parseRow', () => {
  it('đọc câu một đáp án, bỏ ô đáp án trống', () => {
    const q = ok(row({ explanation: 'Từ 1010' }));
    expect(q).toMatchObject({
      topicName: 'Địa lý',
      type: QuestionType.SINGLE,
      difficulty: Difficulty.EASY,
      explanation: 'Từ 1010',
    });
    expect(q.options).toEqual([
      { content: 'Hà Nội', isCorrect: true },
      { content: 'Huế', isCorrect: false },
      { content: 'Đà Nẵng', isCorrect: false },
    ]);
  });

  it('nhận loại và độ khó viết không dấu, hoa thường, tiếng Anh', () => {
    expect(
      ok(row({ type: 'MOT DAP AN', difficulty: 'trung binh' })),
    ).toMatchObject({
      type: QuestionType.SINGLE,
      difficulty: Difficulty.MEDIUM,
    });
    expect(ok(row({ type: 'single', difficulty: 'HARD' }))).toMatchObject({
      type: QuestionType.SINGLE,
      difficulty: Difficulty.HARD,
    });
  });

  it('câu nhiều đáp án: đáp án đúng cách nhau bởi dấu phẩy hoặc khoảng trắng', () => {
    const q = ok(
      row({
        type: 'Nhiều đáp án',
        content: 'Số nguyên tố?',
        options: ['2', '3', '4'],
        answer: 'a, b',
      }),
    );
    expect(q.options.filter((o) => o.isCorrect).map((o) => o.content)).toEqual([
      '2',
      '3',
    ]);
  });

  it('câu đúng/sai: tự tạo 2 phương án, bỏ qua các ô đáp án', () => {
    const q = ok(
      row({ type: 'Đúng/Sai', options: ['x', 'y', 'z'], answer: 'sai' }),
    );
    expect(q.type).toBe(QuestionType.TRUE_FALSE);
    expect(q.options).toEqual([
      { content: 'Đúng', isCorrect: false },
      { content: 'Sai', isCorrect: true },
    ]);
  });

  it('báo lỗi dễ hiểu cho từng trường hợp sai', () => {
    expect(error(row({ topic: ' ' }))).toMatch(/chủ đề/);
    expect(error(row({ content: '' }))).toMatch(/nội dung/);
    expect(error(row({ type: 'tự luận' }))).toMatch(/Loại "tự luận"/);
    expect(error(row({ difficulty: 'siêu khó' }))).toMatch(/Độ khó/);
    expect(error(row({ answer: '' }))).toMatch(/Thiếu đáp án/);
    expect(error(row({ answer: 'G' }))).toMatch(/"G" không hợp lệ/);
    expect(error(row({ answer: 'D' }))).toMatch(
      /D nhưng ô đáp án đó đang trống/,
    );
    expect(error(row({ answer: 'A,B' }))).toMatch(/đúng 1/);
    expect(error(row({ type: 'đúng sai', answer: 'có lẽ' }))).toMatch(
      /Đúng hoặc Sai/,
    );
  });
});
