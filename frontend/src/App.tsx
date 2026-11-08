import { useEffect, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router'
import { useAuth } from './auth/auth-context'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { AdminUsersPage } from './pages/AdminUsersPage'
import { CatalogPage } from './pages/CatalogPage'
import { CourseDetailPage } from './pages/CourseDetailPage'
import { LessonPage } from './pages/LessonPage'
import { LoginPage } from './pages/LoginPage'
import { BlueprintsPage } from './pages/manage/BlueprintsPage'
import { CourseEditorPage } from './pages/manage/CourseEditorPage'
import { ManageCoursesPage } from './pages/manage/ManageCoursesPage'
import { ManagePathsPage } from './pages/manage/ManagePathsPage'
import { PathEditorPage } from './pages/manage/PathEditorPage'
import { QuestionBankPage } from './pages/manage/QuestionBankPage'
import { MyCoursesPage } from './pages/MyCoursesPage'
import { PathDetailPage } from './pages/PathDetailPage'
import { PathsPage } from './pages/PathsPage'
import { PracticeHomePage } from './pages/PracticeHomePage'
import { PracticePage } from './pages/PracticePage'
import { RegisterPage } from './pages/RegisterPage'
import { ExamTakePage } from './pages/ExamTakePage'
import { MyExamsPage } from './pages/MyExamsPage'
import { ExamDetailPage } from './pages/manage/ExamDetailPage'
import { ManageExamsPage } from './pages/manage/ManageExamsPage'
import { StatsPage } from './pages/StatsPage'
import { WrongNotebookPage } from './pages/WrongNotebookPage'

function Header() {
  const { user, logout } = useAuth()
  const canManage = user?.role === 'INSTRUCTOR' || user?.role === 'ADMIN'
  // Màn hẹp: menu thu gọn sau nút ☰, chuyển trang thì tự đóng
  const [open, setOpen] = useState(false)
  const location = useLocation()
  useEffect(() => setOpen(false), [location.pathname])
  return (
    <header className="topbar">
      <Link to="/" className="brand">
        HTON
      </Link>
      <button
        className="menu-toggle"
        aria-expanded={open}
        aria-controls="main-nav"
        aria-label={open ? 'Đóng menu' : 'Mở menu'}
        onClick={() => setOpen((v) => !v)}
      >
        {open ? '✕' : '☰'}
      </button>
      <nav id="main-nav" className={open ? 'open' : undefined}>
        <NavLink to="/" end>
          Khóa học
        </NavLink>
        <NavLink to="/paths">Lộ trình</NavLink>
        {user && <NavLink to="/my-courses">Khóa học của tôi</NavLink>}
        {user && <NavLink to="/exams">Kỳ thi</NavLink>}
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
            <Route path="/paths" element={<PathsPage />} />
            <Route path="/paths/:slug" element={<PathDetailPage />} />
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
              path="/courses/:slug/practice"
              element={
                <RequireAuth>
                  <PracticeHomePage />
                </RequireAuth>
              }
            />
            <Route
              path="/courses/:slug/stats"
              element={
                <RequireAuth>
                  <StatsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/courses/:slug/wrong"
              element={
                <RequireAuth>
                  <WrongNotebookPage />
                </RequireAuth>
              }
            />
            <Route
              path="/practice/:id"
              element={
                <RequireAuth>
                  <PracticePage />
                </RequireAuth>
              }
            />
            <Route
              path="/exams"
              element={
                <RequireAuth>
                  <MyExamsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/exams/:id/take"
              element={
                <RequireAuth>
                  <ExamTakePage />
                </RequireAuth>
              }
            />
            <Route
              path="/my-courses"
              element={
                <RequireAuth>
                  <MyCoursesPage />
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
              path="/manage/courses/:id/questions"
              element={
                <RequireAuth roles={['INSTRUCTOR', 'ADMIN']}>
                  <QuestionBankPage />
                </RequireAuth>
              }
            />
            <Route
              path="/manage/courses/:id/blueprints"
              element={
                <RequireAuth roles={['INSTRUCTOR', 'ADMIN']}>
                  <BlueprintsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/manage/courses/:id/exams"
              element={
                <RequireAuth roles={['INSTRUCTOR', 'ADMIN']}>
                  <ManageExamsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/manage/exams/:id"
              element={
                <RequireAuth roles={['INSTRUCTOR', 'ADMIN']}>
                  <ExamDetailPage />
                </RequireAuth>
              }
            />
            <Route
              path="/manage/paths"
              element={
                <RequireAuth roles={['INSTRUCTOR', 'ADMIN']}>
                  <ManagePathsPage />
                </RequireAuth>
              }
            />
            <Route
              path="/manage/paths/:id"
              element={
                <RequireAuth roles={['INSTRUCTOR', 'ADMIN']}>
                  <PathEditorPage />
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
