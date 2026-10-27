import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { useAuth } from './auth/auth-context'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'

function Header() {
  const { user, logout } = useAuth()
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        HTON
      </Link>
      <nav>
        {user?.role === 'ADMIN' && <Link to="/admin/users">Người dùng</Link>}
        {user ? (
          <button className="link" onClick={() => void logout()}>
            Đăng xuất
          </button>
        ) : (
          <Link to="/login">Đăng nhập</Link>
        )}
      </nav>
    </header>
  )
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Header />
        <main className="container">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/"
              element={
                <RequireAuth>
                  <HomePage />
                </RequireAuth>
              }
            />
            <Route
              path="/admin/users"
              element={
                <RequireAuth roles={['ADMIN']}>
                  <AdminUsersPage />
                </RequireAuth>
              }
            />
            <Route path="*" element={<p className="muted">Không tìm thấy trang.</p>} />
          </Routes>
        </main>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
