import { BrowserRouter, Link, NavLink, Route, Routes } from 'react-router'
import { useAuth } from './auth/auth-context'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { CatalogPage } from './pages/CatalogPage'
import { CourseDetailPage } from './pages/CourseDetailPage'
import { LessonPage } from './pages/LessonPage'
import { LoginPage } from './pages/LoginPage'
import { CourseEditorPage } from './pages/manage/CourseEditorPage'
import { ManageCoursesPage } from './pages/manage/ManageCoursesPage'
import { RegisterPage } from './pages/RegisterPage'

function Header() {
  const { user, logout } = useAuth()
  const canManage = user?.role === 'INSTRUCTOR' || user?.role === 'ADMIN'
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        HTON
      </Link>
      <nav>
        <NavLink to="/" end>
          Khóa học
        </NavLink>
        {canManage && <NavLink to="/manage">Soạn khóa học</NavLink>}
        {user?.role === 'ADMIN' && <NavLink to="/admin/users">Người dùng</NavLink>}
        {user ? (
          <>
            <span className="muted">{user.fullName}</span>
            <button className="link" onClick={() => void logout()}>
              Đăng xuất
            </button>
          </>
        ) : (
          <NavLink to="/login">Đăng nhập</NavLink>
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
            <Route path="/" element={<CatalogPage />} />
            <Route path="/courses/:slug" element={<CourseDetailPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterPage />} />
            <Route
              path="/learn/:slug/:lessonId"
              element={
                <RequireAuth>
                  <LessonPage />
                </RequireAuth>
              }
            />
            <Route
              path="/manage"
              element={
                <RequireAuth roles={['INSTRUCTOR', 'ADMIN']}>
                  <ManageCoursesPage />
                </RequireAuth>
              }
            />
            <Route
              path="/manage/courses/:id"
              element={
                <RequireAuth roles={['INSTRUCTOR', 'ADMIN']}>
                  <CourseEditorPage />
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
