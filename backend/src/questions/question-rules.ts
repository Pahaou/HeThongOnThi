import { QuestionType } from '../generated/prisma/client';

export const MAX_OPTIONS = 8;
export const TRUE_FALSE_OPTIONS = ['Đúng', 'Sai'] as const;

export interface OptionInput {
  content: string;
  isCorrect: boolean;
}

/**
 * Kiểm tra đáp án theo loại câu hỏi. Trả về thông báo lỗi, hoặc null nếu hợp lệ.
 * - SINGLE: ít nhất 2 phương án, đúng 1 phương án đúng
 * - MULTIPLE: ít nhất 2 phương án, ít nhất 1 phương án đúng
 * - TRUE_FALSE: đúng 2 phương án, đúng 1 phương án đúng
 */
export function validateOptions(
  type: QuestionType,
  options: OptionInput[],
): string | null {
  if (options.length < 2) return 'Cần ít nhất 2 phương án';
  if (options.length > MAX_OPTIONS) {
    return `Tối đa ${MAX_OPTIONS} phương án`;
  }
  const contents = options.map((o) => o.content.trim());
  if (contents.some((c) => c === '')) return 'Phương án không được để trống';
  const unique = new Set(contents.map((c) => c.toLowerCase()));
  if (unique.size !== contents.length) return 'Các phương án bị trùng nhau';

  const correct = options.filter((o) => o.isCorrect).length;
  switch (type) {
    case QuestionType.SINGLE:
      return correct === 1 ? null : 'Câu một đáp án cần đúng 1 phương án đúng';
    case QuestionType.MULTIPLE:
      return correct >= 1
        ? null
        : 'Câu nhiều đáp án cần ít nhất 1 phương án đúng';
    case QuestionType.TRUE_FALSE:
      if (options.length !== 2) return 'Câu đúng/sai cần đúng 2 phương án';
      return correct === 1 ? null : 'Câu đúng/sai cần đúng 1 phương án đúng';
  }
}

/** Câu đúng/sai luôn có 2 phương án cố định "Đúng", "Sai". */
export function trueFalseOptions(answerIsTrue: boolean): OptionInput[] {
  return [
    { content: TRUE_FALSE_OPTIONS[0], isCorrect: answerIsTrue },
    { content: TRUE_FALSE_OPTIONS[1], isCorrect: !answerIsTrue },
  ];
}
