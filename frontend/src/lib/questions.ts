export type QuestionType = 'SINGLE' | 'MULTIPLE' | 'TRUE_FALSE'
export type Difficulty = 'EASY' | 'MEDIUM' | 'HARD'
export type QuestionStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED'
export type QuestionSource = 'MANUAL' | 'IMPORT' | 'AI'

export const TYPE_LABEL: Record<QuestionType, string> = {
  SINGLE: 'Một đáp án',
  MULTIPLE: 'Nhiều đáp án',
  TRUE_FALSE: 'Đúng/Sai',
}

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  EASY: 'Dễ',
  MEDIUM: 'Trung bình',
  HARD: 'Khó',
}

export const SOURCE_LABEL: Record<QuestionSource, string> = {
  MANUAL: 'Nhập tay',
  IMPORT: 'Excel',
  AI: 'AI',
}

export const MAX_OPTIONS = 8

export interface Topic {
  id: string
  name: string
  questionCount: number
}

export interface QuestionOption {
  id?: string
  content: string
  isCorrect: boolean
}

export interface Question {
  id: string
  type: QuestionType
  difficulty: Difficulty
  status: QuestionStatus
  source: QuestionSource
  content: string
  explanation: string
  topic: { id: string; name: string }
  lesson: { id: string; title: string } | null
  options: Required<QuestionOption>[]
}

export interface QuestionList {
  total: number
  page: number
  pageSize: number
  items: Question[]
}

export interface QuestionInput {
  topicId: string
  lessonId: string | null
  type: QuestionType
  difficulty: Difficulty
  content: string
  explanation: string
  options: QuestionOption[]
}

export interface ImportResult {
  created: number
  createdTopics: string[]
  errors: { row: number; message: string }[]
}

export const LETTERS = 'ABCDEFGH'
