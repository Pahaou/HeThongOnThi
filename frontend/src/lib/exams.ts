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
  grading: boolean
}

export interface ExamQuestion {
  questionId: string
  position: number
  type: QuestionType
  content: string
  options: { id: string; content: string }[]
  selectedOptionIds: string[]
  clientSavedAt: string | null
}

export interface ExamAttemptView {
  exam: { id: string; title: string; closesAt: string }
  status: 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED'
  /** Đã nộp, hàng đợi chưa chấm xong */
  grading: boolean
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
    status: 'IN_PROGRESS' | 'SUBMITTED' | 'GRADED'
    startedAt: string
    deadlineAt: string
    submittedAt: string | null
    totalCount: number
    correctCount: number | null
    score: number | null
    violationCount: number
    sessionTakeovers: number
  } | null
}

export const EVENT_LABEL: Record<string, string> = {
  TAB_HIDDEN: 'Rời khỏi trang thi',
  WINDOW_BLUR: 'Chuyển sang cửa sổ khác',
  FULLSCREEN_EXIT: 'Thoát toàn màn hình',
  FULLSCREEN_ENTER: 'Vào toàn màn hình',
  COPY: 'Sao chép',
  PASTE: 'Dán',
  CONTEXT_MENU: 'Chuột phải',
  SESSION_TAKEOVER: 'Mở bài ở thiết bị/tab khác',
  RECONNECT: 'Rời / tải lại trang',
}

export interface CandidateLog {
  user: { fullName: string; email: string }
  verdict: 'VALID' | 'SUSPICIOUS' | 'VIOLATION'
  violationCount: number
  sessionTakeovers: number
  extensions: { minutes: number; reason: string; grantedBy: string; createdAt: string }[]
  events: { id: string; type: string; clientAt: string; detail: string | null }[]
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

export type Verdict = 'VALID' | 'SUSPICIOUS' | 'VIOLATION'

export const VERDICT_LABEL: Record<Verdict, string> = {
  VALID: 'Hợp lệ',
  SUSPICIOUS: 'Nghi vấn',
  VIOLATION: 'Vi phạm',
}

export interface ProctorRow {
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
