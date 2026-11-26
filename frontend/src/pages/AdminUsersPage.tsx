import { useEffect, useState } from 'react'
import { useAuth } from '../auth/auth-context'
import { api, type Role, type User } from '../lib/api'

const ROLE_LABEL: Record<Role, string> = { STUDENT: 'Học viên', INSTRUCTOR: 'Giảng viên', ADMIN: 'Quản trị' }

export function AdminUsersPage() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<User[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<User[]>('/users')
      .then(setUsers)
      .catch((err: Error) => setError(err.message))
  }, [])

  async function changeRole(id: string, role: Role) {
    setError(null)
    try {
      const updated = await api<User>(`/users/${id}/role`, {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      })
      setUsers((list) => list?.map((u) => (u.id === id ? updated : u)) ?? null)
    } catch (err) {
      setError((err as Error).message)
    }
  }

  return (
    <section className="card">
      <h1>Người dùng</h1>
      {error && <p className="error">{error}</p>}
      {!users && !error && <p className="muted">Đang tải...</p>}
      {users && (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Họ tên</th>
                <th>Email</th>
                <th>Vai trò</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.fullName}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      value={u.role}
                      disabled={u.id === me?.id}
                      onChange={(e) => void changeRole(u.id, e.target.value as Role)}
                    >
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
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
