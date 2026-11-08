import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { formatDateTime } from '../lib/practice'

interface Point {
  id: string
  title: string
  submittedAt: string
  score: number
}

const H = 220
const PAD = { top: 20, right: 24, bottom: 28, left: 32 }
const plotH = H - PAD.top - PAD.bottom

/** Bề rộng thật của phần tử, để vẽ SVG đúng số pixel và chữ không bị phóng to/thu nhỏ. */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(640)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new ResizeObserver(([entry]) => setWidth(Math.round(entry.contentRect.width)))
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width] as const
}

/**
 * Điểm các lần thi thử theo thứ tự thời gian, trục y cố định 0-10.
 * Một chuỗi nên không cần chú thích; rê chuột/chạm để xem từng lần.
 */
export function ScoreLine({ points }: { points: Point[] }) {
  const [active, setActive] = useState<number | null>(null)
  const [ref, W] = useWidth<HTMLDivElement>()
  if (points.length === 0) return <p className="muted">Chưa có lần thi thử nào.</p>

  const plotW = Math.max(1, W - PAD.left - PAD.right)
  const x = (i: number) => PAD.left + (points.length === 1 ? plotW / 2 : (i / (points.length - 1)) * plotW)
  const y = (score: number) => PAD.top + plotH - (score / 10) * plotH
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(p.score)}`).join(' ')
  const last = points[points.length - 1]

  function onMove(e: PointerEvent<SVGRectElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const rel = ((e.clientX - rect.left) / rect.width) * plotW
    const i = points.length === 1 ? 0 : Math.round((rel / plotW) * (points.length - 1))
    setActive(Math.max(0, Math.min(points.length - 1, i)))
  }

  const a = active === null ? null : points[active]

  return (
    <div className="viz-root score-line" ref={ref}>
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Điểm ${points.length} lần thi thử gần nhất, lần mới nhất ${last.score} điểm`}>
        {[0, 5, 10].map((v) => (
          <g key={v}>
            <line className="viz-grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="viz-axis" x={PAD.left - 8} y={y(v)} textAnchor="end" dominantBaseline="middle">
              {v}
            </text>
          </g>
        ))}
        <text className="viz-axis" x={PAD.left} y={H - 6}>
          Lần 1
        </text>
        {points.length > 1 && (
          <text className="viz-axis" x={W - PAD.right} y={H - 6} textAnchor="end">
            Lần {points.length}
          </text>
        )}

        {a && active !== null && <line className="viz-crosshair" x1={x(active)} x2={x(active)} y1={PAD.top} y2={PAD.top + plotH} />}
        <path className="viz-line" d={path} />
        {points.map((p, i) => (
          <circle key={p.id} className="viz-dot" cx={x(i)} cy={y(p.score)} r={i === active ? 6 : 4} />
        ))}
        {/* Nhãn trực tiếp chỉ cho điểm mới nhất */}
        <text className="viz-label" x={x(points.length - 1)} y={y(last.score) - 12} textAnchor="middle">
          {last.score}
        </text>

        <rect
          x={PAD.left}
          y={PAD.top}
          width={plotW}
          height={plotH}
          fill="transparent"
          onPointerMove={onMove}
          onPointerDown={onMove}
          onPointerLeave={() => setActive(null)}
        />
      </svg>
      {a && active !== null && (
        <div
          className="viz-tooltip visible"
          role="tooltip"
          style={{ left: `${(x(active) / W) * 100}%`, top: `${(y(a.score) / H) * 100}%` }}
        >
          <strong>{a.score} điểm</strong>
          <br />
          {a.title}
          <br />
          <span className="muted small">{formatDateTime(a.submittedAt)}</span>
        </div>
      )}

      <details className="viz-table">
        <summary>Xem dạng bảng</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lần</th>
                <th>Đề</th>
                <th>Nộp lúc</th>
                <th>Điểm</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td>{p.title}</td>
                  <td>{formatDateTime(p.submittedAt)}</td>
                  <td>{p.score}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
