import type { Difficulty, QuestionType } from './questions'

export type PracticeMode = 'TOPIC' | 'MOCK'

export interface PracticeOptions {
  topics: { id: string; name: string; counts: Record<Difficulty, number> }[]
  blueprints: { id: string; title: string; durationSec: number; totalQuestions: number }[]
}

export interface AttemptQuestion {
  questionId: string
  position: number
  type: QuestionType
  difficulty: Difficulty
  topic: { id: string; name: string }
  content: string
  options: { id: string; content: string }[]
  selectedOptionIds: string[]
  answered: boolean
  // Chỉ có khi câu đã được chấm
  isCorrect?: boolean
  correctOptionIds?: string[]
  explanation?: string
}

export interface Attempt {
  id: string
  mode: PracticeMode
  title: string
  course: { id: string; slug: string; title: string }
  startedAt: string
  deadlineAt: string | null
  submittedAt: string | null
  serverNow: string
  totalCount: number
  correctCount: number | null
  score: number | null
  questions: AttemptQuestion[]
}

export interface TopicAnswerResult {
  isCorrect: boolean
  correctOptionIds: string[]
  explanation: string
}

export interface AttemptSummary {
  id: string
  mode: PracticeMode
  title: string
  startedAt: string
  submittedAt: string | null
  totalCount: number
  correctCount: number
  score: number | null
}

export interface BlueprintRule {
  topicId: string
  difficulty: Difficulty
  count: number
}

export interface ManageBlueprint {
  id: string
  title: string
  durationSec: number
  published: boolean
  totalQuestions: number
  ready: boolean
  rules: { topic: { id: string; name: string }; difficulty: Difficulty; count: number; available: number }[]
}

/** "mm:ss" hoặc "h:mm:ss" */
export function formatClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
}
