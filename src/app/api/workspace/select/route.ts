import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { ACTIVE_WORKSPACE_COOKIE } from '@/lib/workspace-context-server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let workspaceId = ''
  try {
    const body = await request.json()
    workspaceId = typeof body.workspaceId === 'string' ? body.workspaceId : ''
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }
  if (!workspaceId) return NextResponse.json({ error: 'Thiếu workspaceId' }, { status: 400 })

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!membership) return NextResponse.json({ error: 'Bạn không thuộc workspace này' }, { status: 403 })

  const response = NextResponse.json({ ok: true })
  response.cookies.set(ACTIVE_WORKSPACE_COOKIE, workspaceId, {
    httpOnly: false,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  })
  return response
}
