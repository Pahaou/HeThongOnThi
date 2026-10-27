import { youtubeId } from '../lib/courses'

export function VideoPlayer({ url, title }: { url: string; title: string }) {
  const id = youtubeId(url)
  return (
    <div className="video">
      {id ? (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${id}`}
          title={title}
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <video src={url} controls preload="metadata" />
      )}
    </div>
  )
}
