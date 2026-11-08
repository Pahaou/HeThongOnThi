/**
 * Lưu tạm đáp án bài thi trên máy (IndexedDB) để mất mạng, F5 hay trình
 * duyệt bị tắt đột ngột cũng không mất lựa chọn. Trình duyệt chặn
 * IndexedDB (vd. một số chế độ ẩn danh) thì dùng bộ nhớ tạm của trang.
 */

export interface LocalAnswer {
  /** `${examId}:${questionId}` */
  key: string
  examId: string
  questionId: string
  selectedOptionIds: string[]
  /** Thời điểm chọn theo giờ server (ms) */
  clientSavedAt: number
  synced: boolean
}

const DB_NAME = 'hton-exam'
const STORE = 'answers'
const memory = new Map<string, LocalAnswer>()
let dbPromise: Promise<IDBDatabase | null> | null = null

function openDb(): Promise<IDBDatabase | null> {
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const store = req.result.createObjectStore(STORE, { keyPath: 'key' })
        store.createIndex('examId', 'examId')
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
  return dbPromise
}

function run<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(null)
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE))
          req.onsuccess = () => resolve(req.result)
          req.onerror = () => resolve(null)
        } catch {
          resolve(null)
        }
      }),
  )
}

export async function saveLocal(answer: LocalAnswer): Promise<void> {
  memory.set(answer.key, answer)
  await run('readwrite', (s) => s.put(answer))
}

export async function loadLocal(examId: string): Promise<LocalAnswer[]> {
  const rows = await run<LocalAnswer[]>('readonly', (s) => s.index('examId').getAll(examId))
  const byKey = new Map((rows ?? []).map((r) => [r.key, r]))
  // Bản trong bộ nhớ có thể mới hơn nếu IndexedDB ghi lỗi
  for (const m of memory.values()) {
    if (m.examId === examId && (byKey.get(m.key)?.clientSavedAt ?? -1) < m.clientSavedAt) byKey.set(m.key, m)
  }
  return [...byKey.values()]
}

/** Đánh dấu đã gửi, nhưng chỉ khi thí sinh chưa đổi lựa chọn trong lúc gửi. */
export async function markSynced(answer: LocalAnswer): Promise<void> {
  const current = memory.get(answer.key)
  if (current && current.clientSavedAt !== answer.clientSavedAt) return
  await saveLocal({ ...answer, synced: true })
}

export async function clearLocal(examId: string): Promise<void> {
  for (const key of [...memory.keys()]) if (key.startsWith(`${examId}:`)) memory.delete(key)
  const rows = await loadLocal(examId)
  await Promise.all(rows.map((r) => run('readwrite', (s) => s.delete(r.key))))
}
