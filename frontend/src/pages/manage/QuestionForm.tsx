import { useState, type FormEvent } from 'react'
import {
  DIFFICULTY_LABEL,
  LETTERS,
  MAX_OPTIONS,
  TYPE_LABEL,
  type Difficulty,
  type Question,
  type QuestionInput,
  type QuestionOption,
  type QuestionType,
  type Topic,
} from '../../lib/questions'

const TF_OPTIONS = ['Đúng', 'Sai']

interface LessonRef {
  id: string
  title: string
}

/** Form thêm/sửa câu hỏi. Kiểm tra nhanh ở client; server vẫn kiểm tra lại. */
export function QuestionForm({
  question,
  topics,
  lessons,
  defaultTopicId,
  onSave,
  onCancel,
}: {
  question?: Question
  topics: Topic[]
  lessons: LessonRef[]
  defaultTopicId?: string
  onSave: (input: QuestionInput) => Promise<void>
  onCancel: () => void
}) {
  const [type, setType] = useState<QuestionType>(question?.type ?? 'SINGLE')
  const [options, setOptions] = useState<QuestionOption[]>(
    question && question.type !== 'TRUE_FALSE'
      ? question.options.map((o) => ({ ...o }))
      : [
          { content: '', isCorrect: true },
          { content: '', isCorrect: false },
          { content: '', isCorrect: false },
          { content: '', isCorrect: false },
        ],
  )
  // Câu đúng/sai: lưu đáp án là "Đúng" hay "Sai"
  const [tfAnswer, setTfAnswer] = useState(
    question?.type === 'TRUE_FALSE' ? (question.options.find((o) => o.isCorrect)?.content ?? 'Đúng') : 'Đúng',
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  function setOption(i: number, patch: Partial<QuestionOption>) {
    setOptions((list) =>
      list.map((o, j) => {
        if (j === i) return { ...o, ...patch }
        // Câu một đáp án: chọn đúng phương án này thì bỏ chọn các phương án khác
        if (patch.isCorrect && type === 'SINGLE') return { ...o, isCorrect: false }
        return o
      }),
    )
  }

  function changeType(next: QuestionType) {
    setType(next)
    // Chuyển sang một đáp án mà đang có nhiều đáp án đúng thì chỉ giữ cái đầu
    if (next === 'SINGLE') {
      const first = options.findIndex((o) => o.isCorrect)
      setOptions((list) => list.map((o, i) => ({ ...o, isCorrect: i === first })))
    }
  }

  function buildOptions(): QuestionOption[] {
    if (type === 'TRUE_FALSE') {
      // Giữ id cũ nếu câu vốn là đúng/sai, để không đổi id phương án
      const old = question?.type === 'TRUE_FALSE' ? question.options : []
      return TF_OPTIONS.map((content) => ({
        id: old.find((o) => o.content === content)?.id,
        content,
        isCorrect: content === tfAnswer,
      }))
    }
    return options
      .map((o) => ({ ...o, content: o.content.trim() }))
      .filter((o) => o.content !== '')
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const opts = buildOptions()
    const correct = opts.filter((o) => o.isCorrect).length
    if (opts.length < 2) return setError('Cần ít nhất 2 phương án')
    if (type === 'SINGLE' && correct !== 1) return setError('Chọn đúng 1 phương án đúng')
    if (type === 'MULTIPLE' && correct < 1) return setError('Chọn ít nhất 1 phương án đúng')

    setSaving(true)
    setError(null)
    try {
      await onSave({
        topicId: String(form.get('topicId')),
        lessonId: String(form.get('lessonId')) || null,
        type,
        difficulty: String(form.get('difficulty')) as Difficulty,
        content: String(form.get('content')).trim(),
        explanation: String(form.get('explanation')).trim(),
        options: opts,
      })
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <form className="question-form" onSubmit={onSubmit}>
      <div className="row">
        <label className="grow">
          Chủ đề
          <select name="topicId" defaultValue={question?.topic.id ?? defaultTopicId ?? topics[0]?.id} required>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Loại
          <select value={type} onChange={(e) => changeType(e.target.value as QuestionType)}>
            {Object.entries(TYPE_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Độ khó
          <select name="difficulty" defaultValue={question?.difficulty ?? 'MEDIUM'}>
            {Object.entries(DIFFICULTY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label>
        Câu hỏi
        <textarea name="content" defaultValue={question?.content} rows={3} required maxLength={5000} />
      </label>

      <fieldset className="options-editor">
        <legend>
          Phương án{' '}
          <span className="muted small">
            {type === 'SINGLE' && '(chọn 1 phương án đúng)'}
            {type === 'MULTIPLE' && '(đánh dấu mọi phương án đúng)'}
            {type === 'TRUE_FALSE' && '(chọn đáp án đúng)'}
          </span>
        </legend>

        {type === 'TRUE_FALSE' ? (
          <div className="row">
            {TF_OPTIONS.map((v) => (
              <label key={v} className="choice">
                <input type="radio" checked={tfAnswer === v} onChange={() => setTfAnswer(v)} /> {v}
              </label>
            ))}
          </div>
        ) : (
          <>
            {options.map((o, i) => (
              <div key={o.id ?? `new-${i}`} className="option-row">
                <input
                  type={type === 'SINGLE' ? 'radio' : 'checkbox'}
                  name="correct"
                  checked={o.isCorrect}
                  onChange={(e) => setOption(i, { isCorrect: e.target.checked })}
                  aria-label={`Phương án ${LETTERS[i]} đúng`}
                />
                <span className="option-letter">{LETTERS[i]}</span>
                <input
                  className="grow"
                  value={o.content}
                  onChange={(e) => setOption(i, { content: e.target.value })}
                  placeholder={`Phương án ${LETTERS[i]}`}
                  maxLength={1000}
                />
                <button
                  type="button"
                  className="icon"
                  title="Xóa phương án"
                  disabled={options.length <= 2}
                  onClick={() => setOptions((list) => list.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </div>
            ))}
            {options.length < MAX_OPTIONS && (
              <button
                type="button"
                className="secondary"
                onClick={() => setOptions((list) => [...list, { content: '', isCorrect: false }])}
              >
                + Thêm phương án
              </button>
            )}
          </>
        )}
      </fieldset>

      <label>
        Giải thích (hiện cho học viên sau khi trả lời)
        <textarea name="explanation" defaultValue={question?.explanation} rows={2} maxLength={5000} />
      </label>

      <label>
        Bài học liên quan (không bắt buộc, dùng cho AI giải thích sau này)
        <select name="lessonId" defaultValue={question?.lesson?.id ?? ''}>
          <option value="">Không gắn</option>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
      </label>

      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu câu hỏi'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Hủy
        </button>
      </div>
    </form>
  )
}
