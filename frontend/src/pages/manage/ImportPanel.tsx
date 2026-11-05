import { useRef, useState } from 'react'
import { api, downloadFile } from '../../lib/api'
import type { ImportResult } from '../../lib/questions'

export function ImportPanel({ courseId, onImported }: { courseId: string; onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<ImportResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function onUpload() {
    const file = fileRef.current?.files?.[0]
    if (!file) return setError('Chọn file .xlsx trước')
    const body = new FormData()
    body.append('file', file)
    setUploading(true)
    setError(null)
    setResult(null)
    try {
      const res = await api<ImportResult>(`/manage/courses/${courseId}/questions/import`, {
        method: 'POST',
        body,
      })
      setResult(res)
      if (res.created > 0) {
        onImported()
        if (fileRef.current) fileRef.current.value = ''
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="card stack import-panel">
      <h2>Nhập câu hỏi từ Excel</h2>
      <ol className="muted small steps">
        <li>
          Tải{' '}
          <button
            className="link"
            onClick={() =>
              void downloadFile('/manage/questions/import-template', 'mau-cau-hoi.xlsx').catch((e: Error) =>
                setError(e.message),
              )
            }
          >
            file mẫu
          </button>{' '}
          và điền câu hỏi theo hướng dẫn trong file.
        </li>
        <li>Chủ đề chưa có sẽ được tạo tự động.</li>
        <li>Nếu có dòng sai, không câu nào được nhập; sửa theo danh sách lỗi rồi nhập lại.</li>
      </ol>
      <div className="row">
        <input ref={fileRef} type="file" accept=".xlsx" />
        <button onClick={() => void onUpload()} disabled={uploading}>
          {uploading ? 'Đang nhập...' : 'Nhập câu hỏi'}
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {result && result.created > 0 && (
        <p className="notice">
          Đã nhập {result.created} câu hỏi
          {result.createdTopics.length > 0 && `, tạo thêm chủ đề: ${result.createdTopics.join(', ')}`}.
        </p>
      )}
      {result && result.errors.length > 0 && (
        <div className="stack">
          <p className="error">
            File có {result.errors.length} dòng lỗi, chưa nhập câu nào. Sửa các dòng sau rồi nhập lại:
          </p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Dòng</th>
                  <th>Lỗi</th>
                </tr>
              </thead>
              <tbody>
                {result.errors.map((e) => (
                  <tr key={e.row}>
                    <td>{e.row}</td>
                    <td>{e.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
