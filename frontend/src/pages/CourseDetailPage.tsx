import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { useAuth } from '../auth/auth-context'
import { CourseOutline } from '../components/CourseOutline'
import { ProgressBar } from '../components/ProgressBar'
import { api } from '../lib/api'
import { formatDuration, type CourseDetail } from '../lib/courses'

export function CourseDetailPage() {
  const { slug = '' } = useParams()
  const { user, loading } = useAuth()
  const navigate = useNavigate()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enrolling, setEnrolling] = useState(false)

  const load = useCallback(
    () =>
      api<CourseDetail>(`/courses/${slug}`)
        .then(setCourse)
        .catch((e: Error) => setError(e.message)),
    [slug],
  )

  useEffect(() => {
    // Chờ khôi phục phiên xong để biết đã ghi danh chưa / có phải chủ khóa không
    if (!loading) void load()
  }, [load, loading, user])

  if (error) return <p className="error">{error}</p>
  if (!course) return <p className="muted">Đang tải...</p>

  const lessons = course.chapters.flatMap((c) => c.lessons)
  const total = lessons.reduce((s, l) => s + l.durationSec, 0)
  const enrollment = course.enrollment
  const completed = new Set(enrollment?.completedLessonIds)
  // Học tiếp: bài mở gần nhất, nếu chưa có thì bài đầu tiên chưa hoàn thành
  const resume =
    lessons.find((l) => l.id === enrollment?.lastLessonId) ??
    lessons.find((l) => !completed.has(l.id)) ??
    lessons[0]

  async function enroll() {
    setEnrolling(true)
    setError(null)
    try {
      await api(`/courses/${course!.id}/enroll`, { method: 'POST' })
      if (lessons[0]) navigate(`/learn/${course!.slug}/${lessons[0].id}`)
      else await load()
    } catch (e) {
      setError((e as Error).message)
      setEnrolling(false)
    }
  }

  let action = null
  if (lessons.length > 0) {
    if (!user) {
      action = (
        <Link className="button" to="/login" state={{ from: `/courses/${course.slug}` }}>
          Đăng nhập để ghi danh
        </Link>
      )
    } else if (enrollment || course.canManage) {
      action = (
        <Link className="button" to={`/learn/${course.slug}/${resume.id}`}>
          {enrollment && enrollment.lastLessonId ? 'Học tiếp' : 'Vào học'}
        </Link>
      )
    } else {
      action = (
        <button onClick={() => void enroll()} disabled={enrolling}>
          {enrolling ? 'Đang ghi danh...' : 'Ghi danh miễn phí'}
        </button>
      )
    }
  }

  return (
    <section className="course-detail">
      <div className="card stack">
        <div>
          {!course.published && <p className="badge">Bản nháp, chỉ bạn thấy</p>}
          <h1>{course.title}</h1>
          <p className="muted">Giảng viên: {course.instructor.fullName}</p>
          {course.description && <p className="pre-line">{course.description}</p>}
          <p className="muted small">
            {course.chapters.length} chương · {lessons.length} bài học
            {total > 0 && ` · ${formatDuration(total)}`}
          </p>
        </div>
        {enrollment && (
          <ProgressBar
            percent={enrollment.progressPercent}
            label={`Đã học ${enrollment.completedLessonIds.length}/${enrollment.totalLessons} bài (${enrollment.progressPercent}%)`}
          />
        )}
        {action && <div>{action}</div>}
      </div>

      <div className="card">
        <h2>Nội dung khóa học</h2>
        <CourseOutline
          slug={course.slug}
          chapters={course.chapters}
          completed={enrollment ? completed : undefined}
        />
      </div>
    </section>
  )
}
