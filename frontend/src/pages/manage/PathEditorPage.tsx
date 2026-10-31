import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../../lib/api'
import type { CourseList, ManageCourseRow, ManagePath } from '../../lib/courses'

interface CourseOption {
  id: string
  title: string
  published: boolean
}

export function PathEditorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [path, setPath] = useState<ManagePath | null>(null)
  const [options, setOptions] = useState<CourseOption[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(
    () =>
      api<ManagePath>(`/manage/paths/${id}`)
        .then(setPath)
        .catch((e: Error) => setError(e.message)),
    [id],
  )

  useEffect(() => {
    void load()
    // Khóa có thể thêm: mọi khóa đã công bố + khóa nháp mình quản lý
    Promise.all([
      api<CourseList>('/courses?pageSize=50'),
      api<ManageCourseRow[]>('/manage/courses'),
    ])
      .then(([published, mine]) => {
        const map = new Map<string, CourseOption>()
        for (const c of [...published.items, ...mine]) {
          map.set(c.id, { id: c.id, title: c.title, published: c.published })
        }
        setOptions([...map.values()].sort((a, b) => a.title.localeCompare(b.title, 'vi')))
      })
      .catch((e: Error) => setError(e.message))
  }, [load])

  async function run(action: () => Promise<unknown>, message?: string) {
    setError(null)
    setNotice(null)
    try {
      await action()
      await load()
      if (message) setNotice(message)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  if (!path) return error ? <p className="error">{error}</p> : <p className="muted">Đang tải...</p>

  const courseIds = path.courses.map((pc) => pc.course.id)
  const available = options.filter((o) => !courseIds.includes(o.id))

  const saveCourses = (ids: string[]) =>
    run(() =>
      api(`/manage/paths/${path.id}/courses`, {
        method: 'PUT',
        body: JSON.stringify({ courseIds: ids }),
      }),
    )

  function move(i: number, delta: number) {
    const ids = [...courseIds]
    ;[ids[i], ids[i + delta]] = [ids[i + delta], ids[i]]
    void saveCourses(ids)
  }

  function onAdd(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const courseId = String(new FormData(e.currentTarget).get('courseId'))
    if (courseId) void saveCourses([...courseIds, courseId])
  }

  function onSaveInfo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    void run(
      () =>
        api(`/manage/paths/${path!.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: String(form.get('title')).trim(),
            description: String(form.get('description')),
          }),
        }),
      'Đã lưu thông tin lộ trình',
    )
  }

  function togglePublish() {
    void run(
      () =>
        api(`/manage/paths/${path!.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ published: !path!.published }),
        }),
      path!.published ? 'Đã chuyển về bản nháp' : 'Đã công bố lộ trình',
    )
  }

  function onDelete() {
    if (!confirm(`Xóa lộ trình "${path!.title}"? Các khóa học bên trong không bị xóa.`)) return
    void api(`/manage/paths/${path!.id}`, { method: 'DELETE' })
      .then(() => navigate('/manage/paths'))
      .catch((e: Error) => setError(e.message))
  }

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link to="/manage/paths">← Quản lý lộ trình</Link>
          </p>
          <h1>{path.title}</h1>
        </div>
        <div className="row">
          <Link className="button secondary" to={`/paths/${path.slug}`}>
            Xem như học viên
          </Link>
          <button onClick={togglePublish}>{path.published ? 'Chuyển về nháp' : 'Công bố'}</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <form className="card stack" onSubmit={onSaveInfo} key={path.id + path.title}>
        <h2>Thông tin chung</h2>
        <label>
          Tên lộ trình
          <input name="title" defaultValue={path.title} required maxLength={200} />
        </label>
        <label>
          Mô tả
          <textarea name="description" defaultValue={path.description} rows={4} maxLength={5000} />
        </label>
        <div className="row">
          <button type="submit">Lưu thông tin</button>
          <span className={path.published ? 'badge ok' : 'badge'}>
            {path.published ? 'Đã công bố' : 'Bản nháp'}
          </span>
        </div>
      </form>

      <div className="card stack">
        <h2>Các khóa học theo thứ tự</h2>
        {path.courses.length === 0 && <p className="muted">Chưa có khóa học nào.</p>}
        <ol className="lesson-list">
          {path.courses.map(({ course }, i) => (
            <li key={course.id} className="lesson-row">
              <span>
                <strong>{i + 1}.</strong> {course.title}{' '}
                <span className="muted small">· {course.instructor.fullName}</span>
                {!course.published && <span className="badge"> Bản nháp</span>}
              </span>
              <div className="row tight">
                <button className="icon" title="Lên" disabled={i === 0} onClick={() => move(i, -1)}>
                  ↑
                </button>
                <button
                  className="icon"
                  title="Xuống"
                  disabled={i === path.courses.length - 1}
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                <button
                  className="link danger"
                  onClick={() => void saveCourses(courseIds.filter((cid) => cid !== course.id))}
                >
                  Bỏ khỏi lộ trình
                </button>
              </div>
            </li>
          ))}
        </ol>

        {available.length > 0 ? (
          <form className="inline-form" onSubmit={onAdd}>
            <select name="courseId" defaultValue="" required>
              <option value="" disabled>
                Chọn khóa học để thêm...
              </option>
              {available.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.title}
                  {o.published ? '' : ' (bản nháp)'}
                </option>
              ))}
            </select>
            <button type="submit">Thêm vào lộ trình</button>
          </form>
        ) : (
          <p className="muted small">Không còn khóa học nào để thêm.</p>
        )}
        <p className="muted small">
          Khóa bản nháp chỉ hiện với bạn; học viên chỉ thấy các khóa đã công bố.
        </p>
      </div>

      <div className="card danger-zone">
        <h2>Xóa lộ trình</h2>
        <p className="muted">Chỉ xóa lộ trình, các khóa học bên trong vẫn giữ nguyên.</p>
        <button className="danger" onClick={onDelete}>
          Xóa lộ trình
        </button>
      </div>
    </section>
  )
}
