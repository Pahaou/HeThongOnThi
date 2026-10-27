export type Role = 'STUDENT' | 'INSTRUCTOR' | 'ADMIN'

export interface User {
  id: string
  email: string
  fullName: string
  role: Role
  createdAt: string
}

export interface AuthResponse {
  accessToken: string
  user: User
}

export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

// Access token chỉ nằm trong bộ nhớ, không lưu localStorage để tránh bị XSS đọc.
// Khi tải lại trang, refresh token trong cookie httpOnly sẽ cấp token mới.
let accessToken: string | null = null
let onSessionExpired: (() => void) | null = null

export function setAccessToken(token: string | null) {
  accessToken = token
}

export function setSessionExpiredHandler(handler: (() => void) | null) {
  onSessionExpired = handler
}

async function parseError(res: Response): Promise<ApiError> {
  let message = res.statusText
  try {
    const body = (await res.json()) as { message?: string | string[] }
    if (body.message) {
      message = Array.isArray(body.message) ? body.message.join(', ') : body.message
    }
  } catch {
    // body không phải JSON
  }
  return new ApiError(res.status, message)
}

// Gộp các lần refresh đồng thời thành một request. Backend coi việc dùng lại
// refresh token cũ là bị đánh cắp và thu hồi cả phiên.
let refreshing: Promise<AuthResponse> | null = null

export function refreshSession(): Promise<AuthResponse> {
  refreshing ??= fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) throw await parseError(res)
      const data = (await res.json()) as AuthResponse
      accessToken = data.accessToken
      return data
    })
    .finally(() => {
      refreshing = null
    })
  return refreshing
}

export async function api<T>(path: string, init: RequestInit = {}, retry = true): Promise<T> {
  const headers = new Headers(init.headers)
  if (init.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json')
  if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`)

  const res = await fetch(`/api${path}`, { ...init, headers, credentials: 'include' })

  if (res.status === 401 && retry && accessToken) {
    try {
      await refreshSession()
    } catch {
      accessToken = null
      onSessionExpired?.()
      throw await parseError(res)
    }
    return api<T>(path, init, false)
  }
  if (!res.ok) throw await parseError(res)
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
