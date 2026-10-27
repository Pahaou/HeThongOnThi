import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { useAuth } from '../auth/auth-context'
import { CourseOutline } from '../components/CourseOutline'
import { api } from '../lib/api'
import { formatDuration, type CourseDetail } from '../lib/courses'

export function CourseDetailPage() {
  const { slug = '' } = useParams()
  const { user, loading } = useAuth()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Chờ khôi phục phiên xong để giảng viên xem trước được bản nháp
    if (loading) return
    api<CourseDetail>(`/courses/${slug}`)
      .then(setCourse)
      .catch((e: Error) => setError(e.message))
  }, [slug, loading])

  if (error) return <p className="error">{error}</p>
  if (!course) return <p className="muted">Đang tải...</p>

  const lessons = course.chapters.flatMap((c) => c.lessons)
  const total = lessons.reduce((s, l) => s + l.durationSec, 0)
  const first = lessons[0]

  return (
    <section className="course-detail">
      <div className="card">
        {!course.published && <p className="badge">Bản nháp, chỉ bạn thấy</p>}
        <h1>{course.title}</h1>
        <p className="muted">Giảng viên: {course.instructor.fullName}</p>
        {course.description && <p className="pre-line">{course.description}</p>}
        <p className="muted small">
          {course.chapters.length} chương · {lessons.length} bài học
          {total > 0 && ` · ${formatDuration(total)}`}
        </p>
        {first &&
          (user ? (
            <Link className="button" to={`/learn/${course.slug}/${first.id}`}>
              Vào học
            </Link>
          ) : (
            <Link className="button" to="/login" state={{ from: `/learn/${course.slug}/${first.id}` }}>
              Đăng nhập để học
            </Link>
          ))}
      </div>

      <div className="card">
        <h2>Nội dung khóa học</h2>
        <CourseOutline slug={course.slug} chapters={course.chapters} />
      </div>
    </section>
  )
}
