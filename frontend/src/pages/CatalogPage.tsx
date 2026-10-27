import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { api } from '../lib/api'
import { formatDuration, type CourseList } from '../lib/courses'

export function CatalogPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)
  const [data, setData] = useState<CourseList | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const qs = new URLSearchParams({ page: String(page) })
    if (q) qs.set('q', q)
    let cancelled = false
    api<CourseList>(`/courses?${qs}`)
      .then((d) => !cancelled && setData(d))
      .catch((e: Error) => !cancelled && setError(e.message))
    return () => {
      cancelled = true
    }
  }, [q, page])

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const value = String(new FormData(e.currentTarget).get('q') ?? '').trim()
    setParams(value ? { q: value } : {})
  }

  const totalPages = data ? Math.ceil(data.total / data.pageSize) : 0

  return (
    <section>
      <div className="page-head">
        <h1>Khóa học</h1>
        <form className="search" onSubmit={onSearch}>
          <input name="q" type="search" placeholder="Tìm khóa học..." defaultValue={q} key={q} />
          <button type="submit">Tìm</button>
        </form>
      </div>

      {error && <p className="error">{error}</p>}
      {!data && !error && <p className="muted">Đang tải...</p>}
      {data && data.items.length === 0 && (
        <p className="muted">{q ? `Không có khóa học nào khớp "${q}".` : 'Chưa có khóa học nào.'}</p>
      )}

      {data && data.items.length > 0 && (
        <div className="course-grid">
          {data.items.map((c) => (
            <Link key={c.id} to={`/courses/${c.slug}`} className="course-card">
              <div className="thumb">
                {c.thumbnailUrl ? <img src={c.thumbnailUrl} alt="" /> : <span>{c.title[0]}</span>}
              </div>
              <div className="course-card-body">
                <h2>{c.title}</h2>
                <p className="muted">{c.instructor.fullName}</p>
                <p className="muted small">
                  {c.lessonCount} bài học
                  {c.totalDurationSec > 0 && ` · ${formatDuration(c.totalDurationSec)}`}
                </p>
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <nav className="pager">
          <button
            disabled={page <= 1}
            onClick={() => setParams({ ...(q && { q }), page: String(page - 1) })}
          >
            Trước
          </button>
          <span>
            Trang {page}/{totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setParams({ ...(q && { q }), page: String(page + 1) })}
          >
            Sau
          </button>
        </nav>
      )}
    </section>
  )
}
