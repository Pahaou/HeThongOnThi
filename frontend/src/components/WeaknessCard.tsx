import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../lib/api'
import type { Attempt } from '../lib/practice'

interface Recommendation {
  weakTopics: { id: string; name: string; accuracy: number | null; level: string; answered: number }[]
  unresolvedWrong: number
  questionCount: number
  advice: { source: 'AI' | 'FALLBACK'; text: string }
}

/** Gợi ý ôn theo điểm yếu: lời khuyên (AI hoặc soạn sẵn) và nút bắt đầu bài ôn. */
export function WeaknessCard({ courseId }: { courseId: string }) {
  const navigate = useNavigate()
  const [rec, setRec] = useState<Recommendation | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [starting, setStarting] = useState(false)

  useEffect(() => {
    api<Recommendation>(`/courses/${courseId}/ai/recommendation`)
      .then(setRec)
      .catch((e: Error) => setError(e.message))
  }, [courseId])

  async function start() {
    setStarting(true)
    try {
      const attempt = await api<Attempt>(`/courses/${courseId}/ai/recommended-practice`, { method: 'POST' })
      navigate(`/practice/${attempt.id}`)
    } catch (e) {
      setError((e as Error).message)
      setStarting(false)
    }
  }

  if (error) return <p className="error small">{error}</p>
  if (!rec) return <div className="card muted">Đang phân tích điểm yếu...</div>

  return (
    <div className="card stack weakness-card">
      <div className="chapter-head">
        <h2>Gợi ý ôn theo điểm yếu</h2>
        <span className={rec.advice.source === 'AI' ? 'badge ai' : 'badge'}>
          {rec.advice.source === 'AI' ? '✦ Lời khuyên từ AI' : 'Lời khuyên soạn sẵn'}
        </span>
      </div>
      <p className="pre-line">{rec.advice.text}</p>
      {rec.weakTopics.length > 0 && (
        <p className="small">
          Chủ đề cần ôn:{' '}
          {rec.weakTopics.map((t) => `${t.name} (${Math.round((t.accuracy ?? 0) * 100)}%)`).join(', ')}
        </p>
      )}
      <div>
        <button onClick={() => void start()} disabled={starting || rec.questionCount === 0}>
          {rec.questionCount > 0 ? `Ôn ${rec.questionCount} câu theo điểm yếu` : 'Chưa có câu để ôn theo điểm yếu'}
        </button>
      </div>
    </div>
  )
}
