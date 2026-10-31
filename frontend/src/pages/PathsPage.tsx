import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api } from '../lib/api'
import type { PathSummary } from '../lib/courses'

export function PathsPage() {
  const [paths, setPaths] = useState<PathSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<PathSummary[]>('/paths')
      .then(setPaths)
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <section>
      <div className="page-head">
        <div>
          <h1>Lộ trình học</h1>
          <p className="muted">Các khóa học được sắp theo thứ tự cho từng hướng đi.</p>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {!paths && !error && <p className="muted">Đang tải...</p>}
      {paths?.length === 0 && <p className="muted">Chưa có lộ trình nào.</p>}

      {paths && paths.length > 0 && (
        <div className="path-grid">
          {paths.map((p) => (
            <Link key={p.id} to={`/paths/${p.slug}`} className="card path-card">
              <h2>{p.title}</h2>
              {p.description && <p className="muted clamp-3">{p.description}</p>}
              <p className="muted small">
                {p.courseCount} khóa học · {p.createdBy.fullName}
              </p>
            </Link>
          ))}
        </div>
      )}
    </section>
  )
}
