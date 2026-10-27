import { Link } from 'react-router'
import { formatDuration, type OutlineChapter } from '../lib/courses'

export function CourseOutline({
  slug,
  chapters,
  activeLessonId,
}: {
  slug: string
  chapters: OutlineChapter[]
  activeLessonId?: string
}) {
  return (
    <ol className="outline">
      {chapters.map((ch, i) => (
        <li key={ch.id}>
          <div className="outline-chapter">
            Chương {i + 1}. {ch.title}
          </div>
          <ol>
            {ch.lessons.map((l) => (
              <li key={l.id}>
                <Link
                  to={`/learn/${slug}/${l.id}`}
                  className={l.id === activeLessonId ? 'active' : undefined}
                >
                  <span className="lesson-icon">{l.type === 'VIDEO' ? '▶' : '📄'}</span>
                  <span className="lesson-title">{l.title}</span>
                  {l.durationSec > 0 && (
                    <span className="muted small">{formatDuration(l.durationSec)}</span>
                  )}
                </Link>
              </li>
            ))}
          </ol>
        </li>
      ))}
    </ol>
  )
}
