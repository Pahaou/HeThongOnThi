import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { io, type Socket } from 'socket.io-client'
import { api, getAccessToken, refreshSession } from '../../lib/api'
import type { ManageExam } from '../../lib/exams'
import { formatClock } from '../../lib/practice'

type Verdict = 'VALID' | 'SUSPICIOUS' | 'VIOLATION'

interface ProctorRow {
  candidateId: string
  user: { id: string; fullName: string; email: string }
  verdict: Verdict
  verdictNote: string | null
  attempt: {
    status: 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED'
    startedAt: string
    deadlineAt: string
    submittedAt: string | null
    totalCount: number
    answeredCount: number
    score: number | null
    violationCount: number
    sessionTakeovers: number
    lastSeenAt: string | null
    online: boolean
  } | null
}

const VERDICT_LABEL: Record<Verdict, string> = { VALID: 'Hợp lệ', SUSPICIOUS: 'Nghi vấn', VIOLATION: 'Vi phạm' }

function statusText(r: ProctorRow): string {
  if (!r.attempt) return 'Chưa vào thi'
  if (r.attempt.status === 'IN_PROGRESS') return 'Đang làm'
  return r.attempt.status === 'GRADED' ? 'Đã chấm' : 'Đã nộp'
}

/** Màn giám thị realtime: bảng thí sinh cập nhật qua WebSocket. */
export function ProctorPage() {
  const { id = '' } = useParams()
  const [exam, setExam] = useState<ManageExam | null>(null)
  const [rows, setRows] = useState<ProctorRow[]>([])
  const [connected, setConnected] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [now, setNow] = useState(Date.now())
  const clockOffset = useRef(0)
  const socketRef = useRef<Socket | null>(null)

  useEffect(() => {
    api<ManageExam>(`/manage/exams/${id}`)
      .then(setExam)
      .catch((e: Error) => setError(e.message))
  }, [id])

  useEffect(() => {
    // auth là hàm nên mỗi lần kết nối lại đều gửi token mới nhất
    const socket = io('/proctor', {
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ['websocket'],
    })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      setError(null)
      void (
        socket.emitWithAck('join', { examId: id }) as Promise<{
          ok: boolean
          message?: string
          rows?: ProctorRow[]
          serverNow?: string
        }>
      ).then((res) => {
        if (!res.ok) return setError(res.message ?? 'Không vào được phòng giám thị')
        if (res.serverNow) clockOffset.current = new Date(res.serverNow).getTime() - Date.now()
        setRows(res.rows ?? [])
      })
    })
    socket.on('disconnect', () => setConnected(false))
    // Token hết hạn: làm mới rồi kết nối lại
    socket.on('connect_error', (e) => {
      setConnected(false)
      if (e.message === 'Chưa đăng nhập') {
        void refreshSession()
          .then(() => socket.connect())
          .catch(() => setError('Phiên đăng nhập đã hết, hãy đăng nhập lại'))
      } else {
        setError(e.message)
      }
    })
    socket.on('candidate:update', (row: ProctorRow) => {
      setRows((list) => {
        const i = list.findIndex((r) => r.candidateId === row.candidateId)
        if (i < 0) return [...list, row]
        const next = [...list]
        next[i] = row
        return next
      })
    })
    return () => {
      socket.disconnect()
      socketRef.current = null
    }
  }, [id])

  // Đồng hồ cho cột thời gian còn lại
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [])

  const summary = useMemo(
    () => ({
      total: rows.length,
      working: rows.filter((r) => r.attempt?.status === 'IN_PROGRESS').length,
      online: rows.filter((r) => r.attempt?.online).length,
      lost: rows.filter(isLost).length,
      submitted: rows.filter((r) => r.attempt && r.attempt.status !== 'IN_PROGRESS').length,
      flagged: rows.filter((r) => (r.attempt?.violationCount ?? 0) > 0 || r.verdict !== 'VALID').length,
    }),
    [rows],
  )

  // Thí sinh mất kết nối lên đầu: giám thị cần gia hạn trước khi hết giờ (hết giờ là tự nộp)
  const sorted = useMemo(() => [...rows].sort((x, y) => Number(isLost(y)) - Number(isLost(x))), [rows])

  async function setVerdict(r: ProctorRow, verdict: Verdict) {
    let note: string | undefined
    if (verdict !== 'VALID') {
      const msg =
        verdict === 'VIOLATION'
          ? `Đánh dấu VI PHẠM cho ${r.user.fullName}? Bài sẽ bị nộp ngay và thí sinh không vào lại được.\nGhi chú lý do:`
          : `Ghi chú lý do nghi vấn cho ${r.user.fullName}:`
      const input = prompt(msg, r.verdictNote ?? '')
      if (input === null) return
      note = input
    }
    try {
      const row = await api<ProctorRow>(`/manage/exams/${id}/candidates/${r.candidateId}/verdict`, {
        method: 'PATCH',
        body: JSON.stringify({ verdict, note }),
      })
      setRows((list) => list.map((x) => (x.candidateId === row.candidateId ? row : x)))
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link to={`/manage/exams/${id}`}>← Chi tiết kỳ thi</Link>
          </p>
          <h1>Giám thị: {exam?.title ?? '...'}</h1>
        </div>
        <span className={connected ? 'badge ok' : 'badge wrong'} aria-live="polite">
          {connected ? '● Đang cập nhật trực tiếp' : '○ Mất kết nối, đang thử lại...'}
        </span>
      </div>
      {error && <p className="error">{error}</p>}

      <div className="stat-tiles">
        <div className="card stat-tile">
          <span className="muted small">Thí sinh</span>
          <strong>{summary.total}</strong>
        </div>
        <div className="card stat-tile">
          <span className="muted small">Đang làm</span>
          <strong>{summary.working}</strong>
          <span className="muted small">
            online {summary.online}
            {summary.lost > 0 && <span className="error"> · mất kết nối {summary.lost}</span>}
          </span>
        </div>
        <div className="card stat-tile">
          <span className="muted small">Đã nộp</span>
          <strong>{summary.submitted}</strong>
        </div>
        <div className="card stat-tile">
          <span className="muted small">Cần chú ý</span>
          <strong className={summary.flagged > 0 ? 'error' : undefined}>{summary.flagged}</strong>
        </div>
      </div>

      <div className="card table-wrap">
        <table className="proctor-table">
          <thead>
            <tr>
              <th>Thí sinh</th>
              <th>Trạng thái</th>
              <th>Tiến độ</th>
              <th>Còn lại</th>
              <th>Vi phạm</th>
              <th>Phân xử</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const a = r.attempt
              const left =
                a?.status === 'IN_PROGRESS'
                  ? (new Date(a.deadlineAt).getTime() - (now + clockOffset.current)) / 1000
                  : null
              return (
                <tr
                  key={r.candidateId}
                  className={
                    isLost(r) ? 'lost' : (a?.violationCount ?? 0) > 0 || r.verdict !== 'VALID' ? 'flagged' : undefined
                  }
                >
                  <td>
                    <span
                      className={a?.online ? 'dot on' : 'dot'}
                      title={a?.online ? 'Đang online' : 'Không online'}
                      aria-label={a?.online ? 'Đang online' : 'Không online'}
                    />{' '}
                    {r.user.fullName}
                    <br />
                    <span className="muted small">{r.user.email}</span>
                  </td>
                  <td>
                    {isLost(r) && <span className="badge warn">Mất kết nối</span>} {statusText(r)}
                    {a?.score != null && <span className="muted small"> · {a.score} điểm</span>}
                  </td>
                  <td>{a ? `${a.answeredCount}/${a.totalCount}` : '—'}</td>
                  <td className={left !== null && left < 60 ? 'error' : undefined}>
                    {left !== null ? formatClock(Math.max(0, left)) : '—'}
                  </td>
                  <td>
                    {a ? (
                      <span className={a.violationCount > 0 ? 'badge wrong' : 'muted small'}>
                        {a.violationCount}
                        {a.sessionTakeovers > 0 && ` · đổi máy ${a.sessionTakeovers}`}
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <select
                      value={r.verdict}
                      onChange={(e) => void setVerdict(r, e.target.value as Verdict)}
                      aria-label={`Phân xử ${r.user.fullName}`}
                    >
                      {(Object.keys(VERDICT_LABEL) as Verdict[]).map((v) => (
                        <option key={v} value={v}>
                          {VERDICT_LABEL[v]}
                        </option>
                      ))}
                    </select>
                    {r.verdictNote && <div className="muted small">{r.verdictNote}</div>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <p className="muted">Chưa có thí sinh.</p>}
      </div>
      <p className="muted small">
        Online = máy thí sinh liên lạc trong 45 giây gần nhất. Thí sinh mất kết nối được xếp lên đầu: hết giờ hệ thống tự
        nộp bài, nên cần gia hạn (ở trang chi tiết kỳ thi) trước khi hết giờ. Nhật ký chi tiết từng thí sinh cũng ở đó.
      </p>
    </section>
  )
}

/** Đang làm bài nhưng máy không liên lạc trong 45 giây (mất mạng, mất điện, đóng máy) */
function isLost(r: ProctorRow) {
  return r.attempt?.status === 'IN_PROGRESS' && !r.attempt.online
}
