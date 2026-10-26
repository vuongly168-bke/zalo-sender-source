import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  const isAuthPage = path === '/login' || path === '/register'
  const isProtected = path.startsWith('/dashboard') || path === '/setup-workspace'

  // Chưa đăng nhập + truy cập trang protected → /login
  if (!user && isProtected) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // Đã đăng nhập + ở /login hoặc / → kiểm tra workspace
  if (user && (isAuthPage || path === '/')) {
    const { data: members } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)

    const url = request.nextUrl.clone()
    url.pathname = (members && members.length > 0) ? '/dashboard' : '/setup-workspace'
    return NextResponse.redirect(url)
  }

  // Đã login + ở dashboard nhưng chưa có workspace → setup
  if (user && path.startsWith('/dashboard')) {
    const { data: members } = await supabase
      .from('workspace_members')
      .select('workspace_id')
      .eq('user_id', user.id)
      .limit(1)

    if (!members || members.length === 0) {
      const url = request.nextUrl.clone()
      url.pathname = '/setup-workspace'
      return NextResponse.redirect(url)
    }
  }

  return supabaseResponse
}
