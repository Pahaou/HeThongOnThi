import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../lib/api'
import type { CourseDetail } from '../lib/courses'
import {
  formatDateTime,
  type Attempt,
  type AttemptSummary,
  type PracticeOptions,
} from '../lib/practice'
import { DIFFICULTY_LABEL, type Difficulty } from '../lib/questions'

export function PracticeHomePage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [options, setOptions] = useState<PracticeOptions | null>(null)
  const [history, setHistory] = useState<AttemptSummary[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [difficulty, setDifficulty] = useState<Difficulty | ''>('')
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    api<CourseDetail>(`/courses/${slug}`)
      .then(async (c) => {
        setCourse(c)
        const [opts, hist] = await Promise.all([
          api<PracticeOptions>(`/courses/${c.id}/practice-options`),
          api<AttemptSummary[]>(`/courses/${c.id}/practice-history`),
        ])
        setOptions(opts)
        setHistory(hist)
      })
      .catch((e: Error) => setError(e.message))
  }, [slug])

  if (error && !options) {
    return (
      <div className="card stack">
        <p className="error">{error}</p>
        <div>
          <Link className="button secondary" to={`/courses/${slug}`}>
            Về trang khóa học
          </Link>
        </div>
      </div>
    )
  }
  if (!course || !options) return <p className="muted">Đang tải...</p>

  // Số câu có thể ôn theo lựa chọn hiện tại
  const chosen = options.topics.filter((t) => selected.size === 0 || selected.has(t.id))
  const available = chosen.reduce(
    (s, t) => s + (difficulty ? t.counts[difficulty] : t.counts.EASY + t.counts.MEDIUM + t.counts.HARD),
    0,
  )

  async function start(path: string, body: object) {
    setStarting(true)
    setError(null)
    try {
      const attempt = await api<Attempt>(path, { method: 'POST', body: JSON.stringify(body) })
      navigate(`/practice/${attempt.id}`)
    } catch (e) {
      setError((e as Error).message)
      setStarting(false)
    }
  }

  function onStartTopic(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const count = Number(new FormData(e.currentTarget).get('count'))
    void start('/practice/topic', {
      courseId: course!.id,
      topicIds: selected.size ? [...selected] : undefined,
      difficulty: difficulty || undefined,
      count,
    })
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link to={`/courses/${course.slug}`}>← {course.title}</Link>
          </p>
          <h1>Ôn tập và thi thử</h1>
        </div>
        <div className="row">
          <Link className="button secondary" to={`/courses/${course.slug}/stats`}>
            Năng lực của tôi
          </Link>
          <Link className="button secondary" to={`/courses/${course.slug}/wrong`}>
            Sổ tay câu sai
          </Link>
        </div>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="practice-grid">
        <form className="card stack" onSubmit={onStartTopic}>
          <div>
            <h2>Ôn tập theo chủ đề</h2>
            <p className="muted small">Trả lời từng câu, xem đáp án và giải thích ngay. Không tính giờ.</p>
          </div>
          {options.topics.length === 0 ? (
            <p className="muted">Khóa học chưa có câu hỏi để ôn tập.</p>
          ) : (
            <>
              <fieldset className="topic-picks">
                <legend className="small muted">Chủ đề (bỏ trống = tất cả)</legend>
                {options.topics.map((t) => (
                  <label key={t.id} className="choice">
                    <input type="checkbox" checked={selected.has(t.id)} onChange={() => toggle(t.id)} />
                    {t.name}
                    <span className="muted small">
                      ({t.counts.EASY + t.counts.MEDIUM + t.counts.HARD} câu)
                    </span>
                  </label>
                ))}
              </fieldset>
              <div className="row">
                <label>
                  Độ khó
                  <select value={difficulty} onChange={(e) => setDifficulty(e.target.value as Difficulty | '')}>
                    <option value="">Tất cả</option>
                    {Object.entries(DIFFICULTY_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Số câu
                  <input name="count" type="number" min={1} max={50} defaultValue={10} required />
                </label>
              </div>
              <p className="muted small">Hiện có {available} câu phù hợp.</p>
              <div>
                <button type="submit" disabled={starting || available === 0}>
                  Bắt đầu ôn tập
                </button>
              </div>
            </>
          )}
        </form>

        <div className="card stack">
          <div>
            <h2>Thi thử</h2>
            <p className="muted small">Đề sinh ngẫu nhiên theo ma trận, có tính giờ, chấm khi nộp bài.</p>
          </div>
          {options.blueprints.length === 0 && <p className="muted">Chưa có đề thi thử nào.</p>}
          {options.blueprints.map((b) => (
            <div key={b.id} className="blueprint-row">
              <div>
                <strong>{b.title}</strong>
                <p className="muted small">
                  {b.totalQuestions} câu · {Math.round(b.durationSec / 60)} phút
                </p>
              </div>
              <button
                disabled={starting}
                onClick={() => {
                  if (confirm(`Bắt đầu "${b.title}"? Đồng hồ sẽ chạy ngay khi vào bài.`)) {
                    void start('/practice/mock', { blueprintId: b.id })
                  }
                }}
              >
                Bắt đầu thi
              </button>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h2>Lịch sử làm bài</h2>
        {history.length === 0 ? (
          <p className="muted">Chưa có lần làm bài nào.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Bài</th>
                  <th>Loại</th>
                  <th>Bắt đầu</th>
                  <th>Kết quả</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id}>
                    <td>{h.title}</td>
                    <td>{h.mode === 'MOCK' ? 'Thi thử' : 'Ôn tập'}</td>
                    <td>{formatDateTime(h.startedAt)}</td>
                    <td>
                      {h.submittedAt ? (
                        <>
                          <strong>{h.score ?? 0}</strong>/10{' '}
                          <span className="muted small">
                            ({h.correctCount}/{h.totalCount} câu)
                          </span>
                        </>
                      ) : (
                        <span className="badge">Đang làm</span>
                      )}
                    </td>
                    <td>
                      <Link to={`/practice/${h.id}`}>{h.submittedAt ? 'Xem lại' : 'Làm tiếp'}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}
