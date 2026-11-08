import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import {
  formatClock,
  type Attempt,
  type AttemptQuestion,
  type TopicAnswerResult,
} from '../lib/practice'
import { DIFFICULTY_LABEL, LETTERS } from '../lib/questions'

/** Một câu hỏi: chọn phương án; nếu đã chấm thì tô đúng/sai và hiện giải thích. */
function QuestionCard({
  index,
  question,
  disabled,
  onChange,
  action,
}: {
  index: number
  question: AttemptQuestion
  disabled: boolean
  onChange: (ids: string[]) => void
  action?: ReactNode
}) {
  const multi = question.type === 'MULTIPLE'
  const revealed = question.correctOptionIds !== undefined
  const correct = new Set(question.correctOptionIds)
  const chosen = new Set(question.selectedOptionIds)

  function pick(id: string) {
    if (multi) onChange(chosen.has(id) ? [...chosen].filter((x) => x !== id) : [...chosen, id])
    else onChange([id])
  }

  return (
    <article id={`q-${index}`} className="card question-card">
      <div className="question-meta">
        <strong>Câu {index + 1}</strong>
        <span className="badge">{question.topic.name}</span>
        <span className={`badge diff-${question.difficulty.toLowerCase()}`}>
          {DIFFICULTY_LABEL[question.difficulty]}
        </span>
        {multi && <span className="badge">Chọn nhiều đáp án</span>}
        {revealed && (
          <span className={question.isCorrect ? 'badge ok' : 'badge wrong'}>
            {question.isCorrect ? 'Đúng' : 'Sai'}
          </span>
        )}
      </div>
      <p className="question-content pre-line">{question.content}</p>
      <ul className="answer-list pick">
        {question.options.map((o, i) => {
          const cls = revealed
            ? correct.has(o.id)
              ? 'correct'
              : chosen.has(o.id)
                ? 'wrong'
                : undefined
            : chosen.has(o.id)
              ? 'chosen'
              : undefined
          return (
            <li key={o.id} className={cls}>
              <label className="choice">
                <input
                  type={multi ? 'checkbox' : 'radio'}
                  name={`q-${question.questionId}`}
                  checked={chosen.has(o.id)}
                  disabled={disabled}
                  onChange={() => pick(o.id)}
                />
                <span className="option-letter">{LETTERS[i]}</span>
                <span>{o.content}</span>
              </label>
            </li>
          )
        })}
      </ul>
      {revealed && question.explanation && (
        <p className="explanation pre-line">
          <strong>Giải thích:</strong> {question.explanation}
        </p>
      )}
      {action}
    </article>
  )
}

export function PracticePage() {
  const { id = '' } = useParams()
  const [attempt, setAttempt] = useState<Attempt | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [remaining, setRemaining] = useState<number | null>(null)
  // Chênh lệch giữa đồng hồ server và máy học viên, để đếm ngược theo giờ server
  const clockOffset = useRef(0)
  const submitting = useRef(false)
  // Các lần lưu chạy nối tiếp, để request cũ không ghi đè lựa chọn mới hơn
  const saveQueue = useRef<Promise<void>>(Promise.resolve())

  const apply = useCallback((a: Attempt) => {
    clockOffset.current = new Date(a.serverNow).getTime() - Date.now()
    setAttempt(a)
  }, [])

  useEffect(() => {
    api<Attempt>(`/practice/${id}`)
      .then(apply)
      .catch((e: Error) => setError(e.message))
  }, [id, apply])

  const submit = useCallback(async () => {
    if (submitting.current) return
    submitting.current = true
    setBusy('submit')
    try {
      apply(await api<Attempt>(`/practice/${id}/submit`, { method: 'POST' }))
      window.scrollTo({ top: 0 })
    } catch (e) {
      setError((e as Error).message)
      submitting.current = false
    } finally {
      setBusy(null)
    }
  }, [id, apply])

  // Đồng hồ đếm ngược cho thi thử; hết giờ thì tự nộp
  const deadline = attempt?.mode === 'MOCK' && !attempt.submittedAt ? attempt.deadlineAt : null
  useEffect(() => {
    if (!deadline) return setRemaining(null)
    const end = new Date(deadline).getTime()
    const tick = () => {
      const left = (end - (Date.now() + clockOffset.current)) / 1000
      setRemaining(Math.max(0, left))
      if (left <= 0) void submit()
    }
    tick()
    const timer = setInterval(tick, 1000)
    return () => clearInterval(timer)
  }, [deadline, submit])

  if (error && !attempt) return <p className="error">{error}</p>
  if (!attempt) return <p className="muted">Đang tải...</p>

  const done = !!attempt.submittedAt
  const isMock = attempt.mode === 'MOCK'
  const answeredCount = attempt.questions.filter((q) => (isMock ? q.selectedOptionIds.length > 0 : q.answered)).length

  function patchQuestion(questionId: string, patch: Partial<AttemptQuestion>) {
    setAttempt((a) =>
      a && { ...a, questions: a.questions.map((q) => (q.questionId === questionId ? { ...q, ...patch } : q)) },
    )
  }

  /** Thi thử: lưu ngay mỗi lần chọn. Hết giờ thì server trả 409 và mình tải lại bài đã nộp. */
  function saveMock(q: AttemptQuestion, ids: string[]) {
    patchQuestion(q.questionId, { selectedOptionIds: ids })
    setSaveState('saving')
    saveQueue.current = saveQueue.current
      .then(() => doSave(q.questionId, ids))
      .catch((e: Error) => setError(e.message))
  }

  async function doSave(questionId: string, ids: string[]) {
    try {
      await api(`/practice/${id}/answers/${questionId}`, {
        method: 'PUT',
        body: JSON.stringify({ selectedOptionIds: ids }),
      })
      setSaveState('saved')
    } catch (e) {
      setSaveState('error')
      if (e instanceof ApiError && e.status === 409) apply(await api<Attempt>(`/practice/${id}`))
      else setError((e as Error).message)
    }
  }

  /** Ôn tập: gửi câu trả lời và nhận đáp án + giải thích ngay. */
  async function check(q: AttemptQuestion) {
    setBusy(q.questionId)
    setError(null)
    try {
      const res = await api<TopicAnswerResult>(`/practice/${id}/answers/${q.questionId}`, {
        method: 'PUT',
        body: JSON.stringify({ selectedOptionIds: q.selectedOptionIds }),
      })
      patchQuestion(q.questionId, { answered: true, ...res })
      setAttempt((a) => a && { ...a, correctCount: (a.correctCount ?? 0) + (res.isCorrect ? 1 : 0) })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(null)
    }
  }

  function confirmSubmit() {
    const left = attempt!.totalCount - answeredCount
    const msg = left > 0 ? `Còn ${left} câu chưa trả lời. Vẫn nộp bài?` : 'Nộp bài?'
    if (confirm(msg)) void submit()
  }

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link to={`/courses/${attempt.course.slug}/practice`}>← Ôn tập và thi thử</Link>
          </p>
          <h1>{attempt.title}</h1>
        </div>
      </div>

      {done && (
        <div className="card result-box">
          <div className="score">
            {attempt.score ?? 0}
            <span>/10</span>
          </div>
          <div>
            <p>
              Đúng <strong>{attempt.correctCount}</strong>/{attempt.totalCount} câu
            </p>
            <p className="muted small">Xem lại từng câu bên dưới, câu sai có đáp án đúng và giải thích.</p>
            <Link className="button" to={`/courses/${attempt.course.slug}/practice`}>
              Làm bài khác
            </Link>
          </div>
        </div>
      )}

      {!done && (
        <div className="card exam-bar">
          <span>
            {isMock ? 'Đã chọn' : 'Đã trả lời'} {answeredCount}/{attempt.totalCount}
            {!isMock && ` · đúng ${attempt.correctCount ?? 0}`}
          </span>
          {isMock && (
            <span className="muted small">
              {saveState === 'saving' && 'Đang lưu...'}
              {saveState === 'saved' && 'Đã lưu'}
              {saveState === 'error' && 'Lưu lỗi, thử chọn lại'}
            </span>
          )}
          {remaining !== null && (
            <span className={remaining < 60 ? 'clock urgent' : 'clock'}>⏱ {formatClock(remaining)}</span>
          )}
          <button onClick={confirmSubmit} disabled={busy === 'submit'}>
            {isMock ? 'Nộp bài' : 'Kết thúc ôn tập'}
          </button>
        </div>
      )}

      {isMock && !done && (
        <nav className="card q-nav" aria-label="Chọn câu">
          {attempt.questions.map((q, i) => (
            <a key={q.questionId} href={`#q-${i}`} className={q.selectedOptionIds.length ? 'filled' : undefined}>
              {i + 1}
            </a>
          ))}
        </nav>
      )}

      {error && <p className="error">{error}</p>}

      {attempt.questions.map((q, i) => {
        const locked = done || (!isMock && q.answered)
        return (
          <QuestionCard
            key={q.questionId}
            index={i}
            question={q}
            disabled={locked}
            onChange={(ids) => (isMock ? saveMock(q, ids) : patchQuestion(q.questionId, { selectedOptionIds: ids }))}
            action={
              !isMock && !locked ? (
                <div>
                  <button
                    onClick={() => void check(q)}
                    disabled={q.selectedOptionIds.length === 0 || busy === q.questionId}
                  >
                    Kiểm tra
                  </button>
                </div>
              ) : undefined
            }
          />
        )
      })}
    </section>
  )
}
