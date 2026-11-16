import { useState } from 'react'
import { api } from '../lib/api'

interface ExplainResult {
  source: 'AI' | 'FALLBACK'
  content: string
  note?: string
}

/** Nút "AI giải thích" cho câu đã được chấm; AI không phản hồi thì hiện giải thích dự phòng. */
export function AiExplainButton({ questionId }: { questionId: string }) {
  const [result, setResult] = useState<ExplainResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      setResult(await api<ExplainResult>(`/ai/questions/${questionId}/explain`, { method: 'POST' }))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div className="ai-box" aria-live="polite">
        <span className={result.source === 'AI' ? 'badge ai' : 'badge'}>
          {result.source === 'AI' ? '✦ AI giải thích' : 'Giải thích dự phòng'}
        </span>
        {result.note && <span className="muted small"> {result.note}</span>}
        <p className="pre-line">{result.content}</p>
        {result.source === 'AI' && (
          <p className="muted small">Nội dung do AI tạo dựa trên bài học, có thể chưa chính xác tuyệt đối.</p>
        )}
      </div>
    )
  }
  return (
    <div>
      <button className="secondary" onClick={() => void load()} disabled={loading}>
        {loading ? 'AI đang giải thích...' : '✦ AI giải thích'}
      </button>
      {error && <p className="error small">{error}</p>}
    </div>
  )
}
