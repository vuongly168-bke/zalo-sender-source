import { cookies } from 'next/headers'
import type { SupabaseClient } from '@supabase/supabase-js'

export const ACTIVE_WORKSPACE_COOKIE = 'active_workspace_id'

type Workspace = { id: string; name: string; description: string | null; help_url?: string | null }
type Membership = { workspace_id: string; role: string; workspaces: Workspace | Workspace[] | null }

export async function getActiveServerWorkspace(supabase: SupabaseClient, userId: string) {
  const { data } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces(id, name, description, help_url)')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })

  const memberships = (data || []) as unknown as Membership[]
  const selectedId = (await cookies()).get(ACTIVE_WORKSPACE_COOKIE)?.value
  const membership = memberships.find(item => item.workspace_id === selectedId) || memberships[0] || null
  if (!membership) return { currentWorkspace: null, workspaces: [] as Array<Workspace & { role: string }> }

  const workspaces = memberships.flatMap(item => {
    const workspace = Array.isArray(item.workspaces) ? item.workspaces[0] : item.workspaces
    return workspace ? [{ ...workspace, role: item.role }] : []
  })
  const currentBase = Array.isArray(membership.workspaces) ? membership.workspaces[0] : membership.workspaces
  return {
    currentWorkspace: currentBase ? { ...currentBase, role: membership.role } : null,
    workspaces,
  }
}
