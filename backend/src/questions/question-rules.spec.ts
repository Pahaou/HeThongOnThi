import { QuestionType } from '../generated/prisma/client';
import { trueFalseOptions, validateOptions } from './question-rules';

const opt = (content: string, isCorrect = false) => ({ content, isCorrect });

describe('validateOptions', () => {
  it('câu một đáp án cần đúng 1 phương án đúng', () => {
    expect(
      validateOptions(QuestionType.SINGLE, [opt('A', true), opt('B')]),
    ).toBeNull();
    expect(
      validateOptions(QuestionType.SINGLE, [opt('A', true), opt('B', true)]),
    ).toMatch(/đúng 1/);
    expect(validateOptions(QuestionType.SINGLE, [opt('A'), opt('B')])).toMatch(
      /đúng 1/,
    );
  });

  it('câu nhiều đáp án cần ít nhất 1 phương án đúng', () => {
    expect(
      validateOptions(QuestionType.MULTIPLE, [
        opt('A', true),
        opt('B', true),
        opt('C'),
      ]),
    ).toBeNull();
    expect(
      validateOptions(QuestionType.MULTIPLE, [opt('A'), opt('B')]),
    ).toMatch(/ít nhất 1/);
  });

  it('câu đúng/sai cần đúng 2 phương án', () => {
    expect(
      validateOptions(QuestionType.TRUE_FALSE, trueFalseOptions(true)),
    ).toBeNull();
    expect(
      validateOptions(QuestionType.TRUE_FALSE, [
        opt('Đúng', true),
        opt('Sai'),
        opt('Không biết'),
      ]),
    ).toMatch(/2 phương án/);
  });

  it('từ chối phương án rỗng, trùng, quá ít hoặc quá nhiều', () => {
    expect(validateOptions(QuestionType.SINGLE, [opt('A', true)])).toMatch(
      /ít nhất 2/,
    );
    expect(
      validateOptions(QuestionType.SINGLE, [opt('A', true), opt('  ')]),
    ).toMatch(/trống/);
    expect(
      validateOptions(QuestionType.SINGLE, [
        opt('Hà Nội', true),
        opt('hà nội'),
      ]),
    ).toMatch(/trùng/);
    const many = 'ABCDEFGHI'.split('').map((c, i) => opt(c, i === 0));
    expect(validateOptions(QuestionType.SINGLE, many)).toMatch(/Tối đa/);
  });
});
