import { useEffect, useState } from 'react'
import Markdown from 'react-markdown'
import { Link, useParams } from 'react-router'
import { CourseOutline } from '../components/CourseOutline'
import { VideoPlayer } from '../components/VideoPlayer'
import { api, downloadFile } from '../lib/api'
import { formatSize, type CourseDetail, type LessonDetail } from '../lib/courses'

export function LessonPage() {
  const { slug = '', lessonId = '' } = useParams()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [lesson, setLesson] = useState<LessonDetail | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<CourseDetail>(`/courses/${slug}`)
      .then(setCourse)
      .catch((e: Error) => setError(e.message))
  }, [slug])

  useEffect(() => {
    setLesson(null)
    api<LessonDetail>(`/lessons/${lessonId}`)
      .then(setLesson)
      .catch((e: Error) => setError(e.message))
  }, [lessonId])

  if (error) return <p className="error">{error}</p>
  if (!course || !lesson) return <p className="muted">Đang tải...</p>

  const ordered = course.chapters.flatMap((c) => c.lessons)
  const index = ordered.findIndex((l) => l.id === lessonId)
  const prev = ordered[index - 1]
  const next = ordered[index + 1]

  return (
    <div className="learn">
      <article className="learn-main">
        <p className="muted small">
          <Link to={`/courses/${course.slug}`}>{course.title}</Link> / {lesson.chapter.title}
        </p>
        <h1>{lesson.title}</h1>

        {lesson.type === 'VIDEO' && lesson.videoUrl && (
          <VideoPlayer url={lesson.videoUrl} title={lesson.title} />
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
                        (e: Error) => setError(e.message),
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
        <CourseOutline slug={course.slug} chapters={course.chapters} activeLessonId={lessonId} />
      </aside>
    </div>
  )
}
