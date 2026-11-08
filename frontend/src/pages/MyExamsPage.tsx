import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { api } from '../lib/api'
import { STATE_LABEL, type MyExam } from '../lib/exams'
import { formatDateTime } from '../lib/practice'

export function MyExamsPage() {
  const navigate = useNavigate()
  const [exams, setExams] = useState<MyExam[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<MyExam[]>('/exams')
      .then(setExams)
      .catch((e: Error) => setError(e.message))
  }, [])

  function enter(exam: MyExam) {
    if (
      exam.state === 'OPEN' &&
      !confirm(
        `Bắt đầu "${exam.title}"? Bạn có ${Math.round(exam.durationSec / 60)} phút, đồng hồ chạy ngay khi vào bài và chỉ được làm một lần.`,
      )
    ) {
      return
    }
    navigate(`/exams/${exam.id}/take`)
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Kỳ thi của tôi</h1>
      </div>
      {error && <p className="error">{error}</p>}
      {!exams && !error && <p className="muted">Đang tải...</p>}
      {exams?.length === 0 && <p className="muted">Bạn chưa được xếp vào kỳ thi nào.</p>}

      {exams?.map((e) => (
        <article key={e.id} className="card exam-card">
          <div className="exam-card-body">
            <div className="question-meta">
              <span className={`badge state-${e.state.toLowerCase()}`}>{STATE_LABEL[e.state]}</span>
              <Link to={`/courses/${e.course.slug}`} className="muted small">
                {e.course.title}
              </Link>
            </div>
            <h2>{e.title}</h2>
            <p className="muted small">
              Mở {formatDateTime(e.opensAt)} → đóng {formatDateTime(e.closesAt)} · {e.totalQuestions} câu ·{' '}
              {Math.round(e.durationSec / 60)} phút
            </p>
          </div>
          <div className="exam-card-action">
            {(e.state === 'OPEN' || e.state === 'IN_PROGRESS') && (
              <button onClick={() => enter(e)}>{e.state === 'OPEN' ? 'Vào thi' : 'Làm tiếp'}</button>
            )}
            {e.state === 'SUBMITTED' &&
              (e.score !== null ? (
                <span className="exam-score">
                  {e.score}
                  <span>/10</span>
                </span>
              ) : (
                <span className="muted small">Điểm công bố sau khi kỳ thi đóng</span>
              ))}
          </div>
        </article>
      ))}
    </section>
  )
}
