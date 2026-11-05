import { Difficulty, QuestionType } from '../generated/prisma/client';
import { slugify } from '../courses/slug';
import {
  OptionInput,
  trueFalseOptions,
  validateOptions,
} from './question-rules';

export const MAX_IMPORT_ROWS = 1000;
export const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const;

/** Thứ tự cột trong file Excel (dòng 1 là tiêu đề). */
export const IMPORT_COLUMNS = [
  'Chủ đề',
  'Loại',
  'Độ khó',
  'Câu hỏi',
  ...OPTION_LETTERS.map((l) => `Đáp án ${l}`),
  'Đáp án đúng',
  'Giải thích',
] as const;

export interface ParsedQuestion {
  topicName: string;
  type: QuestionType;
  difficulty: Difficulty;
  content: string;
  explanation: string;
  options: OptionInput[];
}

export type RowResult =
  { ok: true; value: ParsedQuestion } | { ok: false; error: string };

// So khớp không phân biệt hoa thường, dấu và khoảng trắng: "Đúng/Sai" -> "dung-sai"
const norm = (s: string) => slugify(s);

const TYPE_ALIASES: Record<string, QuestionType> = {
  '1-dap-an': QuestionType.SINGLE,
  'mot-dap-an': QuestionType.SINGLE,
  single: QuestionType.SINGLE,
  'nhieu-dap-an': QuestionType.MULTIPLE,
  multiple: QuestionType.MULTIPLE,
  'dung-sai': QuestionType.TRUE_FALSE,
  'true-false': QuestionType.TRUE_FALSE,
};

const DIFFICULTY_ALIASES: Record<string, Difficulty> = {
  de: Difficulty.EASY,
  easy: Difficulty.EASY,
  'trung-binh': Difficulty.MEDIUM,
  medium: Difficulty.MEDIUM,
  kho: Difficulty.HARD,
  hard: Difficulty.HARD,
};

const TRUE_WORDS = new Set(['dung', 'true', 'a']);
const FALSE_WORDS = new Set(['sai', 'false', 'b']);

/**
 * Chuyển một dòng (mảng chuỗi theo IMPORT_COLUMNS) thành câu hỏi hợp lệ,
 * hoặc trả về lỗi mô tả cho người dùng sửa file.
 */
export function parseRow(cells: string[]): RowResult {
  const cell = (i: number) => (cells[i] ?? '').trim();
  const fail = (error: string): RowResult => ({ ok: false, error });

  const topicName = cell(0);
  const typeRaw = cell(1);
  const difficultyRaw = cell(2);
  const content = cell(3);
  const optionTexts = OPTION_LETTERS.map((_, i) => cell(4 + i));
  const answerRaw = cell(4 + OPTION_LETTERS.length);
  const explanation = cell(5 + OPTION_LETTERS.length);

  if (!topicName) return fail('Thiếu chủ đề');
  if (topicName.length > 100) return fail('Tên chủ đề dài quá 100 ký tự');
  if (!content) return fail('Thiếu nội dung câu hỏi');

  const type = TYPE_ALIASES[norm(typeRaw)];
  if (!type) {
    return fail(
      `Loại "${typeRaw}" không hợp lệ (dùng: 1 đáp án, nhiều đáp án, đúng/sai)`,
    );
  }
  const difficulty = DIFFICULTY_ALIASES[norm(difficultyRaw)];
  if (!difficulty) {
    return fail(
      `Độ khó "${difficultyRaw}" không hợp lệ (dùng: dễ, trung bình, khó)`,
    );
  }
  if (!answerRaw) return fail('Thiếu đáp án đúng');

  let options: OptionInput[];
  if (type === QuestionType.TRUE_FALSE) {
    const answer = norm(answerRaw);
    if (TRUE_WORDS.has(answer)) options = trueFalseOptions(true);
    else if (FALSE_WORDS.has(answer)) options = trueFalseOptions(false);
    else
      return fail(
        `Đáp án "${answerRaw}" không hợp lệ cho câu đúng/sai (dùng: Đúng hoặc Sai)`,
      );
  } else {
    const letters = answerRaw
      .toUpperCase()
      .split(/[\s,;]+/)
      .filter(Boolean);
    const invalid = letters.filter(
      (l) => !(OPTION_LETTERS as readonly string[]).includes(l),
    );
    if (invalid.length > 0) {
      return fail(
        `Đáp án đúng "${invalid.join(', ')}" không hợp lệ (dùng chữ A-F)`,
      );
    }
    const correct = new Set(
      letters.map((l) => OPTION_LETTERS.indexOf(l as 'A')),
    );
    const empty = [...correct].filter((i) => !optionTexts[i]);
    if (empty.length > 0) {
      return fail(
        `Đáp án đúng ${empty.map((i) => OPTION_LETTERS[i]).join(', ')} nhưng ô đáp án đó đang trống`,
      );
    }
    options = optionTexts
      .map((text, i) => ({ content: text, isCorrect: correct.has(i) }))
      .filter((o) => o.content !== '');
  }

  const error = validateOptions(type, options);
  if (error) return fail(error);
  return {
    ok: true,
    value: { topicName, type, difficulty, content, explanation, options },
  };
}
