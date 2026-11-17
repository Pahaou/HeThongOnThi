import { useState, type FormEvent } from 'react'
import { api } from '../../lib/api'
import { DIFFICULTY_LABEL, type Topic } from '../../lib/questions'

interface LessonRef {
  id: string
  title: string
}

type SourceKind = 'lesson' | 'file' | 'text'

/** AI đề xuất câu hỏi từ tài liệu; câu được tạo ở trạng thái nháp, chờ giảng viên duyệt. */
export function AiGeneratePanel({
  courseId,
  topics,
  lessons,
  onCreated,
}: {
  courseId: string
  topics: Topic[]
  lessons: LessonRef[]
  onCreated: (created: number) => void
}) {
  const [kind, setKind] = useState<SourceKind>(lessons.length ? 'lesson' : 'file')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const body = new FormData()
    body.append('topicId', String(form.get('topicId')))
    body.append('difficulty', String(form.get('difficulty')))
    body.append('count', String(form.get('count')))
    if (kind === 'lesson') body.append('lessonId', String(form.get('lessonId')))
    if (kind === 'text') body.append('text', String(form.get('text')))
    if (kind === 'file') {
      const file = form.get('file')
      if (!(file instanceof File) || file.size === 0) return setError('Chọn file tài liệu')
      body.append('file', file)
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const res = await api<{ created: number; skipped: number }>(`/manage/courses/${courseId}/ai/generate-questions`, {
        method: 'POST',
        body,
      })
      setMessage(
        `AI đã đề xuất ${res.created} câu (đang ở trạng thái chờ duyệt)` +
          (res.skipped ? `, bỏ ${res.skipped} câu sai định dạng.` : '.'),
      )
      onCreated(res.created)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="card stack" onSubmit={onSubmit}>
      <div>
        <h2>✦ Tạo câu hỏi bằng AI</h2>
        <p className="muted small">
          AI đọc tài liệu và đề xuất câu hỏi. Câu đề xuất ở trạng thái <strong>chờ duyệt</strong>: bạn xem, sửa rồi bấm Duyệt mới
          dùng cho ôn tập và thi.
        </p>
      </div>
      <div className="row">
        <label className="grow">
          Chủ đề
          <select name="topicId" required>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Độ khó
          <select name="difficulty" defaultValue="MEDIUM">
            {Object.entries(DIFFICULTY_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Số câu
          <input name="count" type="number" min={1} max={20} defaultValue={5} required />
        </label>
      </div>

      <fieldset className="topic-picks">
        <legend className="small muted">Tài liệu</legend>
        <label className="choice">
          <input type="radio" checked={kind === 'lesson'} onChange={() => setKind('lesson')} disabled={!lessons.length} />
          Bài học trong khóa
        </label>
        <label className="choice">
          <input type="radio" checked={kind === 'file'} onChange={() => setKind('file')} /> Tải file (.pdf, .txt, .md)
        </label>
        <label className="choice">
          <input type="radio" checked={kind === 'text'} onChange={() => setKind('text')} /> Dán nội dung
        </label>
      </fieldset>
      {kind === 'lesson' && (
        <select name="lessonId" required>
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {l.title}
            </option>
          ))}
        </select>
      )}
      {kind === 'file' && <input name="file" type="file" accept=".pdf,.txt,.md" />}
      {kind === 'text' && <textarea name="text" rows={6} maxLength={60000} required placeholder="Dán nội dung tài liệu..." />}

      {error && <p className="error">{error}</p>}
      {message && <p className="notice">{message}</p>}
      <div>
        <button type="submit" disabled={busy || topics.length === 0}>
          {busy ? 'AI đang soạn câu hỏi (có thể mất 1-2 phút)...' : 'Tạo câu hỏi'}
        </button>
      </div>
    </form>
  )
}
