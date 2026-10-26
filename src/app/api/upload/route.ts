import { randomUUID } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateImageUpload } from '@/lib/image-upload-validation'
import { optimizeImageForZalo } from '@/lib/image-optimization'
import { StorageError, storeCampaignImage } from '@/lib/image-storage'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Workspace access required' }, { status: 403 })

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu tải lên không hợp lệ' }, { status: 400 })
  }
  const file = formData.get('file')
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Thiếu tệp ảnh' }, { status: 400 })
  }

  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const validation = validateImageUpload({ name: file.name, type: file.type, size: file.size, bytes: header })
  if (!validation.ok) return NextResponse.json({ error: validation.error }, { status: 400 })

  const original = Buffer.from(await file.arrayBuffer())
  let optimized: Awaited<ReturnType<typeof optimizeImageForZalo>>
  try {
    optimized = await optimizeImageForZalo(original, {
      contentType: file.type,
      extension: validation.extension,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error'
    console.error('Image optimisation failed', message)
    if (message === 'Ảnh GIF động quá lớn để tối ưu an toàn'
      || message === 'Không thể nén ảnh xuống mức dung lượng an toàn') {
      return NextResponse.json({ error: message }, { status: 422 })
    }
    return NextResponse.json({ error: 'Không thể đọc hoặc nén ảnh này' }, { status: 422 })
  }

  const now = new Date()
  // Không nhét user.id vào đường dẫn: URL này được gửi thẳng cho người nhận Zalo.
  const key = [
    'uploads',
    String(now.getUTCFullYear()),
    String(now.getUTCMonth() + 1).padStart(2, '0'),
    `${randomUUID()}.${optimized.extension}`,
  ].join('/')

  try {
    const stored = await storeCampaignImage({
      key,
      body: optimized.body,
      contentType: optimized.contentType,
      metadata: {
        uploader: user.id,
        optimized: String(optimized.optimized),
        original_bytes: String(original.length),
      },
    })

    return NextResponse.json({
      url: stored.url,
      optimized: optimized.optimized,
      originalBytes: original.length,
      storedBytes: optimized.body.length,
    })
  } catch (error) {
    // Không dùng 502/504: Cloudflare thay body của hai mã đó bằng trang HTML của
    // nó, trình duyệt nhận "<!DOCTYPE" và lý do thật bị nuốt mất.
    const detail = (error as Error).message
    const hint = error instanceof StorageError && error.network
      ? 'Máy chủ tạm thời không kết nối được tới kho ảnh R2. Vui lòng thử lại sau ít phút.'
      : 'Báo quản trị viên kiểm tra cấu hình R2 trên Cloudflare.'
    return NextResponse.json(
      { error: `Không lưu được ảnh (${detail}). ${hint}` },
      { status: 500 },
    )
  }
}
