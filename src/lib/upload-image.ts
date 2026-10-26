const UPLOAD_TIMEOUT_MS = 60_000

/**
 * Đọc body an toàn: proxy phía trước (Cloudflare, nginx) có thể trả trang lỗi
 * HTML thay cho JSON của ứng dụng. Khi đó báo mã HTTP thay vì để lộ lỗi
 * "Unexpected token '<'" khó hiểu.
 */
async function readUploadResponse(response: Response): Promise<{ url?: string; error?: string }> {
  const text = await response.text()
  try {
    return JSON.parse(text) as { url?: string; error?: string }
  } catch {
    return {
      error: `Máy chủ trả về lỗi HTTP ${response.status} (không phải JSON). Thử lại sau ít phút; nếu vẫn lỗi hãy báo quản trị viên.`,
    }
  }
}

export async function uploadImageToR2(file: File): Promise<{ url: string }> {
  const form = new FormData()
  form.append('file', file)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
  try {
    const response = await fetch('/api/upload', {
      method: 'POST',
      body: form,
      signal: controller.signal,
    })
    const data = await readUploadResponse(response)
    if (!response.ok || !data.url) {
      throw new Error(data.error || `R2 lỗi (HTTP ${response.status})`)
    }
    return { url: data.url }
  } catch (error) {
    if ((error as Error).name === 'AbortError') {
      throw new Error('Upload quá lâu (>60s). Ảnh có thể quá nặng hoặc mạng chậm.')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}
