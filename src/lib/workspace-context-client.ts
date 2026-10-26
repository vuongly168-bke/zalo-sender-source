import type { SupabaseClient } from '@supabase/supabase-js'

export const ACTIVE_WORKSPACE_COOKIE = 'active_workspace_id'

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null
  const prefix = `${name}=`
  const cookie = document.cookie.split('; ').find(item => item.startsWith(prefix))
  return cookie ? decodeURIComponent(cookie.substring(prefix.length)) : null
}

/** Lấy membership đang được chọn. Fallback workspace đầu tiên nếu cookie cũ/không hợp lệ. */
export async function getActiveClientWorkspace(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ workspace_id: string; role: string } | null> {
  const preferredId = getCookie(ACTIVE_WORKSPACE_COOKIE)

  if (preferredId) {
    const { data } = await supabase
      .from('workspace_members')
      .select('workspace_id, role')
      .eq('user_id', userId)
      .eq('workspace_id', preferredId)
      .maybeSingle()
    if (data) return data
  }

  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id, role')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  return data || null
}
