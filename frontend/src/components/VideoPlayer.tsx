import { useEffect, useRef } from 'react'
import { youtubeId } from '../lib/courses'

const SAVE_EVERY_SEC = 10
// Xem tới 90% thời lượng thì coi như đã xem xong
const COMPLETE_RATIO = 0.9

interface Props {
  url: string
  title: string
  /** Vị trí (giây) để mở lại đúng chỗ đã xem */
  startAt?: number
  /** Gọi định kỳ khi đang xem, khi tạm dừng và khi rời trang */
  onProgress?: (positionSec: number) => void
  /** Gọi một lần khi xem gần hết hoặc hết video */
  onWatched?: () => void
}

export function VideoPlayer({ url, title, startAt = 0, onProgress, onWatched }: Props) {
  const id = youtubeId(url)
  const videoRef = useRef<HTMLVideoElement>(null)
  // Giữ callback mới nhất trong ref để effect không phải gắn lại sự kiện
  const callbacks = useRef({ onProgress, onWatched })
  useEffect(() => {
    callbacks.current = { onProgress, onWatched }
  })

  useEffect(() => {
    const video = videoRef.current
    if (!video) return
    let lastSaved = 0
    let watched = false
    const save = () => {
      lastSaved = video.currentTime
      callbacks.current.onProgress?.(Math.floor(video.currentTime))
    }
    const markWatched = () => {
      if (watched) return
      watched = true
      callbacks.current.onWatched?.()
    }

    const onLoaded = () => {
      // Không tua tới sát cuối, tránh mở ra là hết video
      if (startAt > 0 && startAt < video.duration - 5) video.currentTime = startAt
    }
    const onTime = () => {
      if (Math.abs(video.currentTime - lastSaved) >= SAVE_EVERY_SEC) save()
      if (video.duration && video.currentTime / video.duration >= COMPLETE_RATIO) markWatched()
    }
    const onEnded = () => {
      save()
      markWatched()
    }

    video.addEventListener('loadedmetadata', onLoaded)
    video.addEventListener('timeupdate', onTime)
    video.addEventListener('pause', save)
    video.addEventListener('ended', onEnded)
    return () => {
      video.removeEventListener('loadedmetadata', onLoaded)
      video.removeEventListener('timeupdate', onTime)
      video.removeEventListener('pause', save)
      video.removeEventListener('ended', onEnded)
      if (video.currentTime > 0) save()
    }
  }, [url, startAt])

  return (
    <div className="video">
      {id ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}${startAt > 0 ? `?start=${startAt}` : ''}`}
          title={title}
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <video ref={videoRef} src={url} controls preload="metadata" />
      )}
    </div>
  )
}
