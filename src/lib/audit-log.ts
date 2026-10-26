import type { SupabaseClient } from '@supabase/supabase-js'

export async function logAction(
  supabase: SupabaseClient,
  workspaceId: string | null,
  action: string,
  options?: {
    resourceType?: string
    resourceId?: string
    resourceName?: string
    metadata?: Record<string, unknown>
  }
) {
  try {
    const { error } = await supabase.rpc('log_action', {
      p_workspace_id: workspaceId,
      p_action: action,
      p_resource_type: options?.resourceType || null,
      p_resource_id: options?.resourceId || null,
      p_resource_name: options?.resourceName || null,
      p_metadata: (options?.metadata || {}) as object,
    })
    if (error) console.warn('logAction failed:', error.message)
  } catch (err) {
    // Không block flow chính nếu log fail
    console.warn('logAction failed:', err)
  }
}
