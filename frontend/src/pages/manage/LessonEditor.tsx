import { useRef, useState, type FormEvent } from 'react'
import Markdown from 'react-markdown'
import { api } from '../../lib/api'
import { formatSize, type AttachmentInfo, type LessonType, type ManageLesson } from '../../lib/courses'

export interface LessonInput {
  type: LessonType
  title: string
  videoUrl: string | null
  content: string
  durationSec: number
}

/** Form tạo/sửa bài học. Tài liệu đính kèm chỉ có khi bài đã tồn tại. */
export function LessonEditor({
  lesson,
  onSave,
  onCancel,
  onAttachmentsChange,
}: {
  lesson?: ManageLesson
  onSave: (input: LessonInput) => Promise<void>
  onCancel: () => void
  onAttachmentsChange?: (attachments: AttachmentInfo[]) => void
}) {
  const [type, setType] = useState<LessonType>(lesson?.type ?? 'READING')
  const [content, setContent] = useState(lesson?.content ?? '')
  const [preview, setPreview] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const minutes = Number(form.get('minutes') || 0)
    setSaving(true)
    setError(null)
    try {
      await onSave({
        type,
        title: String(form.get('title')).trim(),
        videoUrl: type === 'VIDEO' ? String(form.get('videoUrl')).trim() : null,
        content,
        durationSec: Math.round(minutes * 60),
      })
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  async function onUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file || !lesson) return
    const body = new FormData()
    body.append('file', file)
    setUploading(true)
    setError(null)
    try {
      const added = await api<AttachmentInfo>(`/manage/lessons/${lesson.id}/attachments`, {
        method: 'POST',
        body,
      })
      onAttachmentsChange?.([...lesson.attachments, added])
      if (fileRef.current) fileRef.current.value = ''
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setUploading(false)
    }
  }

  async function onRemoveAttachment(id: string) {
    if (!lesson || !confirm('Xóa tài liệu này?')) return
    try {
      await api<void>(`/manage/attachments/${id}`, { method: 'DELETE' })
      onAttachmentsChange?.(lesson.attachments.filter((a) => a.id !== id))
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <form className="lesson-editor" onSubmit={onSubmit}>
      <div className="row">
        <label>
          Loại
          <select value={type} onChange={(e) => setType(e.target.value as LessonType)}>
            <option value="READING">Bài đọc</option>
            <option value="VIDEO">Video</option>
          </select>
        </label>
        <label className="grow">
          Tiêu đề
          <input name="title" defaultValue={lesson?.title} required maxLength={200} />
        </label>
        <label>
          Thời lượng (phút)
          <input
            name="minutes"
            type="number"
            min={0}
            step={1}
            defaultValue={lesson ? Math.round(lesson.durationSec / 60) : ''}
          />
        </label>
      </div>

      {type === 'VIDEO' && (
        <label>
          Link video (YouTube hoặc file .mp4)
          <input
            name="videoUrl"
            type="url"
            required
            defaultValue={lesson?.videoUrl ?? ''}
            placeholder="https://www.youtube.com/watch?v=..."
          />
        </label>
      )}

      <div>
        <div className="tabs">
          <button type="button" className={preview ? 'tab' : 'tab active'} onClick={() => setPreview(false)}>
            {type === 'VIDEO' ? 'Ghi chú (Markdown)' : 'Nội dung (Markdown)'}
          </button>
          <button type="button" className={preview ? 'tab active' : 'tab'} onClick={() => setPreview(true)}>
            Xem trước
          </button>
        </div>
        {preview ? (
          <div className="markdown preview">
            {content ? <Markdown>{content}</Markdown> : <p className="muted">Chưa có nội dung.</p>}
          </div>
        ) : (
          <textarea value={content} onChange={(e) => setContent(e.target.value)} rows={10} />
        )}
      </div>

      {lesson && (
        <div className="attachments">
          <strong>Tài liệu đính kèm</strong>
          <ul>
            {lesson.attachments.map((a) => (
              <li key={a.id}>
                {a.fileName} <span className="muted small">({formatSize(a.size)})</span>{' '}
                <button type="button" className="link danger" onClick={() => void onRemoveAttachment(a.id)}>
                  Xóa
                </button>
              </li>
            ))}
          </ul>
          <div className="row">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.zip,.png,.jpg,.jpeg,.gif,.webp"
            />
            <button type="button" className="secondary" disabled={uploading} onClick={() => void onUpload()}>
              {uploading ? 'Đang tải lên...' : 'Tải lên'}
            </button>
          </div>
          <p className="muted small">Tối đa 20MB: PDF, Word, PowerPoint, Excel, ảnh, zip.</p>
        </div>
      )}

      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu bài học'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Hủy
        </button>
      </div>
    </form>
  )
}
