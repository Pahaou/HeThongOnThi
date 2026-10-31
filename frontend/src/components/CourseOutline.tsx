import { Link } from 'react-router'
import { formatDuration, type OutlineChapter } from '../lib/courses'

export function CourseOutline({
  slug,
  chapters,
  activeLessonId,
  completed,
}: {
  slug: string
  chapters: OutlineChapter[]
  activeLessonId?: string
  /** Id các bài đã hoàn thành; không truyền thì không hiện dấu tích */
  completed?: ReadonlySet<string>
}) {
  return (
    <ol className="outline">
      {chapters.map((ch, i) => (
        <li key={ch.id}>
          <div className="outline-chapter">
            Chương {i + 1}. {ch.title}
          </div>
          <ol>
            {ch.lessons.map((l) => {
              const done = completed?.has(l.id)
              return (
                <li key={l.id}>
                  <Link
                    to={`/learn/${slug}/${l.id}`}
                    className={l.id === activeLessonId ? 'active' : undefined}
                  >
                    <span className={done ? 'lesson-icon done' : 'lesson-icon'}>
                      {done ? '✓' : l.type === 'VIDEO' ? '▶' : '📄'}
                    </span>
                    <span className="lesson-title">{l.title}</span>
                    {l.durationSec > 0 && (
                      <span className="muted small">{formatDuration(l.durationSec)}</span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ol>
        </li>
      ))}
    </ol>
  )
}
