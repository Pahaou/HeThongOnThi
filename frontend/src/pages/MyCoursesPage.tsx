import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ProgressBar } from '../components/ProgressBar'
import { api } from '../lib/api'
import type { MyCourse } from '../lib/courses'

export function MyCoursesPage() {
  const [courses, setCourses] = useState<MyCourse[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<MyCourse[]>('/me/courses')
      .then(setCourses)
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <section>
      <div className="page-head">
        <h1>Khóa học của tôi</h1>
      </div>

      {error && <p className="error">{error}</p>}
      {!courses && !error && <p className="muted">Đang tải...</p>}
      {courses?.length === 0 && (
        <div className="card stack">
          <p className="muted">Bạn chưa ghi danh khóa học nào.</p>
          <div>
            <Link className="button" to="/">
              Xem danh mục khóa học
            </Link>
          </div>
        </div>
      )}

      {courses && courses.length > 0 && (
        <div className="course-grid">
          {courses.map((c) => {
            const to = c.lastLessonId ? `/learn/${c.slug}/${c.lastLessonId}` : `/courses/${c.slug}`
            return (
              <div key={c.id} className="course-card">
                <Link to={`/courses/${c.slug}`} className="thumb">
                  {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt="" /> : <span>{c.title[0]}</span>}
                </Link>
                <div className="course-card-body stack">
                  <div>
                    <h2>
                      <Link to={`/courses/${c.slug}`}>{c.title}</Link>
                    </h2>
                    <p className="muted">{c.instructor.fullName}</p>
                  </div>
                  <ProgressBar
                    percent={c.progressPercent}
                    label={`${c.completedLessons}/${c.totalLessons} bài`}
                  />
                  <div>
                    <Link className="button" to={to}>
                      {c.progressPercent === 100 ? 'Xem lại' : c.lastLessonId ? 'Học tiếp' : 'Bắt đầu học'}
                    </Link>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
