import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../lib/api'
import type { CourseDetail } from '../lib/courses'
import { formatDateTime, type Attempt, type WrongList } from '../lib/practice'
import { DIFFICULTY_LABEL, LETTERS } from '../lib/questions'

const RETRY_COUNT = 20

export function WrongNotebookPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [list, setList] = useState<WrongList | null>(null)
  const [showResolved, setShowResolved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  const load = useCallback(
    async (c: CourseDetail, all: boolean) =>
      setList(await api<WrongList>(`/courses/${c.id}/wrong-questions${all ? '?all=true' : ''}`)),
    [],
  )

  useEffect(() => {
    api<CourseDetail>(`/courses/${slug}`)
      .then(async (c) => {
        setCourse(c)
        await load(c, false)
      })
      .catch((e: Error) => setError(e.message))
  }, [slug, load])

  if (error && !list) return <p className="error">{error}</p>
  if (!course || !list) return <p className="muted">Đang tải...</p>

  async function retry() {
    setStarting(true)
    setError(null)
    try {
      const attempt = await api<Attempt>('/practice/wrong', {
        method: 'POST',
        body: JSON.stringify({ courseId: course!.id, count: RETRY_COUNT }),
      })
      navigate(`/practice/${attempt.id}`)
    } catch (e) {
      setError((e as Error).message)
      setStarting(false)
    }
  }

  function toggleResolved(all: boolean) {
    setShowResolved(all)
    void load(course!, all).catch((e: Error) => setError(e.message))
  }

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link to={`/courses/${course.slug}/practice`}>← Ôn tập và thi thử</Link>
          </p>
          <h1>Sổ tay câu sai</h1>
          <p className="muted small">
            {list.unresolvedCount} câu cần ôn lại · {list.resolvedCount} câu đã làm đúng lại
          </p>
        </div>
        <button onClick={() => void retry()} disabled={starting || list.unresolvedCount === 0}>
          Ôn lại {Math.min(RETRY_COUNT, list.unresolvedCount)} câu sai
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      <label className="choice">
        <input type="checkbox" checked={showResolved} onChange={(e) => toggleResolved(e.target.checked)} />
        Hiện cả câu đã làm đúng lại
      </label>

      {list.items.length === 0 && (
        <p className="muted">
          {list.resolvedCount > 0 && !showResolved
            ? 'Bạn đã làm đúng lại mọi câu từng sai.'
            : 'Chưa có câu sai nào. Câu làm sai khi ôn tập hoặc thi thử sẽ được ghi vào đây.'}
        </p>
      )}

      {list.items.map(({ question: q, wrongCount, lastWrongAt, resolved }) => (
        <article key={q.id} className="card question-card">
          <div className="question-meta">
            <span className="badge">{q.topic.name}</span>
            <span className={`badge diff-${q.difficulty.toLowerCase()}`}>{DIFFICULTY_LABEL[q.difficulty]}</span>
            <span className="badge wrong">Sai {wrongCount} lần</span>
            {resolved && <span className="badge ok">✓ Đã làm đúng lại</span>}
            <span className="muted small">Lần sai gần nhất: {formatDateTime(lastWrongAt)}</span>
          </div>
          <p className="question-content pre-line">{q.content}</p>
          <ul className="answer-list">
            {q.options.map((o, i) => (
              <li key={o.id} className={o.isCorrect ? 'correct' : undefined}>
                <span className="option-letter">{LETTERS[i]}</span> {o.content}
                {o.isCorrect && <span className="sr-only"> (đáp án đúng)</span>}
              </li>
            ))}
          </ul>
          {q.explanation && (
            <p className="explanation pre-line">
              <strong>Giải thích:</strong> {q.explanation}
            </p>
          )}
        </article>
      ))}
    </section>
  )
}
