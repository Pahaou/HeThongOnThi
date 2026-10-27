export type LessonType = 'VIDEO' | 'READING'

export interface InstructorRef {
  id: string
  fullName: string
}

export interface CourseSummary {
  id: string
  slug: string
  title: string
  description: string
  thumbnailUrl: string | null
  published: boolean
  instructor: InstructorRef
  lessonCount: number
  totalDurationSec: number
}

export interface CourseList {
  total: number
  page: number
  pageSize: number
  items: CourseSummary[]
}

export interface OutlineLesson {
  id: string
  title: string
  type: LessonType
  durationSec: number
  position: number
}

export interface OutlineChapter {
  id: string
  title: string
  position: number
  lessons: OutlineLesson[]
}

export interface CourseDetail {
  id: string
  slug: string
  title: string
  description: string
  thumbnailUrl: string | null
  published: boolean
  instructor: InstructorRef
  chapters: OutlineChapter[]
}

export interface AttachmentInfo {
  id: string
  fileName: string
  mimeType: string
  size: number
}

export interface LessonDetail {
  id: string
  title: string
  type: LessonType
  videoUrl: string | null
  content: string
  durationSec: number
  attachments: AttachmentInfo[]
  chapter: { id: string; title: string; course: { id: string; slug: string; title: string } }
}

// Dữ liệu cho trang soạn khóa học
export interface ManageLesson {
  id: string
  title: string
  type: LessonType
  videoUrl: string | null
  content: string
  durationSec: number
  position: number
  attachments: AttachmentInfo[]
}

export interface ManageChapter {
  id: string
  title: string
  position: number
  lessons: ManageLesson[]
}

export interface ManageCourse {
  id: string
  slug: string
  title: string
  description: string
  thumbnailUrl: string | null
  published: boolean
  instructor: InstructorRef
  chapters: ManageChapter[]
}

export interface ManageCourseRow {
  id: string
  slug: string
  title: string
  published: boolean
  updatedAt: string
  instructor: InstructorRef
  _count: { chapters: number }
}

export function formatDuration(totalSec: number): string {
  if (totalSec <= 0) return ''
  const h = Math.floor(totalSec / 3600)
  const m = Math.round((totalSec % 3600) / 60)
  return h > 0 ? `${h} giờ ${m} phút` : `${m} phút`
}

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

/** Lấy id video YouTube từ các dạng link phổ biến, không phải YouTube thì trả null. */
export function youtubeId(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\.|^m\./, '')
    if (host === 'youtu.be') return u.pathname.slice(1) || null
    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (u.pathname === '/watch') return u.searchParams.get('v')
      const m = u.pathname.match(/^\/(embed|shorts|live)\/([\w-]+)/)
      if (m) return m[2]
    }
  } catch {
    // URL không hợp lệ
  }
  return null
}
