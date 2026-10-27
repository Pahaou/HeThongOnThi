import { useState, type FormEvent } from 'react'
import { Link, Navigate, useNavigate } from 'react-router'
import { useAuth } from '../auth/auth-context'

export function RegisterPage() {
  const { user, register } = useAuth()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to="/" replace />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError(null)
    setSubmitting(true)
    try {
      await register(
        String(form.get('email')),
        String(form.get('password')),
        String(form.get('fullName')),
      )
      navigate('/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="card auth-form" onSubmit={onSubmit}>
      <h1>Đăng ký</h1>
      <label>
        Họ và tên
        <input name="fullName" autoComplete="name" required maxLength={100} />
      </label>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Mật khẩu (tối thiểu 8 ký tự)
        <input
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          maxLength={72}
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Đang tạo tài khoản...' : 'Đăng ký'}
      </button>
      <p className="muted">
        Đã có tài khoản? <Link to="/login">Đăng nhập</Link>
      </p>
    </form>
  )
}
