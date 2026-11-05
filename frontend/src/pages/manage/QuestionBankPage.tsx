import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { api } from '../../lib/api'
import type { ManageCourse } from '../../lib/courses'
import {
  DIFFICULTY_LABEL,
  LETTERS,
  SOURCE_LABEL,
  TYPE_LABEL,
  type Question,
  type QuestionInput,
  type QuestionList,
  type Topic,
} from '../../lib/questions'
import { ImportPanel } from './ImportPanel'
import { QuestionForm } from './QuestionForm'

export function QuestionBankPage() {
  const { id: courseId = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const [course, setCourse] = useState<ManageCourse | null>(null)
  const [topics, setTopics] = useState<Topic[]>([])
  const [list, setList] = useState<QuestionList | null>(null)
  const [error, setError] = useState<string | null>(null)
  // 'new' khi đang thêm câu, hoặc id câu đang sửa
  const [editing, setEditing] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)

  const topicId = params.get('topic') ?? ''
  const type = params.get('type') ?? ''
  const difficulty = params.get('difficulty') ?? ''
  const q = params.get('q') ?? ''
  const page = Math.max(1, Number(params.get('page')) || 1)

  function setFilter(key: string, value: string) {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    // Đổi bộ lọc thì quay về trang 1
    if (key !== 'page') next.delete('page')
    setParams(next)
  }

  const loadTopics = useCallback(
    () =>
      api<Topic[]>(`/manage/courses/${courseId}/topics`)
        .then(setTopics)
        .catch((e: Error) => setError(e.message)),
    [courseId],
  )

  const loadQuestions = useCallback(() => {
    const qs = new URLSearchParams({ page: String(page) })
    if (topicId) qs.set('topicId', topicId)
    if (type) qs.set('type', type)
    if (difficulty) qs.set('difficulty', difficulty)
    if (q) qs.set('q', q)
    return api<QuestionList>(`/manage/courses/${courseId}/questions?${qs}`)
      .then(setList)
      .catch((e: Error) => setError(e.message))
  }, [courseId, topicId, type, difficulty, q, page])

  useEffect(() => {
    api<ManageCourse>(`/manage/courses/${courseId}`)
      .then(setCourse)
      .catch((e: Error) => setError(e.message))
    void loadTopics()
  }, [courseId, loadTopics])

  useEffect(() => {
    void loadQuestions()
  }, [loadQuestions])

  const reloadAll = () => Promise.all([loadTopics(), loadQuestions()])

  async function addTopic(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const formEl = e.currentTarget
    const name = String(new FormData(formEl).get('name')).trim()
    if (!name) return
    setError(null)
    try {
      await api(`/manage/courses/${courseId}/topics`, { method: 'POST', body: JSON.stringify({ name }) })
      formEl.reset()
      await loadTopics()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function renameTopic(t: Topic) {
    const name = prompt('Tên chủ đề', t.name)?.trim()
    if (!name || name === t.name) return
    try {
      await api(`/manage/topics/${t.id}`, { method: 'PATCH', body: JSON.stringify({ name }) })
      await reloadAll()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function deleteTopic(t: Topic) {
    if (!confirm(`Xóa chủ đề "${t.name}"?`)) return
    try {
      await api(`/manage/topics/${t.id}`, { method: 'DELETE' })
      if (topicId === t.id) setFilter('topic', '')
      await loadTopics()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  async function saveQuestion(input: QuestionInput, id?: string) {
    await api(id ? `/manage/questions/${id}` : `/manage/courses/${courseId}/questions`, {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(input),
    })
    setEditing(null)
    await reloadAll()
  }

  async function deleteQuestion(question: Question) {
    if (!confirm('Xóa câu hỏi này?')) return
    try {
      await api(`/manage/questions/${question.id}`, { method: 'DELETE' })
      await reloadAll()
    } catch (err) {
      setError((err as Error).message)
    }
  }

  const lessons = course?.chapters.flatMap((c) => c.lessons.map((l) => ({ id: l.id, title: l.title }))) ?? []
  const totalPages = list ? Math.ceil(list.total / list.pageSize) : 0
  const allCount = topics.reduce((s, t) => s + t.questionCount, 0)

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link to={`/manage/courses/${courseId}`}>← {course?.title ?? 'Khóa học'}</Link>
          </p>
          <h1>Ngân hàng câu hỏi</h1>
        </div>
        <div className="row">
          <button className="secondary" onClick={() => setShowImport((v) => !v)}>
            {showImport ? 'Đóng nhập Excel' : 'Nhập từ Excel'}
          </button>
          <button onClick={() => setEditing('new')} disabled={topics.length === 0}>
            + Thêm câu hỏi
          </button>
        </div>
      </div>

      {error && <p className="error">{error}</p>}
      {showImport && <ImportPanel courseId={courseId} onImported={() => void reloadAll()} />}

      <div className="bank">
        <aside className="card bank-topics">
          <h2>Chủ đề</h2>
          <ul>
            <li>
              <button className={topicId ? 'topic-item' : 'topic-item active'} onClick={() => setFilter('topic', '')}>
                <span>Tất cả</span>
                <span className="muted small">{allCount}</span>
              </button>
            </li>
            {topics.map((t) => (
              <li key={t.id} className="topic-li">
                <button
                  className={t.id === topicId ? 'topic-item active' : 'topic-item'}
                  onClick={() => setFilter('topic', t.id)}
                >
                  <span>{t.name}</span>
                  <span className="muted small">{t.questionCount}</span>
                </button>
                <span className="topic-actions">
                  <button className="link small" onClick={() => void renameTopic(t)}>
                    Sửa
                  </button>
                  <button className="link danger small" onClick={() => void deleteTopic(t)}>
                    Xóa
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <form className="inline-form" onSubmit={addTopic}>
            <input name="name" placeholder="Chủ đề mới" maxLength={100} required />
            <button type="submit">Thêm</button>
          </form>
          {topics.length === 0 && (
            <p className="muted small">Tạo chủ đề trước khi thêm câu hỏi, hoặc nhập từ Excel.</p>
          )}
        </aside>

        <div className="stack bank-main">
          <div className="card filters">
            <select value={type} onChange={(e) => setFilter('type', e.target.value)}>
              <option value="">Mọi loại</option>
              {Object.entries(TYPE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <select value={difficulty} onChange={(e) => setFilter('difficulty', e.target.value)}>
              <option value="">Mọi độ khó</option>
              {Object.entries(DIFFICULTY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <form
              className="search"
              onSubmit={(e) => {
                e.preventDefault()
                setFilter('q', String(new FormData(e.currentTarget).get('q') ?? '').trim())
              }}
            >
              <input name="q" type="search" placeholder="Tìm trong nội dung..." defaultValue={q} key={q} />
              <button type="submit">Tìm</button>
            </form>
          </div>

          {editing === 'new' && (
            <div className="card">
              <h2>Câu hỏi mới</h2>
              <QuestionForm
                topics={topics}
                lessons={lessons}
                defaultTopicId={topicId || undefined}
                onSave={(input) => saveQuestion(input)}
                onCancel={() => setEditing(null)}
              />
            </div>
          )}

          {!list && <p className="muted">Đang tải...</p>}
          {list && (
            <p className="muted small">
              {list.total} câu hỏi{list.total > 0 && totalPages > 1 && ` · trang ${page}/${totalPages}`}
            </p>
          )}
          {list?.items.length === 0 && <p className="muted">Không có câu hỏi nào khớp bộ lọc.</p>}

          {list?.items.map((question) =>
            editing === question.id ? (
              <div key={question.id} className="card">
                <h2>Sửa câu hỏi</h2>
                <QuestionForm
                  question={question}
                  topics={topics}
                  lessons={lessons}
                  onSave={(input) => saveQuestion(input, question.id)}
                  onCancel={() => setEditing(null)}
                />
              </div>
            ) : (
              <article key={question.id} className="card question-card">
                <div className="question-meta">
                  <span className="badge">{question.topic.name}</span>
                  <span className="badge">{TYPE_LABEL[question.type]}</span>
                  <span className={`badge diff-${question.difficulty.toLowerCase()}`}>
                    {DIFFICULTY_LABEL[question.difficulty]}
                  </span>
                  {question.source !== 'MANUAL' && (
                    <span className="badge">{SOURCE_LABEL[question.source]}</span>
                  )}
                </div>
                <p className="question-content pre-line">{question.content}</p>
                <ul className="answer-list">
                  {question.options.map((o, i) => (
                    <li key={o.id} className={o.isCorrect ? 'correct' : undefined}>
                      <span className="option-letter">{LETTERS[i]}</span> {o.content}
                      {o.isCorrect && <span className="sr-only"> (đúng)</span>}
                    </li>
                  ))}
                </ul>
                {question.explanation && (
                  <p className="muted small pre-line">Giải thích: {question.explanation}</p>
                )}
                {question.lesson && <p className="muted small">Bài học: {question.lesson.title}</p>}
                <div className="row tight">
                  <button className="link" onClick={() => setEditing(question.id)}>
                    Sửa
                  </button>
                  <button className="link danger" onClick={() => void deleteQuestion(question)}>
                    Xóa
                  </button>
                </div>
              </article>
            ),
          )}

          {totalPages > 1 && (
            <nav className="pager">
              <button disabled={page <= 1} onClick={() => setFilter('page', String(page - 1))}>
                Trước
              </button>
              <span>
                Trang {page}/{totalPages}
              </span>
              <button disabled={page >= totalPages} onClick={() => setFilter('page', String(page + 1))}>
                Sau
              </button>
            </nav>
          )}
        </div>
      </div>
    </section>
  )
}
