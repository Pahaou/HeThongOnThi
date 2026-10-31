import { useCallback, useEffect, useMemo, useState } from 'react'
import Markdown from 'react-markdown'
import { Link, useParams } from 'react-router'
import { CourseOutline } from '../components/CourseOutline'
import { ProgressBar } from '../components/ProgressBar'
import { VideoPlayer } from '../components/VideoPlayer'
import { api, ApiError, downloadFile } from '../lib/api'
import {
  formatSize,
  type CourseDetail,
  type LessonDetail,
  type LessonProgress,
} from '../lib/courses'

export function LessonPage() {
  const { slug = '', lessonId = '' } = useParams()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [lesson, setLesson] = useState<LessonDetail | null>(null)
  const [completed, setCompleted] = useState<Set<string>>(new Set())
  const [error, setError] = useState<{ status?: number; message: string } | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api<CourseDetail>(`/courses/${slug}`)
      .then((c) => {
        setCourse(c)
        setCompleted(new Set(c.enrollment?.completedLessonIds))
      })
      .catch((e: Error) => setError({ message: e.message }))
  }, [slug])

  const enrolled = !!course?.enrollment

  useEffect(() => {
    setLesson(null)
    setError(null)
    api<LessonDetail>(`/lessons/${lessonId}`)
      .then(setLesson)
      .catch((e: Error) =>
        setError({ status: e instanceof ApiError ? e.status : undefined, message: e.message }),
      )
  }, [lessonId])

  // Vừa mở bài thì ghi lại là bài gần nhất, để nút "Học tiếp" mở đúng chỗ
  useEffect(() => {
    if (enrolled && lesson?.id === lessonId) {
      void api(`/lessons/${lessonId}/progress`, { method: 'PUT', body: '{}' }).catch(() => {})
    }
  }, [enrolled, lesson?.id, lessonId])

  const saveProgress = useCallback(
    async (body: { positionSec?: number; completed?: boolean }) => {
      if (!enrolled) return
      const res = await api<LessonProgress>(`/lessons/${lessonId}/progress`, {
        method: 'PUT',
        body: JSON.stringify(body),
      })
      setCompleted((prev) => {
        const next = new Set(prev)
        if (res.completed) next.add(lessonId)
        else next.delete(lessonId)
        return next
      })
    },
    [enrolled, lessonId],
  )

  const ordered = useMemo(() => course?.chapters.flatMap((c) => c.lessons) ?? [], [course])

  if (error?.status === 403) {
    return (
      <div className="card stack">
        <h1>Bạn chưa ghi danh khóa học này</h1>
        <p className="muted">Ghi danh để xem bài học và lưu tiến độ.</p>
        <div>
          <Link className="button" to={`/courses/${slug}`}>
            Tới trang khóa học
          </Link>
        </div>
      </div>
    )
  }
  if (error) return <p className="error">{error.message}</p>
  if (!course || !lesson) return <p className="muted">Đang tải...</p>

  const index = ordered.findIndex((l) => l.id === lessonId)
  const prev = ordered[index - 1]
  const next = ordered[index + 1]
  const isDone = completed.has(lessonId)
  const percent = ordered.length ? Math.round((completed.size / ordered.length) * 100) : 0

  async function toggleDone() {
    setSaving(true)
    try {
      await saveProgress({ completed: !isDone })
    } catch (e) {
      setError({ message: (e as Error).message })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="learn">
      <article className="learn-main">
        <p className="muted small">
          <Link to={`/courses/${course.slug}`}>{course.title}</Link> / {lesson.chapter.title}
        </p>
        <h1>{lesson.title}</h1>

        {lesson.type === 'VIDEO' && lesson.videoUrl && (
          <VideoPlayer
            key={lesson.id}
            url={lesson.videoUrl}
            title={lesson.title}
            startAt={lesson.progress?.completed ? 0 : (lesson.progress?.positionSec ?? 0)}
            onProgress={(positionSec) => void saveProgress({ positionSec }).catch(() => {})}
            onWatched={() => {
              if (!completed.has(lessonId)) void saveProgress({ completed: true }).catch(() => {})
            }}
          />
        )}
        {lesson.content && (
          <div className="markdown">
            <Markdown>{lesson.content}</Markdown>
          </div>
        )}

        {lesson.attachments.length > 0 && (
          <div className="attachments">
            <h2>Tài liệu</h2>
            <ul>
              {lesson.attachments.map((a) => (
                <li key={a.id}>
                  <button
                    className="link"
                    onClick={() =>
                      void downloadFile(`/attachments/${a.id}/download`, a.fileName).catch(
                        (e: Error) => setError({ message: e.message }),
                      )
                    }
                  >
                    {a.fileName}
                  </button>{' '}
                  <span className="muted small">({formatSize(a.size)})</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {enrolled && (
          <div className="complete-box">
            <button
              className={isDone ? 'secondary' : undefined}
              onClick={() => void toggleDone()}
              disabled={saving}
            >
              {isDone ? '✓ Đã hoàn thành (bấm để bỏ)' : 'Đánh dấu đã hoàn thành'}
            </button>
          </div>
        )}

        <nav className="lesson-nav">
          {prev ? (
            <Link className="button secondary" to={`/learn/${slug}/${prev.id}`}>
              ← Bài trước
            </Link>
          ) : (
            <span />
          )}
          {next && (
            <Link className="button" to={`/learn/${slug}/${next.id}`}>
              Bài tiếp →
            </Link>
          )}
        </nav>
      </article>

      <aside className="learn-side card">
        <h2>Nội dung</h2>
        {enrolled && (
          <ProgressBar
            percent={percent}
            label={`${completed.size}/${ordered.length} bài (${percent}%)`}
          />
        )}
        <CourseOutline
          slug={course.slug}
          chapters={course.chapters}
          activeLessonId={lessonId}
          completed={enrolled ? completed : undefined}
        />
      </aside>
    </div>
  )
}
