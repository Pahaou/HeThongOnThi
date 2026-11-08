import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { clearLocal, loadLocal, markSynced, saveLocal, type LocalAnswer } from '../lib/answer-store'
import { api, ApiError } from '../lib/api'
import type { ExamAttemptView, ExamQuestion } from '../lib/exams'
import { formatClock, formatDateTime } from '../lib/practice'
import { LETTERS } from '../lib/questions'

// Tự lưu định kỳ những câu chưa gửi được (roadmap: 5-10 giây)
const AUTOSAVE_MS = 7000
// Gom các lần chọn liên tiếp thành một request
const DEBOUNCE_MS = 400

/** Mỗi tab một mã phiên; server chỉ cho phiên mới nhất ghi bài. */
function sessionIdFor(examId: string): string {
  const key = `exam-session:${examId}`
  try {
    const existing = sessionStorage.getItem(key)
    if (existing) return existing
    const id = crypto.randomUUID()
    sessionStorage.setItem(key, id)
    return id
  } catch {
    return crypto.randomUUID()
  }
}

export function ExamTakePage() {
  const { id = '' } = useParams()
  const [view, setView] = useState<ExamAttemptView | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [offline, setOffline] = useState(!navigator.onLine)
  const [sessionLost, setSessionLost] = useState(false)
  const [pendingCount, setPendingCount] = useState(0)
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null)
  const [waitingToSubmit, setWaitingToSubmit] = useState(false)

  const sessionId = useRef(sessionIdFor(id))
  // Lệch giữa giờ server và giờ máy, để đếm ngược và đóng dấu thời gian theo giờ server
  const clockOffset = useRef(0)
  // Các câu chưa gửi được lên server, theo questionId
  const pending = useRef(new Map<string, LocalAnswer>())
  const flushing = useRef(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  const submitted = useRef(false)

  const serverNow = () => Date.now() + clockOffset.current

  /** Áp trạng thái từ server, gộp với bản lưu trên máy (bản nào chọn sau thắng). */
  const applyServer = useCallback(
    async (v: ExamAttemptView) => {
      clockOffset.current = new Date(v.serverNow).getTime() - Date.now()
      if (v.status !== 'IN_PROGRESS') {
        submitted.current = true
        pending.current.clear()
        setPendingCount(0)
        await clearLocal(id)
        setView(v)
        return
      }
      const local = await loadLocal(id)
      const byQuestion = new Map(local.map((l) => [l.questionId, l]))
      pending.current.clear()
      const questions = v.questions.map((q) => {
        const l = byQuestion.get(q.questionId)
        const serverAt = q.clientSavedAt ? new Date(q.clientSavedAt).getTime() : -1
        if (l && l.clientSavedAt > serverAt) {
          pending.current.set(q.questionId, { ...l, synced: false })
          return { ...q, selectedOptionIds: l.selectedOptionIds }
        }
        return q
      })
      setPendingCount(pending.current.size)
      setView({ ...v, questions })
    },
    [id],
  )

  const reload = useCallback(async () => {
    await applyServer(await api<ExamAttemptView>(`/exams/${id}/attempt`))
  }, [id, applyServer])

  /** Gửi các câu chưa đồng bộ. Mất mạng thì giữ lại để lần sau gửi tiếp. */
  const flush = useCallback(async (): Promise<boolean> => {
    if (flushing.current || submitted.current || pending.current.size === 0) return pending.current.size === 0
    flushing.current = true
    const batch = [...pending.current.values()]
    try {
      await api(`/exams/${id}/attempt/answers`, {
        method: 'PUT',
        body: JSON.stringify({
          sessionId: sessionId.current,
          answers: batch.map((a) => ({
            questionId: a.questionId,
            selectedOptionIds: a.selectedOptionIds,
            clientSavedAt: new Date(a.clientSavedAt).toISOString(),
          })),
        }),
      })
      for (const a of batch) {
        // Thí sinh đổi ý trong lúc đang gửi thì giữ bản mới để gửi tiếp
        if (pending.current.get(a.questionId)?.clientSavedAt === a.clientSavedAt) pending.current.delete(a.questionId)
        await markSynced(a)
      }
      setOffline(false)
      setLastSavedAt(new Date())
      return pending.current.size === 0
    } catch (e) {
      if (!(e instanceof ApiError)) {
        setOffline(true)
      } else if (e.code === 'SESSION_REPLACED') {
        setSessionLost(true)
      } else if (e.code === 'ATTEMPT_SUBMITTED') {
        await reload().catch(() => {})
      } else {
        setError(e.message)
      }
      return false
    } finally {
      flushing.current = false
      setPendingCount(pending.current.size)
    }
  }, [id, reload])

  const start = useCallback(async () => {
    // start trả về bài đang làm nếu đã bắt đầu, và giành phiên ghi bài cho tab này
    const v = await api<ExamAttemptView>(`/exams/${id}/start`, {
      method: 'POST',
      body: JSON.stringify({ sessionId: sessionId.current }),
    })
    setSessionLost(false)
    await applyServer(v)
  }, [id, applyServer])

  useEffect(() => {
    start()
      .then(() => flush())
      .catch((e: Error) => (e instanceof ApiError ? setError(e.message) : setOffline(true)))
  }, [start, flush])

  // Tự lưu định kỳ, gửi bù ngay khi có mạng lại, cảnh báo nếu đóng trang khi còn câu chưa gửi
  useEffect(() => {
    const timer = setInterval(() => void flush(), AUTOSAVE_MS)
    const onOnline = () => {
      setOffline(false)
      void flush()
    }
    const onOffline = () => setOffline(true)
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (pending.current.size > 0 && !submitted.current) e.preventDefault()
    }
    window.addEventListener('online', onOnline)
    window.addEventListener('offline', onOffline)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      clearInterval(timer)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [flush])

  const submit = useCallback(async () => {
    if (submitted.current) return
    setSubmitting(true)
    try {
      // Gửi hết câu còn chờ trước khi nộp; còn mất mạng thì đợi
      if (!(await flush())) {
        setWaitingToSubmit(true)
        return
      }
      const v = await api<ExamAttemptView>(`/exams/${id}/attempt/submit`, {
        method: 'POST',
        body: JSON.stringify({ sessionId: sessionId.current }),
      })
      setWaitingToSubmit(false)
      await applyServer(v)
      window.scrollTo({ top: 0 })
    } catch (e) {
      if (!(e instanceof ApiError)) {
        setOffline(true)
        setWaitingToSubmit(true)
      } else if (e.code === 'SESSION_REPLACED') {
        setSessionLost(true)
      } else {
        setError(e.message)
      }
    } finally {
      setSubmitting(false)
    }
  }, [id, flush, applyServer])

  // Mất phiên khi đang cuộn giữa đề: đưa thí sinh lên chỗ thông báo
  useEffect(() => {
    if (sessionLost) window.scrollTo({ top: 0, behavior: 'smooth' })
  }, [sessionLost])

  // Đang chờ mạng để nộp: có mạng lại thì nộp luôn
  useEffect(() => {
    if (waitingToSubmit && !offline) void submit()
  }, [waitingToSubmit, offline, submit])

  const deadline = view?.status === 'IN_PROGRESS' ? view.deadlineAt : null
  useEffect(() => {
    if (!deadline) return setRemaining(null)
    const end = new Date(deadline).getTime()
    const tick = () => {
      const left = (end - (Date.now() + clockOffset.current)) / 1000
      setRemaining(Math.max(0, left))
      if (left <= 0 && !submitted.current) void submit()
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
  if (!view) {
    return <p className="muted">{offline ? 'Không có mạng, chưa tải được đề. Hãy kiểm tra kết nối.' : 'Đang tải đề...'}</p>
  }

  if (view.status !== 'IN_PROGRESS') {
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
    if (sessionLost) return
    const current = new Set(q.selectedOptionIds)
    const ids =
      q.type === 'MULTIPLE'
        ? current.has(optionId)
          ? [...current].filter((x) => x !== optionId)
          : [...current, optionId]
        : [optionId]
    const local: LocalAnswer = {
      key: `${id}:${q.questionId}`,
      examId: id,
      questionId: q.questionId,
      selectedOptionIds: ids,
      clientSavedAt: serverNow(),
      synced: false,
    }
    setView(
      (v) =>
        v && { ...v, questions: v.questions.map((x) => (x.questionId === q.questionId ? { ...x, selectedOptionIds: ids } : x)) },
    )
    pending.current.set(q.questionId, local)
    setPendingCount(pending.current.size)
    void saveLocal(local)
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => void flush(), DEBOUNCE_MS)
  }

  function confirmSubmit() {
    const left = view!.totalCount - answered
    const msg = left > 0 ? `Còn ${left} câu chưa làm. Vẫn nộp bài? Nộp rồi không sửa được.` : 'Nộp bài? Nộp rồi không sửa được.'
    if (confirm(msg)) void submit()
  }

  let saveText = ''
  if (sessionLost) saveText = 'Tạm dừng: bài đang mở ở nơi khác'
  else if (pendingCount > 0) saveText = offline ? `${pendingCount} câu chờ gửi` : 'Đang lưu...'
  else if (lastSavedAt) saveText = `Đã lưu lúc ${lastSavedAt.toLocaleTimeString('vi-VN')}`

  return (
    <section className="stack">
      <h1>{view.exam.title}</h1>

      {sessionLost && (
        <div className="card banner banner-warn" role="alert">
          <p>
            <strong>Bài thi đang được mở ở thiết bị hoặc tab khác.</strong> Tab này tạm dừng ghi bài để hai nơi không ghi đè nhau.
          </p>
          <button onClick={() => void start().then(() => flush()).catch((e: Error) => setError(e.message))}>
            Tiếp tục làm ở đây
          </button>
        </div>
      )}
      {offline && !sessionLost && (
        <div className="card banner banner-warn" role="status">
          <p>
            <strong>Mất kết nối.</strong> Đáp án vẫn được lưu trên máy này
            {pendingCount > 0 && ` (${pendingCount} câu chờ gửi)`} và sẽ tự gửi khi có mạng lại. Đừng đóng trang.
          </p>
        </div>
      )}
      {waitingToSubmit && (
        <div className="card banner banner-warn" role="status">
          <p>
            <strong>Đang chờ mạng để nộp bài.</strong> Hãy giữ trang mở; bài sẽ được nộp ngay khi có kết nối.
          </p>
        </div>
      )}

      <div className="card exam-bar">
        <span>
          Đã làm {answered}/{view.totalCount}
        </span>
        <span className={offline || sessionLost ? 'small error' : 'muted small'} aria-live="polite">
          {saveText}
        </span>
        {remaining !== null && (
          <span className={remaining < 60 ? 'clock urgent' : 'clock'} aria-label="Thời gian còn lại">
            ⏱ {formatClock(remaining)}
          </span>
        )}
        <button onClick={confirmSubmit} disabled={submitting || sessionLost}>
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
                      disabled={sessionLost}
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
