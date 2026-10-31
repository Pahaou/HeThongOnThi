import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/auth-context'
import { ProgressBar } from '../components/ProgressBar'
import { api } from '../lib/api'
import type { PathDetail } from '../lib/courses'

export function PathDetailPage() {
  const { slug = '' } = useParams()
  const { user, loading } = useAuth()
  const [path, setPath] = useState<PathDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Chờ khôi phục phiên để lấy được tiến độ của người xem
    if (loading) return
    api<PathDetail>(`/paths/${slug}`)
      .then(setPath)
      .catch((e: Error) => setError(e.message))
  }, [slug, loading, user])

  if (error) return <p className="error">{error}</p>
  if (!path) return <p className="muted">Đang tải...</p>

  return (
    <section className="stack">
      <div className="card stack">
        <div>
          {!path.published && <p className="badge">Bản nháp, chỉ bạn thấy</p>}
          <h1>{path.title}</h1>
          <p className="muted">Biên soạn: {path.createdBy.fullName}</p>
          {path.description && <p className="pre-line">{path.description}</p>}
          <p className="muted small">
            {path.courses.length} khóa học · {path.totalLessons} bài học
          </p>
        </div>
        {path.progressPercent !== null && (
          <ProgressBar
            percent={path.progressPercent}
            label={`Đã học ${path.completedLessons}/${path.totalLessons} bài của lộ trình (${path.progressPercent}%)`}
          />
        )}
        {!user && (
          <p className="muted">
            <Link to="/login" state={{ from: `/paths/${path.slug}` }}>
              Đăng nhập
            </Link>{' '}
            để theo dõi tiến độ.
          </p>
        )}
      </div>

      <ol className="path-steps">
        {path.courses.map((c, i) => (
          <li key={c.id} className="card path-step">
            <span className={c.progressPercent === 100 ? 'step-no done' : 'step-no'}>
              {c.progressPercent === 100 ? '✓' : i + 1}
            </span>
            <div className="path-step-body">
              <h2>
                <Link to={`/courses/${c.slug}`}>{c.title}</Link>
                {!c.published && <span className="badge"> Bản nháp</span>}
              </h2>
              <p className="muted small">
                {c.instructor.fullName} · {c.totalLessons} bài học
              </p>
              {c.description && <p className="muted clamp-3">{c.description}</p>}
              {c.enrolled && (
                <ProgressBar
                  percent={c.progressPercent}
                  label={`${c.completedLessons}/${c.totalLessons} bài`}
                />
              )}
            </div>
            <Link className={c.enrolled ? 'button' : 'button secondary'} to={`/courses/${c.slug}`}>
              {c.progressPercent === 100 ? 'Xem lại' : c.enrolled ? 'Học tiếp' : 'Xem khóa học'}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  )
}
