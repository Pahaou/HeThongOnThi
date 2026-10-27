import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router'
import type { Role } from '../lib/api'
import { useAuth } from './auth-context'

export function RequireAuth({ roles, children }: { roles?: Role[]; children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) return <p className="muted">Đang tải...</p>
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (roles && !roles.includes(user.role)) {
    return <p className="error">Bạn không có quyền truy cập trang này.</p>
  }
  return children
}
