import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../../lib/api'
import { toLocalInput, type ManageExamRow } from '../../lib/exams'
import { formatDateTime, type ManageBlueprint } from '../../lib/practice'

export function ManageExamsPage() {
  const { id: courseId = '' } = useParams()
  const navigate = useNavigate()
  const [exams, setExams] = useState<ManageExamRow[] | null>(null)
  const [blueprints, setBlueprints] = useState<ManageBlueprint[]>([])
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    () =>
      Promise.all([
        api<ManageExamRow[]>(`/manage/courses/${courseId}/exams`),
        api<ManageBlueprint[]>(`/manage/courses/${courseId}/blueprints`),
      ])
        .then(([e, b]) => {
          setExams(e)
          setBlueprints(b)
        })
        .catch((err: Error) => setError(err.message)),
    [courseId],
  )

  useEffect(() => {
    void load()
  }, [load])

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError(null)
    try {
      const exam = await api<{ id: string }>(`/manage/courses/${courseId}/exams`, {
        method: 'POST',
        body: JSON.stringify({
          title: String(form.get('title')).trim(),
          blueprintId: String(form.get('blueprintId')),
          opensAt: new Date(String(form.get('opensAt'))).toISOString(),
          closesAt: new Date(String(form.get('closesAt'))).toISOString(),
          durationSec: Math.round(Number(form.get('minutes')) * 60),
          shuffleOptions: form.get('shuffleOptions') === 'on',
        }),
      })
      navigate(`/manage/exams/${exam.id}`)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  // Gợi ý mặc định: mở sau 1 giờ, đóng sau 3 giờ
  const defaultOpen = toLocalInput(new Date(Date.now() + 3600_000).toISOString())
  const defaultClose = toLocalInput(new Date(Date.now() + 3 * 3600_000).toISOString())

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link to={`/manage/courses/${courseId}`}>← Khóa học</Link>
          </p>
          <h1>Kỳ thi chính thức</h1>
        </div>
        <button onClick={() => setCreating((v) => !v)} disabled={blueprints.length === 0}>
          {creating ? 'Đóng' : '+ Tạo kỳ thi'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
      {blueprints.length === 0 && exams && (
        <p className="muted">
          Cần có ít nhất một{' '}
          <Link to={`/manage/courses/${courseId}/blueprints`}>đề thi thử (ma trận đề)</Link> để làm khung cho kỳ thi.
        </p>
      )}

      {creating && (
        <form className="card question-form" onSubmit={onCreate}>
          <h2>Kỳ thi mới</h2>
          <div className="row">
            <label className="grow">
              Tên kỳ thi
              <input name="title" required maxLength={200} placeholder="vd. Thi giữa kỳ" />
            </label>
            <label className="grow">
              Ma trận đề (chép từ đề thi thử)
              <select name="blueprintId" required>
                {blueprints.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} ({b.totalQuestions} câu){b.ready ? '' : ' - kho thiếu câu'}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="row">
            <label>
              Mở đề
              <input name="opensAt" type="datetime-local" defaultValue={defaultOpen} required />
            </label>
            <label>
              Đóng đề
              <input name="closesAt" type="datetime-local" defaultValue={defaultClose} required />
            </label>
            <label>
              Thời gian làm (phút)
              <input name="minutes" type="number" min={1} max={300} defaultValue={45} required />
            </label>
          </div>
          <label className="choice">
            <input name="shuffleOptions" type="checkbox" defaultChecked /> Xáo trộn thứ tự phương án
          </label>
          <p className="muted small">
            Mỗi thí sinh nhận một đề ngẫu nhiên theo ma trận, thứ tự câu khác nhau. Thí sinh vào muộn thì hạn nộp bị cắt ở giờ
            đóng đề.
          </p>
          <div>
            <button type="submit">Tạo kỳ thi</button>
          </div>
        </form>
      )}

      {!exams && <p className="muted">Đang tải...</p>}
      {exams?.length === 0 && !creating && <p className="muted">Chưa có kỳ thi nào.</p>}
      {exams && exams.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Kỳ thi</th>
                <th>Mở → đóng</th>
                <th>Đề</th>
                <th>Thí sinh</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {exams.map((e) => (
                <tr key={e.id}>
                  <td>
                    <Link to={`/manage/exams/${e.id}`}>{e.title}</Link>
                  </td>
                  <td className="small">
                    {formatDateTime(e.opensAt)} → {formatDateTime(e.closesAt)}
                  </td>
                  <td className="small">
                    {e.totalQuestions} câu · {Math.round(e.durationSec / 60)} phút
                  </td>
                  <td>{e.candidateCount}</td>
                  <td>
                    <span className={e.status === 'PUBLISHED' ? 'badge ok' : 'badge'}>
                      {e.status === 'PUBLISHED' ? 'Đã công bố' : 'Bản nháp'}
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
