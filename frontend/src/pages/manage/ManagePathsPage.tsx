import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { useAuth } from '../../auth/auth-context'
import { api } from '../../lib/api'
import type { ManagePathRow } from '../../lib/courses'

export function ManagePathsPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [paths, setPaths] = useState<ManagePathRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    api<ManagePathRow[]>('/manage/paths')
      .then(setPaths)
      .catch((e: Error) => setError(e.message))
  }, [])

  async function onCreate(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const title = String(new FormData(e.currentTarget).get('title')).trim()
    if (!title) return
    setCreating(true)
    setError(null)
    try {
      const path = await api<{ id: string }>('/manage/paths', {
        method: 'POST',
        body: JSON.stringify({ title }),
      })
      navigate(`/manage/paths/${path.id}`)
    } catch (err) {
      setError((err as Error).message)
      setCreating(false)
    }
  }

  return (
    <section className="stack">
      <div className="page-head">
        <h1>Quản lý lộ trình</h1>
        <Link to="/manage">Quản lý khóa học →</Link>
      </div>

      <form className="card inline-form" onSubmit={onCreate}>
        <input name="title" placeholder="Tên lộ trình mới, vd. Frontend cơ bản" required maxLength={200} />
        <button type="submit" disabled={creating}>
          Tạo lộ trình
        </button>
      </form>

      {error && <p className="error">{error}</p>}
      {!paths && !error && <p className="muted">Đang tải...</p>}
      {paths?.length === 0 && <p className="muted">Bạn chưa có lộ trình nào.</p>}

      {paths && paths.length > 0 && (
        <div className="card table-wrap">
          <table>
            <thead>
              <tr>
                <th>Lộ trình</th>
                {user?.role === 'ADMIN' && <th>Người tạo</th>}
                <th>Số khóa</th>
                <th>Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {paths.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link to={`/manage/paths/${p.id}`}>{p.title}</Link>
                  </td>
                  {user?.role === 'ADMIN' && <td>{p.createdBy.fullName}</td>}
                  <td>{p._count.courses}</td>
                  <td>
                    <span className={p.published ? 'badge ok' : 'badge'}>
                      {p.published ? 'Đã công bố' : 'Bản nháp'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
