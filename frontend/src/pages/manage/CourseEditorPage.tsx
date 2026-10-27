import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../../lib/api'
import { formatDuration, type ManageChapter, type ManageCourse } from '../../lib/courses'
import { LessonEditor, type LessonInput } from './LessonEditor'

/** Đổi chỗ phần tử i với i+delta, trả về danh sách id theo thứ tự mới. */
function moved<T extends { id: string }>(items: T[], i: number, delta: number): string[] {
  const ids = items.map((x) => x.id)
  ;[ids[i], ids[i + delta]] = [ids[i + delta], ids[i]]
  return ids
}

export function CourseEditorPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [course, setCourse] = useState<ManageCourse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // 'new:<chapterId>' khi đang thêm bài vào chương, hoặc id bài đang sửa
  const [editing, setEditing] = useState<string | null>(null)

  const load = useCallback(() => {
    return api<ManageCourse>(`/manage/courses/${id}`)
      .then(setCourse)
      .catch((e: Error) => setError(e.message))
  }, [id])

  useEffect(() => {
    void load()
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

  if (!course) return error ? <p className="error">{error}</p> : <p className="muted">Đang tải...</p>

  function onSaveInfo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const thumbnailUrl = String(form.get('thumbnailUrl')).trim()
    void run(
      () =>
        api(`/manage/courses/${course!.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: String(form.get('title')).trim(),
            description: String(form.get('description')),
            thumbnailUrl: thumbnailUrl || null,
          }),
        }),
      'Đã lưu thông tin khóa học',
    )
  }

  function togglePublish() {
    void run(
      () =>
        api(`/manage/courses/${course!.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ published: !course!.published }),
        }),
      course!.published ? 'Đã chuyển về bản nháp' : 'Đã công bố khóa học',
    )
  }

  function deleteCourse() {
    if (!confirm(`Xóa khóa học "${course!.title}" cùng toàn bộ chương, bài học và tài liệu?`)) return
    void api(`/manage/courses/${course!.id}`, { method: 'DELETE' })
      .then(() => navigate('/manage'))
      .catch((e: Error) => setError(e.message))
  }

  function addChapter(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const title = String(new FormData(formEl).get('title')).trim()
    if (!title) return
    void run(async () => {
      await api(`/manage/courses/${course!.id}/chapters`, {
        method: 'POST',
        body: JSON.stringify({ title }),
      })
      formEl.reset()
    })
  }

  function renameChapter(ch: ManageChapter) {
    const title = prompt('Tên chương', ch.title)?.trim()
    if (!title || title === ch.title) return
    void run(() =>
      api(`/manage/chapters/${ch.id}`, { method: 'PATCH', body: JSON.stringify({ title }) }),
    )
  }

  function deleteChapter(ch: ManageChapter) {
    if (!confirm(`Xóa chương "${ch.title}" và ${ch.lessons.length} bài học bên trong?`)) return
    void run(() => api(`/manage/chapters/${ch.id}`, { method: 'DELETE' }))
  }

  function moveChapter(i: number, delta: number) {
    void run(() =>
      api(`/manage/courses/${course!.id}/chapter-order`, {
        method: 'PUT',
        body: JSON.stringify({ ids: moved(course!.chapters, i, delta) }),
      }),
    )
  }

  function moveLesson(ch: ManageChapter, i: number, delta: number) {
    void run(() =>
      api(`/manage/chapters/${ch.id}/lesson-order`, {
        method: 'PUT',
        body: JSON.stringify({ ids: moved(ch.lessons, i, delta) }),
      }),
    )
  }

  async function createLesson(chapterId: string, input: LessonInput) {
    await api(`/manage/chapters/${chapterId}/lessons`, {
      method: 'POST',
      body: JSON.stringify({ ...input, videoUrl: input.videoUrl ?? undefined }),
    })
    setEditing(null)
    await load()
  }

  async function updateLesson(lessonId: string, input: LessonInput) {
    await api(`/manage/lessons/${lessonId}`, { method: 'PATCH', body: JSON.stringify(input) })
    setEditing(null)
    await load()
  }

  function deleteLesson(lessonId: string, title: string) {
    if (!confirm(`Xóa bài học "${title}"?`)) return
    void run(() => api(`/manage/lessons/${lessonId}`, { method: 'DELETE' }))
  }

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link to="/manage">← Quản lý khóa học</Link>
          </p>
          <h1>{course.title}</h1>
        </div>
        <div className="row">
          <Link className="button secondary" to={`/courses/${course.slug}`}>
            Xem như học viên
          </Link>
          <button onClick={togglePublish}>{course.published ? 'Chuyển về nháp' : 'Công bố'}</button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <form className="card stack" onSubmit={onSaveInfo} key={course.id + course.title}>
        <h2>Thông tin chung</h2>
        <label>
          Tên khóa học
          <input name="title" defaultValue={course.title} required maxLength={200} />
        </label>
        <label>
          Mô tả
          <textarea name="description" defaultValue={course.description} rows={4} maxLength={5000} />
        </label>
        <label>
          Link ảnh bìa (không bắt buộc)
          <input name="thumbnailUrl" type="url" defaultValue={course.thumbnailUrl ?? ''} />
        </label>
        <div className="row">
          <button type="submit">Lưu thông tin</button>
          <span className={course.published ? 'badge ok' : 'badge'}>
            {course.published ? 'Đã công bố' : 'Bản nháp'}
          </span>
        </div>
      </form>

      <div className="card stack">
        <h2>Chương và bài học</h2>
        {course.chapters.length === 0 && <p className="muted">Chưa có chương nào.</p>}

        {course.chapters.map((ch, ci) => (
          <div key={ch.id} className="chapter-box">
            <div className="chapter-head">
              <strong>
                Chương {ci + 1}. {ch.title}
              </strong>
              <div className="row tight">
                <button className="icon" title="Lên" disabled={ci === 0} onClick={() => moveChapter(ci, -1)}>
                  ↑
                </button>
                <button
                  className="icon"
                  title="Xuống"
                  disabled={ci === course.chapters.length - 1}
                  onClick={() => moveChapter(ci, 1)}
                >
                  ↓
                </button>
                <button className="link" onClick={() => renameChapter(ch)}>
                  Đổi tên
                </button>
                <button className="link danger" onClick={() => deleteChapter(ch)}>
                  Xóa
                </button>
              </div>
            </div>

            <ol className="lesson-list">
              {ch.lessons.map((l, li) => (
                <li key={l.id}>
                  {editing === l.id ? (
                    <LessonEditor
                      lesson={l}
                      onSave={(input) => updateLesson(l.id, input)}
                      onCancel={() => setEditing(null)}
                      onAttachmentsChange={() => void load()}
                    />
                  ) : (
                    <div className="lesson-row">
                      <span>
                        {l.type === 'VIDEO' ? '▶' : '📄'} {l.title}
                        {l.durationSec > 0 && (
                          <span className="muted small"> · {formatDuration(l.durationSec)}</span>
                        )}
                        {l.attachments.length > 0 && (
                          <span className="muted small"> · {l.attachments.length} tài liệu</span>
                        )}
                      </span>
                      <div className="row tight">
                        <button className="icon" title="Lên" disabled={li === 0} onClick={() => moveLesson(ch, li, -1)}>
                          ↑
                        </button>
                        <button
                          className="icon"
                          title="Xuống"
                          disabled={li === ch.lessons.length - 1}
                          onClick={() => moveLesson(ch, li, 1)}
                        >
                          ↓
                        </button>
                        <button className="link" onClick={() => setEditing(l.id)}>
                          Sửa
                        </button>
                        <button className="link danger" onClick={() => deleteLesson(l.id, l.title)}>
                          Xóa
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ol>

            {editing === `new:${ch.id}` ? (
              <LessonEditor onSave={(input) => createLesson(ch.id, input)} onCancel={() => setEditing(null)} />
            ) : (
              <button className="secondary" onClick={() => setEditing(`new:${ch.id}`)}>
                + Thêm bài học
              </button>
            )}
          </div>
        ))}

        <form className="inline-form" onSubmit={addChapter}>
          <input name="title" placeholder="Tên chương mới" maxLength={200} required />
          <button type="submit">Thêm chương</button>
        </form>
      </div>

      <div className="card danger-zone">
        <h2>Xóa khóa học</h2>
        <p className="muted">Xóa vĩnh viễn khóa học cùng toàn bộ chương, bài học và tài liệu.</p>
        <button className="danger" onClick={deleteCourse}>
          Xóa khóa học
        </button>
      </div>
    </section>
  )
}
