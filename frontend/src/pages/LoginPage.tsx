import { useState, type FormEvent } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router'
import { useAuth } from '../auth/auth-context'

export function LoginPage() {
  const { user, login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  if (user) return <Navigate to={from} replace />

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError(null)
    setSubmitting(true)
    try {
      await login(String(form.get('email')), String(form.get('password')))
      navigate(from, { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="card auth-form" onSubmit={onSubmit}>
      <h1>Đăng nhập</h1>
      <label>
        Email
        <input name="email" type="email" autoComplete="email" required />
      </label>
      <label>
        Mật khẩu
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
      </button>
      <p className="muted">
        Chưa có tài khoản? <Link to="/register">Đăng ký</Link>
      </p>
    </form>
  )
}
