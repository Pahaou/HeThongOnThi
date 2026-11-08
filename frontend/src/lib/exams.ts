import type { Difficulty, QuestionType } from './questions'

export type MyExamState = 'NOT_OPEN' | 'OPEN' | 'IN_PROGRESS' | 'SUBMITTED' | 'MISSED' | 'CLOSED'

export const STATE_LABEL: Record<MyExamState, string> = {
  NOT_OPEN: 'Chưa mở',
  OPEN: 'Đang mở',
  IN_PROGRESS: 'Đang làm',
  SUBMITTED: 'Đã nộp',
  MISSED: 'Không tham gia',
  CLOSED: 'Đã đóng',
}

export interface MyExam {
  id: string
  title: string
  course: { id: string; slug: string; title: string }
  opensAt: string
  closesAt: string
  durationSec: number
  totalQuestions: number
  state: MyExamState
  score: number | null
  correctCount: number | null
}

export interface ExamQuestion {
  questionId: string
  position: number
  type: QuestionType
  content: string
  options: { id: string; content: string }[]
  selectedOptionIds: string[]
}

export interface ExamAttemptView {
  exam: { id: string; title: string; closesAt: string }
  status: 'IN_PROGRESS' | 'SUBMITTED'
  startedAt: string
  deadlineAt: string
  submittedAt: string | null
  serverNow: string
  totalCount: number
  answeredCount: number
  score: number | null
  correctCount: number | null
  questions: ExamQuestion[]
}

export interface ManageExamRow {
  id: string
  title: string
  opensAt: string
  closesAt: string
  durationSec: number
  status: 'DRAFT' | 'PUBLISHED'
  totalQuestions: number
  candidateCount: number
}

export interface ManageExam {
  id: string
  courseId: string
  title: string
  opensAt: string
  closesAt: string
  durationSec: number
  shuffleOptions: boolean
  status: 'DRAFT' | 'PUBLISHED'
  startedCount: number
  rules: { topic: { id: string; name: string }; difficulty: Difficulty; count: number; available: number }[]
}

export interface ExamResultRow {
  id: string
  user: { id: string; email: string; fullName: string }
  verdict: 'VALID' | 'SUSPICIOUS' | 'VIOLATION'
  attempt: {
    status: 'IN_PROGRESS' | 'SUBMITTED'
    startedAt: string
    deadlineAt: string
    submittedAt: string | null
    totalCount: number
    correctCount: number | null
    score: number | null
  } | null
}

export interface AddCandidatesResult {
  added: string[]
  alreadyAdded: string[]
  notFound: string[]
}

/** ISO -> giá trị cho <input type="datetime-local"> theo giờ máy */
export function toLocalInput(iso: string): string {
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
