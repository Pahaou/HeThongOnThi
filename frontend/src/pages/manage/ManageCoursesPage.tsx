import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth-context'
import { api } from '../../lib/api'
import type { ManageCourseRow } from '../../lib/courses'

export function ManageCoursesPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [courses, setCourses] = useState<ManageCourseRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api<ManageCourseRow[]>('/manage/courses')
      .then(setCourses)
      .catch((e: Error) => setError(e.message))
  }, [])

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const title = String(new FormData(e.currentTarget).get('title')).trim()
    if (!title) return
    setCreating(true)
    setError(null)
    try {
      const course = await api<{ id: string }>('/manage/courses', {
        method: 'POST',
        body: JSON.stringify({ title }),
      })
      navigate(`/manage/courses/${course.id}`)
    } catch (err) {
      setError((err as Error).message)
      setCreating(false)
    }
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Quản lý khóa học</h1>
        <Link to="/manage/paths">Quản lý lộ trình →</Link>
      </div>

      <form className="card inline-form" onSubmit={onCreate}>
        <input name="title" placeholder="Tên khóa học mới" required maxLength={200} />
        <button type="submit" disabled={creating}>
          Tạo khóa học
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {!courses && !error && <p className="muted">Đang tải...</p>}
      {courses?.length === 0 && <p className="muted">Bạn chưa có khóa học nào.</p>}

      {courses && courses.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Khóa học</th>
                {user?.role === 'ADMIN' && <th>Giảng viên</th>}
                <th>Số chương</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {courses.map((c) => (
                <tr key={c.id}>
                  <td>
                    <Link to={`/manage/courses/${c.id}`}>{c.title}</Link>
                  </td>
                  {user?.role === 'ADMIN' && <td>{c.instructor.fullName}</td>}
                  <td>{c._count.chapters}</td>
                  <td>
                    <span className={c.published ? 'badge ok' : 'badge'}>
                      {c.published ? 'Đã công bố' : 'Bản nháp'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
