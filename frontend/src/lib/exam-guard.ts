import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'

/**
 * Chống gian lận lớp 1: phát hiện rời trang/cửa sổ, thoát toàn màn hình,
 * chặn copy/paste/chuột phải và ghi sự kiện lên server. Đây là phát hiện và
 * ghi nhận, không phải ngăn chặn tuyệt đối; giám thị phân xử dựa trên nhật ký.
 */

export type GuardEventType =
  | 'TAB_HIDDEN'
  | 'WINDOW_BLUR'
  | 'FULLSCREEN_EXIT'
  | 'FULLSCREEN_ENTER'
  | 'COPY'
  | 'PASTE'
  | 'CONTEXT_MENU'
  | 'RECONNECT'

interface GuardEvent {
  /** Để server bỏ bản gửi lại khi trang tải lại giữa lúc đang gửi */
  id: string
  type: GuardEventType
  clientAt: string
  detail?: string
}

const WARN_TEXT: Partial<Record<GuardEventType, string>> = {
  TAB_HIDDEN: 'Bạn vừa rời khỏi trang thi',
  WINDOW_BLUR: 'Bạn vừa chuyển sang cửa sổ khác',
  FULLSCREEN_EXIT: 'Bạn vừa thoát chế độ toàn màn hình',
  COPY: 'Không được sao chép trong lúc thi',
  PASTE: 'Không được dán trong lúc thi',
  CONTEXT_MENU: 'Không dùng chuột phải trong lúc thi',
}

const FLUSH_MS = 5000

/** randomUUID chỉ có trên HTTPS/localhost; demo qua http://IP-LAN thì tự tạo UUID v4 */
function eventId(): string {
  if (window.isSecureContext) return crypto.randomUUID()
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

export function useExamGuard(
  examId: string,
  sessionId: string,
  active: boolean,
  /** Giờ server hiện tại (ms) để đóng dấu sự kiện */
  serverNow: () => number,
) {
  const storageKey = `exam-events:${examId}`
  const [warning, setWarning] = useState<string | null>(null)
  const [violations, setViolations] = useState(0)
  const [fullscreen, setFullscreen] = useState(() => !!document.fullscreenElement)
  const queue = useRef<GuardEvent[]>([])
  const sending = useRef(false)
  // Hộp thoại của chính trang (vd. xác nhận nộp bài) làm mất focus: không tính là vi phạm
  const quietUntil = useRef(0)
  const nowRef = useRef(serverNow)
  useEffect(() => {
    nowRef.current = serverNow
  })

  // Sự kiện chưa gửi được lưu vào localStorage để tải lại trang không mất
  useEffect(() => {
    try {
      // Bản cũ trong localStorage có thể chưa có id: gán thêm để vẫn chống trùng được từ nay
      queue.current = (JSON.parse(localStorage.getItem(storageKey) ?? '[]') as GuardEvent[]).map((e) => ({
        ...e,
        id: e.id ?? eventId(),
      }))
    } catch {
      queue.current = []
    }
  }, [storageKey])

  const persist = useCallback(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(queue.current))
    } catch {
      // bộ nhớ đầy hoặc bị chặn: vẫn giữ trong RAM
    }
  }, [storageKey])

  const flush = useCallback(async () => {
    if (sending.current || queue.current.length === 0) return
    sending.current = true
    try {
      // Gửi tiếp cho tới khi hết, kể cả sự kiện phát sinh trong lúc đang gửi
      while (queue.current.length > 0) {
        const batch = queue.current.slice(0, 50)
        try {
          const res = await api<{ violationCount: number }>(`/exams/${examId}/attempt/events`, {
            method: 'POST',
            body: JSON.stringify({ sessionId, events: batch }),
          })
          setViolations(res.violationCount)
        } catch (e) {
          // Lỗi dữ liệu (không phải mất mạng) thì bỏ lô đó để không kẹt mãi
          if (!(e instanceof ApiError && e.status === 400)) return
        }
        queue.current = queue.current.slice(batch.length)
        persist()
      }
    } finally {
      sending.current = false
    }
  }, [examId, sessionId, persist])

  const record = useCallback(
    (type: GuardEventType, detail?: string) => {
      queue.current.push({ id: eventId(), type, clientAt: new Date(nowRef.current()).toISOString(), detail })
      persist()
      const text = WARN_TEXT[type]
      if (text) setWarning(`${text}. Sự việc đã được ghi lại.`)
      void flush()
    },
    [persist, flush],
  )

  useEffect(() => {
    if (!active) return
    // Tải lại (F5) hay đóng trang cũng làm trang bị ẩn: không phải rời sang tab khác
    let leaving = false
    // Vẫn ghi dấu (không tính vi phạm) để giám thị thấy khoảng rời trang nếu thí sinh mở trang khác trong tab này
    const onPageHide = () => {
      leaving = true
      record('RECONNECT', 'Rời hoặc tải lại trang')
    }
    // Quay lại trang từ bộ nhớ đệm (bfcache): tiếp tục theo dõi
    const onPageShow = () => {
      leaving = false
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && !leaving) record('TAB_HIDDEN')
    }
    // Rời cửa sổ nhưng trang vẫn hiển thị (vd. bấm sang ứng dụng khác). Chờ một chút vì
    // chuyển tab cũng phát blur ngay trước visibilitychange: khi đó chỉ tính TAB_HIDDEN
    let blurTimer: number | undefined
    const onBlur = () => {
      if (Date.now() <= quietUntil.current) return
      clearTimeout(blurTimer)
      blurTimer = window.setTimeout(() => {
        if (document.visibilityState === 'visible' && !document.hasFocus()) record('WINDOW_BLUR')
      }, 300)
    }
    const onFullscreen = () => {
      const on = !!document.fullscreenElement
      setFullscreen(on)
      record(on ? 'FULLSCREEN_ENTER' : 'FULLSCREEN_EXIT')
    }
    const block = (type: GuardEventType) => (e: Event) => {
      e.preventDefault()
      record(type)
    }
    const onCopy = block('COPY')
    const onCut = block('COPY')
    const onPaste = block('PASTE')
    const onContext = block('CONTEXT_MENU')
    const onOnline = () => void flush()

    window.addEventListener('pagehide', onPageHide)
    window.addEventListener('pageshow', onPageShow)
    document.addEventListener('visibilitychange', onVisibility)
    window.addEventListener('blur', onBlur)
    document.addEventListener('fullscreenchange', onFullscreen)
    document.addEventListener('copy', onCopy)
    document.addEventListener('cut', onCut)
    document.addEventListener('paste', onPaste)
    document.addEventListener('contextmenu', onContext)
    window.addEventListener('online', onOnline)
    const timer = setInterval(() => void flush(), FLUSH_MS)
    return () => {
      window.removeEventListener('pagehide', onPageHide)
      window.removeEventListener('pageshow', onPageShow)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('blur', onBlur)
      document.removeEventListener('fullscreenchange', onFullscreen)
      document.removeEventListener('copy', onCopy)
      document.removeEventListener('cut', onCut)
      document.removeEventListener('paste', onPaste)
      document.removeEventListener('contextmenu', onContext)
      window.removeEventListener('online', onOnline)
      clearInterval(timer)
      clearTimeout(blurTimer)
    }
  }, [active, record, flush])

  const enterFullscreen = useCallback(() => {
    void document.documentElement.requestFullscreen?.().catch(() => {})
  }, [])

  const clear = useCallback(() => {
    queue.current = []
    try {
      localStorage.removeItem(storageKey)
    } catch {
      // bỏ qua
    }
  }, [storageKey])

  /** Chạy fn (vd. confirm) mà không ghi sự kiện rời cửa sổ do chính nó gây ra. */
  const quietly = useCallback(<T>(fn: () => T): T => {
    quietUntil.current = Date.now() + 60_000
    try {
      return fn()
    } finally {
      quietUntil.current = Date.now() + 500
    }
  }, [])

  return { quietly, warning, dismissWarning: () => setWarning(null), violations, fullscreen, enterFullscreen, clear }
}
