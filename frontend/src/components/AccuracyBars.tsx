import { LEVEL_LABEL, type StatBucket } from '../lib/practice'

export interface AccuracyRow extends StatBucket {
  key: string
  label: string
}

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`)

/**
 * Thanh ngang tỉ lệ đúng cho từng nhóm (một chuỗi dữ liệu, một màu).
 * Mức năng lực hiện bằng biểu tượng + chữ, không chỉ dựa vào màu.
 * Hai vạch mờ đánh dấu ngưỡng 50% (khá) và 80% (mạnh).
 */
export function AccuracyBars({ rows, title }: { rows: AccuracyRow[]; title: string }) {
  if (rows.length === 0) return <p className="muted">Chưa có dữ liệu.</p>

  return (
    <div className="viz-root">
      <div className="bars" role="list" aria-label={title}>
        <div className="bars-scale" aria-hidden="true">
          <span style={{ left: '50%' }}>50%</span>
          <span style={{ left: '80%' }}>80%</span>
        </div>
        {rows.map((r) => {
          const level = LEVEL_LABEL[r.level]
          return (
            <div key={r.key} className="bar-row" role="listitem">
              <span className="bar-label">{r.label}</span>
              <div
                className="bar-track"
                tabIndex={0}
                aria-label={`${r.label}: đúng ${r.correct}/${r.answered} câu, ${pct(r.accuracy)}, ${level.text}`}
              >
                <span className="bar-guide" style={{ left: '50%' }} />
                <span className="bar-guide" style={{ left: '80%' }} />
                <div className="bar-fill" style={{ width: `${(r.accuracy ?? 0) * 100}%` }} />
                <span className="bar-value">{pct(r.accuracy)}</span>
                <span className="viz-tooltip" role="tooltip">
                  <strong>{r.label}</strong>
                  <br />
                  Đúng {r.correct}/{r.answered} câu ({pct(r.accuracy)})
                  <br />
                  {level.icon} {level.text}
                </span>
              </div>
              <span className={`level level-${r.level.toLowerCase()}`}>
                <span aria-hidden="true">{level.icon}</span> {level.text}
              </span>
            </div>
          )
        })}
      </div>

      <details className="viz-table">
        <summary>Xem dạng bảng</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{title}</th>
                <th>Đã làm</th>
                <th>Đúng</th>
                <th>Tỉ lệ</th>
                <th>Mức</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td>{r.answered}</td>
                  <td>{r.correct}</td>
                  <td>{pct(r.accuracy)}</td>
                  <td>{LEVEL_LABEL[r.level].text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
