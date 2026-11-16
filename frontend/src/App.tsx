import { lazy, Suspense, useEffect, useState } from 'react'
import { BrowserRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router'
import { useAuth } from './auth/auth-context'
import { AuthProvider } from './auth/AuthProvider'
import { RequireAuth } from './auth/RequireAuth'
import { CatalogPage } from './pages/CatalogPage'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'

// Trang ngoài luồng xem khóa học tải khi cần, để gói JS ban đầu nhỏ
const AdminUsersPage = lazy(() => import('./pages/AdminUsersPage').then((m) => ({ default: m.AdminUsersPage })))
const CourseDetailPage = lazy(() =>
  import('./pages/CourseDetailPage').then((m) => ({
    default: m.CourseDetailPage,
  })),
)
const LessonPage = lazy(() => import('./pages/LessonPage').then((m) => ({ default: m.LessonPage })))
const BlueprintsPage = lazy(() =>
  import('./pages/manage/BlueprintsPage').then((m) => ({
    default: m.BlueprintsPage,
  })),
)
const CourseEditorPage = lazy(() =>
  import('./pages/manage/CourseEditorPage').then((m) => ({
    default: m.CourseEditorPage,
  })),
)
const ManageCoursesPage = lazy(() =>
  import('./pages/manage/ManageCoursesPage').then((m) => ({
    default: m.ManageCoursesPage,
  })),
)
const ManagePathsPage = lazy(() =>
  import('./pages/manage/ManagePathsPage').then((m) => ({
    default: m.ManagePathsPage,
  })),
)
const PathEditorPage = lazy(() =>
  import('./pages/manage/PathEditorPage').then((m) => ({
    default: m.PathEditorPage,
  })),
)
const QuestionBankPage = lazy(() =>
  import('./pages/manage/QuestionBankPage').then((m) => ({
    default: m.QuestionBankPage,
  })),
)
const MyCoursesPage = lazy(() => import('./pages/MyCoursesPage').then((m) => ({ default: m.MyCoursesPage })))
const PathDetailPage = lazy(() => import('./pages/PathDetailPage').then((m) => ({ default: m.PathDetailPage })))
const PathsPage = lazy(() => import('./pages/PathsPage').then((m) => ({ default: m.PathsPage })))
const PracticeHomePage = lazy(() =>
  import('./pages/PracticeHomePage').then((m) => ({
    default: m.PracticeHomePage,
  })),
)
const PracticePage = lazy(() => import('./pages/PracticePage').then((m) => ({ default: m.PracticePage })))
const ExamTakePage = lazy(() => import('./pages/ExamTakePage').then((m) => ({ default: m.ExamTakePage })))
const MyExamsPage = lazy(() => import('./pages/MyExamsPage').then((m) => ({ default: m.MyExamsPage })))
const ExamDetailPage = lazy(() =>
  import('./pages/manage/ExamDetailPage').then((m) => ({
    default: m.ExamDetailPage,
  })),
)
const ManageExamsPage = lazy(() =>
  import('./pages/manage/ManageExamsPage').then((m) => ({
    default: m.ManageExamsPage,
  })),
)
const ProctorPage = lazy(() =>
  import('./pages/manage/ProctorPage').then((m) => ({
    default: m.ProctorPage,
  })),
)
const StatsPage = lazy(() => import('./pages/StatsPage').then((m) => ({ default: m.StatsPage })))
const WrongNotebookPage = lazy(() =>
  import('./pages/WrongNotebookPage').then((m) => ({
    default: m.WrongNotebookPage,
  })),
)

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
          <Suspense fallback={<p className="muted">Đang tải...</p>}>
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
                path="/manage/exams/:id/proctor"
                element={
                  <RequireAuth roles={['INSTRUCTOR', 'ADMIN']}>
                    <ProctorPage />
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
          </Suspense>
        </main>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
