import { useAuth } from '../auth/auth-context'

const ROLE_LABEL = { STUDENT: 'Học viên', INSTRUCTOR: 'Giảng viên', ADMIN: 'Quản trị viên' }

export function HomePage() {
  const { user } = useAuth()
  if (!user) return null

  return (
    <section className="card">
      <h1>Xin chào, {user.fullName}</h1>
      <p>
        Vai trò: <strong>{ROLE_LABEL[user.role]}</strong>
      </p>
      <p className="muted">Các khóa học sẽ hiển thị ở đây ở bước tiếp theo.</p>
    </section>
  )
}
