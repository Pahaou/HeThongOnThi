import { useEffect, useState } from 'react'
import './App.css'

type Health = { status: string; time: string }

function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/health')
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then(setHealth)
      .catch((e: Error) => setError(e.message))
  }, [])

  return (
    <main>
      <h1>HTON – Học tập và ôn thi trực tuyến</h1>
      {health && <p>Backend: {health.status} ({health.time})</p>}
      {error && <p>Không kết nối được backend: {error}</p>}
      {!health && !error && <p>Đang kiểm tra backend...</p>}
    </main>
  )
}

export default App
