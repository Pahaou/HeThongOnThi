import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../../lib/api'
import type { BlueprintRule, ManageBlueprint } from '../../lib/practice'
import { DIFFICULTY_LABEL, type Difficulty, type Topic } from '../../lib/questions'

function BlueprintForm({
  blueprint,
  topics,
  onSave,
  onCancel,
}: {
  blueprint?: ManageBlueprint
  topics: Topic[]
  onSave: (body: { title: string; durationSec: number; rules: BlueprintRule[] }) => Promise<void>
  onCancel: () => void
}) {
  const [rules, setRules] = useState<BlueprintRule[]>(
    blueprint?.rules.map((r) => ({ topicId: r.topic.id, difficulty: r.difficulty, count: r.count })) ?? [
      { topicId: topics[0]?.id ?? '', difficulty: 'EASY', count: 5 },
    ],
  )
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const total = rules.reduce((s, r) => s + (r.count || 0), 0)

  function setRule(i: number, patch: Partial<BlueprintRule>) {
    setRules((list) => list.map((r, j) => (j === i ? { ...r, ...patch } : r)))
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setSaving(true)
    setError(null)
    try {
      await onSave({
        title: String(form.get('title')).trim(),
        durationSec: Math.round(Number(form.get('minutes')) * 60),
        rules,
      })
    } catch (err) {
      setError((err as Error).message)
      setSaving(false)
    }
  }

  return (
    <form className="question-form" onSubmit={onSubmit}>
      <div className="row">
        <label className="grow">
          Tên đề
          <input name="title" defaultValue={blueprint?.title} required maxLength={200} placeholder="vd. Thi thử giữa kỳ" />
        </label>
        <label>
          Thời gian (phút)
          <input
            name="minutes"
            type="number"
            min={1}
            max={180}
            defaultValue={blueprint ? Math.round(blueprint.durationSec / 60) : 15}
            required
          />
        </label>
      </div>

      <fieldset className="options-editor">
        <legend>
          Ma trận đề <span className="muted small">(tổng {total} câu)</span>
        </legend>
        {rules.map((r, i) => (
          <div key={i} className="option-row">
            <select className="grow" value={r.topicId} onChange={(e) => setRule(i, { topicId: e.target.value })}>
              {topics.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <select value={r.difficulty} onChange={(e) => setRule(i, { difficulty: e.target.value as Difficulty })}>
              {Object.entries(DIFFICULTY_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
            <input
              type="number"
              min={1}
              max={100}
              value={r.count}
              onChange={(e) => setRule(i, { count: Number(e.target.value) })}
              aria-label="Số câu"
              className="count-input"
            />
            <span className="muted small">câu</span>
            <button
              type="button"
              className="icon"
              title="Xóa dòng"
              disabled={rules.length <= 1}
              onClick={() => setRules((list) => list.filter((_, j) => j !== i))}
            >
              ✕
            </button>
          </div>
        ))}
        <div>
          <button
            type="button"
            className="secondary"
            onClick={() => setRules((list) => [...list, { topicId: topics[0]?.id ?? '', difficulty: 'MEDIUM', count: 5 }])}
          >
            + Thêm dòng
          </button>
        </div>
      </fieldset>
      <p className="muted small">Sau khi lưu, đề chuyển về bản nháp. Kiểm tra số câu trong kho rồi bấm Công bố.</p>

      {error && <p className="error">{error}</p>}
      <div className="row">
        <button type="submit" disabled={saving}>
          {saving ? 'Đang lưu...' : 'Lưu đề'}
        </button>
        <button type="button" className="secondary" onClick={onCancel}>
          Hủy
        </button>
      </div>
    </form>
  )
}

export function BlueprintsPage() {
  const { id: courseId = '' } = useParams()
  const [blueprints, setBlueprints] = useState<ManageBlueprint[] | null>(null)
  const [topics, setTopics] = useState<Topic[]>([])
  const [editing, setEditing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(
    () =>
      Promise.all([
        api<ManageBlueprint[]>(`/manage/courses/${courseId}/blueprints`),
        api<Topic[]>(`/manage/courses/${courseId}/topics`),
      ])
        .then(([b, t]) => {
          setBlueprints(b)
          setTopics(t)
        })
        .catch((e: Error) => setError(e.message)),
    [courseId],
  )

  useEffect(() => {
    void load()
  }, [load])

  async function save(body: object, blueprintId?: string) {
    await api(blueprintId ? `/manage/blueprints/${blueprintId}` : `/manage/courses/${courseId}/blueprints`, {
      method: blueprintId ? 'PUT' : 'POST',
      body: JSON.stringify(body),
    })
    setEditing(null)
    await load()
  }

  async function run(action: () => Promise<unknown>) {
    setError(null)
    try {
      await action()
      await load()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <section className="stack">
      <div className="page-head">
        <div>
          <p className="muted small">
            <Link to={`/manage/courses/${courseId}`}>← Khóa học</Link> ·{' '}
            <Link to={`/manage/courses/${courseId}/questions`}>Ngân hàng câu hỏi</Link>
          </p>
          <h1>Đề thi thử</h1>
        </div>
        <button onClick={() => setEditing('new')} disabled={topics.length === 0}>
          + Tạo đề
        </button>
      </div>

      {error && <p className="error">{error}</p>}
      {topics.length === 0 && blueprints && (
        <p className="muted">Khóa học chưa có chủ đề nào. Thêm câu hỏi vào ngân hàng trước.</p>
      )}

      {editing === 'new' && (
        <div className="card">
          <h2>Đề mới</h2>
          <BlueprintForm topics={topics} onSave={(b) => save(b)} onCancel={() => setEditing(null)} />
        </div>
      )}

      {!blueprints && <p className="muted">Đang tải...</p>}
      {blueprints?.length === 0 && editing !== 'new' && <p className="muted">Chưa có đề thi thử nào.</p>}

      {blueprints?.map((b) =>
        editing === b.id ? (
          <div key={b.id} className="card">
            <h2>Sửa đề</h2>
            <BlueprintForm blueprint={b} topics={topics} onSave={(body) => save(body, b.id)} onCancel={() => setEditing(null)} />
          </div>
        ) : (
          <article key={b.id} className="card stack">
            <div className="chapter-head">
              <div>
                <h2>{b.title}</h2>
                <p className="muted small">
                  {b.totalQuestions} câu · {Math.round(b.durationSec / 60)} phút
                </p>
              </div>
              <div className="row tight">
                <span className={b.published ? 'badge ok' : 'badge'}>{b.published ? 'Đã công bố' : 'Bản nháp'}</span>
                {!b.ready && <span className="badge wrong">Kho thiếu câu</span>}
              </div>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Chủ đề</th>
                    <th>Độ khó</th>
                    <th>Số câu</th>
                    <th>Kho hiện có</th>
                  </tr>
                </thead>
                <tbody>
                  {b.rules.map((r) => (
                    <tr key={`${r.topic.id}-${r.difficulty}`}>
                      <td>{r.topic.name}</td>
                      <td>{DIFFICULTY_LABEL[r.difficulty]}</td>
                      <td>{r.count}</td>
                      <td className={r.available < r.count ? 'error' : undefined}>
                        {r.available}
                        {r.available < r.count && ` (thiếu ${r.count - r.available})`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row tight">
              <button
                onClick={() =>
                  void run(() =>
                    api(`/manage/blueprints/${b.id}/publish`, {
                      method: 'PATCH',
                      body: JSON.stringify({ published: !b.published }),
                    }),
                  )
                }
              >
                {b.published ? 'Chuyển về nháp' : 'Công bố'}
              </button>
              <button className="link" onClick={() => setEditing(b.id)}>
                Sửa
              </button>
              <button
                className="link danger"
                onClick={() => {
                  if (confirm(`Xóa đề "${b.title}"? Lịch sử làm bài của học viên vẫn giữ lại.`)) {
                    void run(() => api(`/manage/blueprints/${b.id}`, { method: 'DELETE' }))
                  }
                }}
              >
                Xóa
              </button>
            </div>
          </article>
        ),
      )}
    </section>
  )
}
