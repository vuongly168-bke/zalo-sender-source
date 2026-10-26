'use client'

import { useState, useEffect, useCallback } from 'react'
import { X, Download, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

/**
 * Grid thumbnail + lightbox xem ảnh full + tải về.
 * Dùng cho mọi chỗ hiển thị ảnh campaign (group + personal).
 */

// URL Cloudinary cũ cần bỏ transform để lấy ảnh gốc; URL R2 được giữ nguyên.
function toOriginalUrl(url: string): string {
  return url.replace(/\/image\/upload\/[^/]*\//, '/image/upload/')
}

// URL Cloudinary cũ dùng fl_attachment; URL R2 tải qua blob ở phía dưới.
function toDownloadUrl(url: string): string {
  const original = toOriginalUrl(url)
  return original.replace('/image/upload/', '/image/upload/fl_attachment/')
}

interface Props {
  urls: string[]
  // class cho mỗi thumbnail (mặc định ô vuông)
  thumbClassName?: string
  gridClassName?: string
}

export function ImageGallery({ urls, thumbClassName, gridClassName }: Props) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null)
  const [imgLoading, setImgLoading] = useState(false)
  const [downloading, setDownloading] = useState(false)

  const close = useCallback(() => setActiveIndex(null), [])
  const next = useCallback(() => {
    setActiveIndex((i) => (i === null ? null : (i + 1) % urls.length))
    setImgLoading(true)
  }, [urls.length])
  const prev = useCallback(() => {
    setActiveIndex((i) => (i === null ? null : (i - 1 + urls.length) % urls.length))
    setImgLoading(true)
  }, [urls.length])

  // Keyboard navigation
  useEffect(() => {
    if (activeIndex === null) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
      else if (e.key === 'ArrowRight') next()
      else if (e.key === 'ArrowLeft') prev()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [activeIndex, close, next, prev])

  async function handleDownload(url: string, idx: number) {
    setDownloading(true)
    try {
      // Tải qua blob để đảm bảo download trên mọi trình duyệt (kể cả mobile)
      const res = await fetch(toDownloadUrl(url))
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = blobUrl
      // Lấy tên file từ URL hoặc đặt mặc định
      const ext = (blob.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
      a.download = `zalo-sender-anh-${idx + 1}.${ext}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(blobUrl)
    } catch {
      // Fallback: mở tab mới với fl_attachment
      window.open(toDownloadUrl(url), '_blank')
    }
    setDownloading(false)
  }

  if (urls.length === 0) return null

  return (
    <>
      {/* Grid thumbnails */}
      <div className={gridClassName || 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3'}>
        {urls.map((u, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { setActiveIndex(i); setImgLoading(true) }}
            className="relative group rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-blue-400 transition focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={u}
              alt={`Ảnh ${i + 1}`}
              className={thumbClassName || 'aspect-square w-full object-cover'}
            />
            {/* Overlay hint khi hover */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition text-white text-xs font-medium bg-black/50 px-2 py-1 rounded">
                Xem ảnh
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* Lightbox */}
      {activeIndex !== null && (
        <div
          className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center"
          onClick={close}
        >
          {/* Top bar */}
          <div
            className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 z-10"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="text-white text-sm font-medium">
              Ảnh {activeIndex + 1} / {urls.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleDownload(urls[activeIndex], activeIndex)}
                disabled={downloading}
                className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white px-3 py-2 rounded-lg text-sm font-medium transition disabled:opacity-50"
              >
                {downloading ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                Tải về
              </button>
              <button
                onClick={close}
                className="bg-white/15 hover:bg-white/25 text-white p-2 rounded-lg transition"
                aria-label="Đóng"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Prev / Next (chỉ khi nhiều ảnh) */}
          {urls.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prev() }}
                className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 bg-white/15 hover:bg-white/25 text-white p-2 sm:p-3 rounded-full transition z-10"
                aria-label="Ảnh trước"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); next() }}
                className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 bg-white/15 hover:bg-white/25 text-white p-2 sm:p-3 rounded-full transition z-10"
                aria-label="Ảnh tiếp"
              >
                <ChevronRight size={24} />
              </button>
            </>
          )}

          {/* Ảnh full */}
          <div
            className="relative max-w-[95vw] max-h-[85vh] flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {imgLoading && (
              <Loader2 className="absolute animate-spin text-white" size={40} />
            )}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={toOriginalUrl(urls[activeIndex])}
              alt={`Ảnh ${activeIndex + 1}`}
              className="max-w-[95vw] max-h-[85vh] object-contain rounded"
              onLoad={() => setImgLoading(false)}
              onError={() => setImgLoading(false)}
            />
          </div>
        </div>
      )}
    </>
  )
}
