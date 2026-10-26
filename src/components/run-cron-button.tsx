'use client'

import { useState } from 'react'
import { Play } from 'lucide-react'
import { useRouter } from 'next/navigation'

export function RunCronButton() {
  const [running, setRunning] = useState(false)
  const router = useRouter()

  async function handleRun() {
    setRunning(true)
    try {
      const res = await fetch('/api/cron/manual', { method: 'POST' })
      const data = await res.json()
      if (data.error) {
        alert('Lỗi: ' + data.error)
      } else {
        alert(data.message + (data.count > 0 ? `\n\nChi tiết:\n${JSON.stringify(data.results, null, 2)}` : ''))
        router.refresh()
      }
    } catch {
      alert('Không thể kết nối server')
    }
    setRunning(false)
  }

  return (
    <button
      onClick={handleRun}
      disabled={running}
      className="flex items-center gap-2 bg-orange-100 text-orange-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-orange-200 transition disabled:opacity-50"
      title="Chạy thủ công - thường được tự động chạy mỗi phút khi deploy"
    >
      <Play size={16} />
      {running ? 'Đang chạy...' : 'Chạy cron thủ công'}
    </button>
  )
}
