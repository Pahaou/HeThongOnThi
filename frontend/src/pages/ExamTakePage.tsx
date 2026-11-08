import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { api, ApiError } from '../lib/api'
import type { ExamAttemptView, ExamQuestion } from '../lib/exams'
import { formatClock, formatDateTime } from '../lib/practice'
import { LETTERS } from '../lib/questions'

type SaveState = 'idle' | 'saving' | 'saved' | 'error'

export function ExamTakePage() {
  const { id = '' } = useParams()
  const [view, setView] = useState<ExamAttemptView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [remaining, setRemaining] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  // Lệch giữa giờ server và giờ máy, để đếm ngược theo giờ server
  const clockOffset = useRef(0)
  const submitted = useRef(false)
  // Các lần lưu chạy nối tiếp để request cũ không ghi đè lựa chọn mới
  const saveQueue = useRef<Promise<void>>(Promise.resolve())

  const apply = useCallback((v: ExamAttemptView) => {
    clockOffset.current = new Date(v.serverNow).getTime() - Date.now()
    if (v.status === 'SUBMITTED') submitted.current = true
    setView(v)
  }, [])

  useEffect(() => {
    // start trả về bài đang làm nếu đã bắt đầu, nên tải lại trang không tạo lượt mới
    api<ExamAttemptView>(`/exams/${id}/start`, { method: 'POST' })
      .then(apply)
      .catch((e: Error) => setError(e.message))
  }, [id, apply])

  const submit = useCallback(async () => {
    if (submitted.current) return
    submitted.current = true
    setSubmitting(true)
    try {
      await saveQueue.current
      apply(await api<ExamAttemptView>(`/exams/${id}/attempt/submit`, { method: 'POST' }))
      window.scrollTo({ top: 0 })
    } catch (e) {
      submitted.current = false
      setError((e as Error).message)
    } finally {
      setSubmitting(false)
    }
  }, [id, apply])

  const deadline = view?.status === 'IN_PROGRESS' ? view.deadlineAt : null
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

  if (error && !view) {
    return (
      <div className="card stack">
        <p className="error">{error}</p>
        <div>
          <Link className="button secondary" to="/exams">
            Về danh sách kỳ thi
          </Link>
        </div>
      </div>
    )
  }
  if (!view) return <p className="muted">Đang tải đề...</p>

  if (view.status === 'SUBMITTED') {
    return (
      <section className="stack">
        <h1>{view.exam.title}</h1>
        <div className="card result-box">
          {view.score !== null ? (
            <>
              <div className="score">
                {view.score}
                <span>/10</span>
              </div>
              <p>
                Đúng <strong>{view.correctCount}</strong>/{view.totalCount} câu
              </p>
            </>
          ) : (
            <div>
              <p>
                <strong>Bạn đã nộp bài</strong>
                {view.submittedAt && ` lúc ${formatDateTime(view.submittedAt)}`}.
              </p>
              <p className="muted">Điểm sẽ công bố sau khi kỳ thi đóng lúc {formatDateTime(view.exam.closesAt)}.</p>
            </div>
          )}
        </div>
        <div>
          <Link className="button secondary" to="/exams">
            Về danh sách kỳ thi
          </Link>
        </div>
      </section>
    )
  }

  const answered = view.questions.filter((q) => q.selectedOptionIds.length > 0).length

  function choose(q: ExamQuestion, optionId: string) {
    const multi = q.type === 'MULTIPLE'
    const current = new Set(q.selectedOptionIds)
    const ids = multi
      ? current.has(optionId)
        ? [...current].filter((x) => x !== optionId)
        : [...current, optionId]
      : [optionId]
    setView((v) => v && { ...v, questions: v.questions.map((x) => (x.questionId === q.questionId ? { ...x, selectedOptionIds: ids } : x)) })
    setSaveState('saving')
    saveQueue.current = saveQueue.current.then(() => doSave(q.questionId, ids)).catch(() => {})
  }

  async function doSave(questionId: string, ids: string[]) {
    try {
      await api(`/exams/${id}/attempt/answers/${questionId}`, {
        method: 'PUT',
        body: JSON.stringify({ selectedOptionIds: ids }),
      })
      setSaveState('saved')
    } catch (e) {
      setSaveState('error')
      // Hết giờ: server đã tự nộp, tải lại trạng thái bài
      if (e instanceof ApiError && e.status === 409) {
        apply(await api<ExamAttemptView>(`/exams/${id}/attempt`))
      } else {
        setError((e as Error).message)
      }
    }
  }

  function confirmSubmit() {
    const left = view!.totalCount - answered
    if (confirm(left > 0 ? `Còn ${left} câu chưa làm. Vẫn nộp bài? Nộp rồi không sửa được.` : 'Nộp bài? Nộp rồi không sửa được.')) {
      void submit()
    }
  }

  return (
    <section className="stack">
      <h1>{view.exam.title}</h1>
      <div className="card exam-bar">
        <span>
          Đã làm {answered}/{view.totalCount}
        </span>
        <span className="muted small" aria-live="polite">
          {saveState === 'saving' && 'Đang lưu...'}
          {saveState === 'saved' && 'Đã lưu'}
          {saveState === 'error' && 'Lưu lỗi, hãy chọn lại'}
        </span>
        {remaining !== null && (
          <span className={remaining < 60 ? 'clock urgent' : 'clock'} aria-label="Thời gian còn lại">
            ⏱ {formatClock(remaining)}
          </span>
        )}
        <button onClick={confirmSubmit} disabled={submitting}>
          Nộp bài
        </button>
      </div>

      <nav className="card q-nav" aria-label="Chọn câu">
        {view.questions.map((q, i) => (
          <a key={q.questionId} href={`#q-${i}`} className={q.selectedOptionIds.length ? 'filled' : undefined}>
            {i + 1}
          </a>
        ))}
      </nav>

      {error && <p className="error">{error}</p>}

      {view.questions.map((q, i) => {
        const multi = q.type === 'MULTIPLE'
        const chosen = new Set(q.selectedOptionIds)
        return (
          <article key={q.questionId} id={`q-${i}`} className="card question-card">
            <div className="question-meta">
              <strong>Câu {i + 1}</strong>
              {multi && <span className="badge">Chọn nhiều đáp án</span>}
            </div>
            <p className="question-content pre-line">{q.content}</p>
            <ul className="answer-list pick">
              {q.options.map((o, j) => (
                <li key={o.id} className={chosen.has(o.id) ? 'chosen' : undefined}>
                  <label className="choice">
                    <input
                      type={multi ? 'checkbox' : 'radio'}
                      name={`q-${q.questionId}`}
                      checked={chosen.has(o.id)}
                      onChange={() => choose(q, o.id)}
                    />
                    <span className="option-letter">{LETTERS[j]}</span>
                    <span>{o.content}</span>
                  </label>
                </li>
              ))}
            </ul>
          </article>
        )
      })}
    </section>
  )
}
