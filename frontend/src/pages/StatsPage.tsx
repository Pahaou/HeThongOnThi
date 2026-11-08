import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { AccuracyBars } from '../components/AccuracyBars'
import { ScoreLine } from '../components/ScoreLine'
import { api } from '../lib/api'
import type { CourseDetail } from '../lib/courses'
import { LEVEL_LABEL, type Attempt, type CourseStats } from '../lib/practice'
import { DIFFICULTY_LABEL } from '../lib/questions'

export function StatsPage() {
  const { slug = '' } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [stats, setStats] = useState<CourseStats | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    api<CourseDetail>(`/courses/${slug}`)
      .then(async (c) => {
        setCourse(c)
        setStats(await api<CourseStats>(`/courses/${c.id}/stats`))
      })
      .catch((e: Error) => setError(e.message))
  }, [slug])

  if (error) return <p className="error">{error}</p>
  if (!course || !stats) return <p className="muted">Đang tải...</p>

  const weak = stats.byTopic.filter((t) => t.level === 'WEAK')
  const total = stats.total

  async function practiceTopic(topicId: string) {
    setStarting(true)
    try {
      const attempt = await api<Attempt>('/practice/topic', {
        method: 'POST',
        body: JSON.stringify({ courseId: course!.id, topicIds: [topicId], count: 10 }),
      })
      navigate(`/practice/${attempt.id}`)
    } catch (e) {
      setError((e as Error).message)
      setStarting(false)
    }
  }

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link to={`/courses/${course.slug}/practice`}>← Ôn tập và thi thử</Link>
          </p>
          <h1>Năng lực của tôi</h1>
          <p className="muted small">{course.title}</p>
        </div>
        <Link className="button secondary" to={`/courses/${course.slug}/wrong`}>
          Sổ tay câu sai
        </Link>
      </div>

      {total.answered === 0 ? (
        <div className="card stack">
          <p className="muted">Bạn chưa làm câu nào. Ôn tập hoặc thi thử để xem năng lực theo từng chủ đề.</p>
          <div>
            <Link className="button" to={`/courses/${course.slug}/practice`}>
              Bắt đầu ôn tập
            </Link>
          </div>
        </div>
      ) : (
        <>
          <div className="stat-tiles">
            <div className="card stat-tile">
              <span className="muted small">Câu đã làm</span>
              <strong>{total.answered}</strong>
            </div>
            <div className="card stat-tile">
              <span className="muted small">Tỉ lệ đúng</span>
              <strong>{Math.round((total.accuracy ?? 0) * 100)}%</strong>
              <span className="muted small">
                {total.correct}/{total.answered} câu
              </span>
            </div>
            <div className="card stat-tile">
              <span className="muted small">Mức chung</span>
              <strong className={`level level-${total.level.toLowerCase()}`}>
                <span aria-hidden="true">{LEVEL_LABEL[total.level].icon}</span> {LEVEL_LABEL[total.level].text}
              </strong>
            </div>
          </div>

          {weak.length > 0 && (
            <div className="card stack weak-box">
              <h2>Chủ đề cần ôn thêm</h2>
              <ul className="weak-list">
                {weak.map((t) => (
                  <li key={t.id}>
                    <span>
                      <strong>{t.name}</strong>{' '}
                      <span className="muted small">
                        đúng {t.correct}/{t.answered} câu ({Math.round((t.accuracy ?? 0) * 100)}%)
                      </span>
                    </span>
                    <button className="secondary" disabled={starting} onClick={() => void practiceTopic(t.id)}>
                      Ôn 10 câu chủ đề này
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="card stack">
            <div>
              <h2>Tỉ lệ đúng theo chủ đề</h2>
              <p className="muted small">Từ 80% là mạnh, từ 50% là khá. Cần ít nhất 5 câu mới xếp mức.</p>
            </div>
            <AccuracyBars
              title="Chủ đề"
              rows={stats.byTopic.map((t) => ({ ...t, key: t.id, label: t.name }))}
            />
          </div>

          <div className="card stack">
            <h2>Tỉ lệ đúng theo độ khó</h2>
            <AccuracyBars
              title="Độ khó"
              rows={stats.byDifficulty
                .filter((d) => d.answered > 0)
                .map((d) => ({ ...d, key: d.difficulty, label: DIFFICULTY_LABEL[d.difficulty] }))}
            />
          </div>

          <div className="card stack">
            <h2>Điểm thi thử</h2>
            <ScoreLine points={stats.mockScores} />
          </div>
        </>
      )}
    </section>
  )
}
