import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { assertAllowedZaloApiUrl } from '@/lib/zalo-api'

const KEY_TYPES = new Set([
  'group_send_images',
  'group_send_message',
  'get_group_info',
  'user_send_message',
  'user_send_images',
  'get_user_info',
])

async function authorizeManager(accountId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'Unauthorized', status: 401 } as const

  const { data: account } = await supabase
    .from('zalo_accounts')
    .select('id, workspace_id')
    .eq('id', accountId)
    .maybeSingle()
  if (!account) return { error: 'Không tìm thấy tài khoản Zalo', status: 404 } as const

  const [{ data: profile }, { data: membership }] = await Promise.all([
    supabase.from('profiles').select('is_super_admin').eq('id', user.id).maybeSingle(),
    supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', account.workspace_id)
      .eq('user_id', user.id)
      .maybeSingle(),
  ])
  if (!profile?.is_super_admin && !['owner', 'admin'].includes(membership?.role ?? '')) {
    return { error: 'Chỉ quản trị viên được xem hoặc thay API key', status: 403 } as const
  }
  return { account } as const
}

export async function GET(request: NextRequest) {
  const accountId = request.nextUrl.searchParams.get('accountId') ?? ''
  if (!accountId) return NextResponse.json({ error: 'Thiếu accountId' }, { status: 400 })

  const auth = await authorizeManager(accountId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  const admin = createAdminClient()
  const [{ data: keys, error }, { data: accountTokenKeys }] = await Promise.all([
    admin.from('api_keys').select('id, key_type, api_url').eq('zalo_account_id', accountId),
    admin
      .from('api_keys')
      .select('key_type')
      .eq('zalo_account_id', accountId)
      .not('account_token', 'is', null),
  ])
  if (error) return NextResponse.json({ error: 'Không thể tải cấu hình API' }, { status: 500 })

  const withAccountToken = new Set((accountTokenKeys ?? []).map((key) => key.key_type))
  return NextResponse.json({
    keys: (keys ?? []).map((key) => ({
      keyType: key.key_type,
      apiUrl: key.api_url,
      hasBearerToken: true,
      hasAccountToken: withAccountToken.has(key.key_type),
    })),
  })
}

export async function POST(request: NextRequest) {
  let body: {
    accountId?: string
    keys?: Array<{ keyType?: string; apiUrl?: string; bearerToken?: string; accountToken?: string }>
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }

  const accountId = body.accountId ?? ''
  const updates = body.keys ?? []
  if (!accountId || !Array.isArray(updates) || updates.length === 0) {
    return NextResponse.json({ error: 'Không có API key cần lưu' }, { status: 400 })
  }

  const auth = await authorizeManager(accountId)
  if ('error' in auth) return NextResponse.json({ error: auth.error }, { status: auth.status })

  let rows: Array<Record<string, string | null>>
  try {
    const admin = createAdminClient()
    const { data: existingKeys } = await admin
      .from('api_keys')
      .select('key_type, api_url, bearer_token, account_token')
      .eq('zalo_account_id', accountId)
    const existingByType = new Map(
      (existingKeys ?? []).map((key) => [key.key_type, key]),
    )
    rows = updates.map((key) => {
      const keyType = key.keyType ?? ''
      const existing = existingByType.get(keyType)
      const bearerToken = key.bearerToken?.trim() || existing?.bearer_token || ''
      if (!KEY_TYPES.has(keyType) || !bearerToken) throw new Error('API key không hợp lệ')
      const row: Record<string, string | null> = {
        zalo_account_id: accountId,
        key_type: keyType,
        api_url: assertAllowedZaloApiUrl(key.apiUrl ?? existing?.api_url ?? ''),
        bearer_token: bearerToken,
      }
      row.account_token = key.accountToken?.trim()
        || existing?.account_token
        || null
      return row
    })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }

  const admin = createAdminClient()
  const { error } = await admin.from('api_keys').upsert(rows, {
    onConflict: 'zalo_account_id,key_type',
  })
  if (error) return NextResponse.json({ error: 'Không thể lưu API key' }, { status: 500 })
  return NextResponse.json({ ok: true, updated: rows.length })
}
