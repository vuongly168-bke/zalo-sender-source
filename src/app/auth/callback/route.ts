import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { authRedirectOrigin, safeInternalPath } from '@/lib/auth-redirect'
import { compactAuthReason } from '@/lib/auth-error'

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const origin = authRedirectOrigin(request.url, process.env.APP_SITE_URL)
  const code = searchParams.get('code')
  const next = safeInternalPath(searchParams.get('next'))

  // Google/GoTrue báo lỗi bằng query thay vì gửi code. Giữ lại lý do đó; trước
  // đây nó bị bỏ đi và người dùng chỉ thấy một câu chung chung.
  let reason = compactAuthReason(
    searchParams.get('error_description') ?? searchParams.get('error_code') ?? searchParams.get('error'),
  )

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, `${origin}/`))
    }
    reason = compactAuthReason(error.message)
  } else if (!reason) {
    reason = 'thiếu mã đăng nhập (code)'
  }

  console.error('[auth/callback] login failed:', reason)
  const target = new URL('/login', `${origin}/`)
  target.searchParams.set('error', 'auth_failed')
  if (reason) target.searchParams.set('reason', reason)
  return NextResponse.redirect(target)
}
