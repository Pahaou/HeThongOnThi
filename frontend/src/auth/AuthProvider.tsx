import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  api,
  refreshSession,
  setAccessToken,
  setSessionExpiredHandler,
  type AuthResponse,
  type User,
} from '../lib/api'
import { AuthContext, type AuthState } from './auth-context'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setSessionExpiredHandler(() => setUser(null))
    // Thử khôi phục phiên từ cookie refresh token khi tải trang
    refreshSession()
      .then((data) => setUser(data.user))
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
    return () => setSessionExpiredHandler(null)
  }, [])

  const applyAuth = useCallback((data: AuthResponse) => {
    setAccessToken(data.accessToken)
    setUser(data.user)
  }, [])

  const login = useCallback(
    async (email: string, password: string) => {
      applyAuth(
        await api<AuthResponse>('/auth/login', {
          method: 'POST',
          body: JSON.stringify({ email, password }),
        }),
      )
    },
    [applyAuth],
  )

  const register = useCallback(
    async (email: string, password: string, fullName: string) => {
      applyAuth(
        await api<AuthResponse>('/auth/register', {
          method: 'POST',
          body: JSON.stringify({ email, password, fullName }),
        }),
      )
    },
    [applyAuth],
  )

  const logout = useCallback(async () => {
    try {
      await api<void>('/auth/logout', { method: 'POST' })
    } finally {
      setAccessToken(null)
      setUser(null)
    }
  }, [])

  const value = useMemo<AuthState>(
    () => ({ user, loading, login, register, logout }),
    [user, loading, login, register, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
