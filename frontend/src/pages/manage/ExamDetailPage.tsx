import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api } from '../../lib/api'
import {
  EVENT_LABEL,
  toLocalInput,
  type AddCandidatesResult,
  type CandidateLog,
  type ExamResultRow,
  type ManageExam,
} from '../../lib/exams'
import { formatDateTime } from '../../lib/practice'
import { DIFFICULTY_LABEL } from '../../lib/questions'

function attemptStatus(r: ExamResultRow): string {
  if (!r.attempt) return 'Chưa vào thi'
  if (r.attempt.status === 'IN_PROGRESS') return 'Đang làm'
  return r.attempt.status === 'GRADED' ? 'Đã chấm' : 'Đã nộp, đang chấm'
}

export function ExamDetailPage() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const [exam, setExam] = useState<ManageExam | null>(null)
  const [results, setResults] = useState<ExamResultRow[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [addResult, setAddResult] = useState<AddCandidatesResult | null>(null)
  // Nhật ký đang mở của một thí sinh
  const [logFor, setLogFor] = useState<{ id: string; log: CandidateLog } | null>(null)

  const load = useCallback(
    () =>
      Promise.all([api<ManageExam>(`/manage/exams/${id}`), api<ExamResultRow[]>(`/manage/exams/${id}/results`)])
        .then(([e, r]) => {
          setExam(e)
          setResults(r)
        })
        .catch((err: Error) => setError(err.message)),
    [id],
  )

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
    } catch (e) {
      setError((e as Error).message)
    }
  }

  if (!exam) return error ? <p className="error">{error}</p> : <p className="muted">Đang tải...</p>

  const started = exam.startedCount > 0
  const published = exam.status === 'PUBLISHED'
  const submittedCount = results.filter((r) => r.attempt && r.attempt.status !== 'IN_PROGRESS').length

  function onSaveInfo(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const body: Record<string, unknown> = { title: String(form.get('title')).trim() }
    // Ô datetime-local bỏ phần giây; chỉ gửi giờ đóng khi thật sự đổi,
    // nếu không server sẽ hiểu là rút ngắn giờ đóng
    const closesInput = String(form.get('closesAt'))
    if (closesInput !== toLocalInput(exam!.closesAt)) body.closesAt = new Date(closesInput).toISOString()
    // Đã có người làm bài thì chỉ đổi tên và lùi giờ đóng
    if (!started) {
      body.opensAt = new Date(String(form.get('opensAt'))).toISOString()
      body.durationSec = Math.round(Number(form.get('minutes')) * 60)
      body.shuffleOptions = form.get('shuffleOptions') === 'on'
    }
    void run(() => api(`/manage/exams/${id}`, { method: 'PATCH', body: JSON.stringify(body) }), 'Đã lưu')
  }

  async function openLog(candidateId: string) {
    if (logFor?.id === candidateId) return setLogFor(null)
    try {
      setLogFor({ id: candidateId, log: await api<CandidateLog>(`/manage/exams/${id}/candidates/${candidateId}/log`) })
    } catch (e) {
      setError((e as Error).message)
    }
  }

  function extend(r: ExamResultRow) {
    const minutes = Number(prompt(`Gia hạn cho ${r.user.fullName} thêm bao nhiêu phút?`, '5'))
    if (!minutes || minutes < 1) return
    const reason = prompt('Lý do gia hạn (bắt buộc, vd. mất điện, lỗi máy):')?.trim()
    if (!reason) return
    void run(
      () =>
        api(`/manage/exams/${id}/candidates/${r.id}/extensions`, {
          method: 'POST',
          body: JSON.stringify({ minutes, reason }),
        }),
      `Đã gia hạn ${minutes} phút cho ${r.user.fullName}`,
    )
  }

  function onAddCandidates(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const emails = String(new FormData(formEl).get('emails'))
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean)
    if (emails.length === 0) return
    void run(async () => {
      setAddResult(
        await api<AddCandidatesResult>(`/manage/exams/${id}/candidates`, {
          method: 'POST',
          body: JSON.stringify({ emails }),
        }),
      )
      formEl.reset()
    })
  }

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link to={`/manage/courses/${exam.courseId}/exams`}>← Kỳ thi của khóa</Link>
          </p>
          <h1>{exam.title}</h1>
          <p className="muted small">
            {formatDateTime(exam.opensAt)} → {formatDateTime(exam.closesAt)} · {Math.round(exam.durationSec / 60)} phút
          </p>
        </div>
        <div className="row">
          <Link className="button secondary" to={`/manage/exams/${id}/proctor`}>
            Màn giám thị
          </Link>
          <span className={published ? 'badge ok' : 'badge'}>{published ? 'Đã công bố' : 'Bản nháp'}</span>
          <button
            disabled={published && started}
            onClick={() =>
              void run(
                () => api(`/manage/exams/${id}/publish`, { method: 'PATCH', body: JSON.stringify({ published: !published }) }),
                published ? 'Đã chuyển về nháp' : 'Đã công bố, thí sinh thấy kỳ thi trong mục Kỳ thi',
              )
            }
          >
            {published ? 'Hủy công bố' : 'Công bố'}
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      <div className="stat-tiles">
        <div className="card stat-tile">
          <span className="muted small">Thí sinh</span>
          <strong>{results.length}</strong>
        </div>
        <div className="card stat-tile">
          <span className="muted small">Đã vào thi</span>
          <strong>{exam.startedCount}</strong>
        </div>
        <div className="card stat-tile">
          <span className="muted small">Đã nộp</span>
          <strong>{submittedCount}</strong>
        </div>
      </div>

      <form className="card question-form" onSubmit={onSaveInfo} key={exam.id + exam.title + exam.closesAt}>
        <h2>Thông tin kỳ thi</h2>
        {started && <p className="muted small">Đã có thí sinh làm bài: chỉ đổi được tên và lùi giờ đóng đề.</p>}
        <label>
          Tên kỳ thi
          <input name="title" defaultValue={exam.title} required maxLength={200} />
        </label>
        <div className="row">
          <label>
            Mở đề
            <input name="opensAt" type="datetime-local" defaultValue={toLocalInput(exam.opensAt)} disabled={started} />
          </label>
          <label>
            Đóng đề
            <input name="closesAt" type="datetime-local" defaultValue={toLocalInput(exam.closesAt)} required />
          </label>
          <label>
            Thời gian làm (phút)
            <input
              name="minutes"
              type="number"
              min={1}
              max={300}
              defaultValue={Math.round(exam.durationSec / 60)}
              disabled={started}
            />
          </label>
        </div>
        <label className="choice">
          <input name="shuffleOptions" type="checkbox" defaultChecked={exam.shuffleOptions} disabled={started} /> Xáo trộn
          thứ tự phương án
        </label>
        <div className="row">
          <button type="submit">Lưu</button>
          {!started && (
            <button
              type="button"
              className="danger"
              onClick={() => {
                if (confirm(`Xóa kỳ thi "${exam.title}"?`)) {
                  void api(`/manage/exams/${id}`, { method: 'DELETE' })
                    .then(() => navigate(`/manage/courses/${exam.courseId}/exams`))
                    .catch((err: Error) => setError(err.message))
                }
              }}
            >
              Xóa kỳ thi
            </button>
          )}
        </div>
      </form>

      <div className="card stack">
        <h2>Ma trận đề</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Chủ đề</th>
                <th>Độ khó</th>
                <th>Số câu</th>
                <th>Kho hiện có</th>
              </tr>
            </thead>
            <tbody>
              {exam.rules.map((r) => (
                <tr key={`${r.topic.id}-${r.difficulty}`}>
                  <td>{r.topic.name}</td>
                  <td>{DIFFICULTY_LABEL[r.difficulty]}</td>
                  <td>{r.count}</td>
                  <td className={r.available < r.count ? 'error' : undefined}>{r.available}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card stack">
        <h2>Thí sinh và kết quả</h2>
        <form className="stack" onSubmit={onAddCandidates}>
          <label>
            Thêm thí sinh (email, cách nhau bởi dấu phẩy hoặc xuống dòng)
            <textarea name="emails" rows={3} placeholder={'hv1@truong.edu.vn\nhv2@truong.edu.vn'} />
          </label>
          <div>
            <button type="submit">Thêm thí sinh</button>
          </div>
        </form>
        {addResult && (
          <p className="small">
            {addResult.added.length > 0 && <span className="notice">Đã thêm {addResult.added.length}. </span>}
            {addResult.alreadyAdded.length > 0 && <span className="muted">Đã có sẵn: {addResult.alreadyAdded.join(', ')}. </span>}
            {addResult.notFound.length > 0 && (
              <span className="error">Không tìm thấy tài khoản: {addResult.notFound.join(', ')}.</span>
            )}
          </p>
        )}

        {results.length === 0 ? (
          <p className="muted">Chưa có thí sinh.</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Thí sinh</th>
                  <th>Trạng thái</th>
                  <th>Bắt đầu</th>
                  <th>Nộp</th>
                  <th>Điểm</th>
                  <th>Vi phạm</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.user.fullName}
                      <br />
                      <span className="muted small">{r.user.email}</span>
                    </td>
                    <td>{attemptStatus(r)}</td>
                    <td className="small">{r.attempt ? formatDateTime(r.attempt.startedAt) : '—'}</td>
                    <td className="small">{r.attempt?.submittedAt ? formatDateTime(r.attempt.submittedAt) : '—'}</td>
                    <td>
                      {r.attempt?.score != null ? (
                        <>
                          <strong>{r.attempt.score}</strong>{' '}
                          <span className="muted small">
                            ({r.attempt.correctCount}/{r.attempt.totalCount})
                          </span>
                        </>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td>
                      {r.attempt ? (
                        <span className={r.attempt.violationCount > 0 ? 'badge wrong' : 'muted small'}>
                          {r.attempt.violationCount}
                          {r.attempt.sessionTakeovers > 0 && ` · đổi máy ${r.attempt.sessionTakeovers}`}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className="row tight">
                      {r.attempt && (
                        <button className="link" onClick={() => void openLog(r.id)}>
                          {logFor?.id === r.id ? 'Ẩn nhật ký' : 'Nhật ký'}
                        </button>
                      )}
                      {r.attempt?.status === 'IN_PROGRESS' && (
                        <button className="link" onClick={() => extend(r)}>
                          Gia hạn
                        </button>
                      )}
                      {!r.attempt && (
                        <button
                          className="link danger"
                          onClick={() => {
                            if (confirm(`Bỏ ${r.user.email} khỏi kỳ thi?`)) {
                              void run(() => api(`/manage/exams/${id}/candidates/${r.id}`, { method: 'DELETE' }))
                            }
                          }}
                        >
                          Bỏ
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {logFor && (
          <div className="card stack log-box">
            <h2>Nhật ký: {logFor.log.user.fullName}</h2>
            {logFor.log.extensions.length > 0 && (
              <div>
                <strong>Gia hạn</strong>
                <ul>
                  {logFor.log.extensions.map((e) => (
                    <li key={e.createdAt}>
                      {formatDateTime(e.createdAt)}: +{e.minutes} phút, {e.reason}{' '}
                      <span className="muted small">({e.grantedBy})</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <strong>Sự kiện ({logFor.log.events.length})</strong>
              {logFor.log.events.length === 0 ? (
                <p className="muted small">Không có sự kiện nào.</p>
              ) : (
                <ul className="event-list">
                  {logFor.log.events.map((e) => (
                    <li key={e.id}>
                      <span className="muted small">{new Date(e.clientAt).toLocaleTimeString('vi-VN')}</span>{' '}
                      {EVENT_LABEL[e.type] ?? e.type}
                      {e.detail && <span className="muted small"> ({e.detail})</span>}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  )
}
