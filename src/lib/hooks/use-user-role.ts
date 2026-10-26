'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export type UserRole = 'super_admin' | 'owner' | 'admin' | 'member' | null

export interface UserRoleInfo {
  role: UserRole
  isSuperAdmin: boolean
  isOwner: boolean
  isAdmin: boolean       // owner OR admin
  isMember: boolean
  canManageWorkspace: boolean   // owner | super_admin
  canManageProjects: boolean    // admin | owner | super_admin
  canDeleteWorkspace: boolean   // owner | super_admin
  loading: boolean
}

export function useUserRole(workspaceId?: string): UserRoleInfo {
  const [state, setState] = useState<UserRoleInfo>({
    role: null,
    isSuperAdmin: false,
    isOwner: false,
    isAdmin: false,
    isMember: false,
    canManageWorkspace: false,
    canManageProjects: false,
    canDeleteWorkspace: false,
    loading: true,
  })

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        if (!cancelled) setState((s) => ({ ...s, loading: false }))
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('id', user.id)
        .single()

      const isSuperAdmin = !!profile?.is_super_admin

      let role: UserRole = null
      if (workspaceId) {
        const { data: m } = await supabase
          .from('workspace_members')
          .select('role')
          .eq('workspace_id', workspaceId)
          .eq('user_id', user.id)
          .single()
        role = (m?.role as UserRole) || null
      }

      const effectiveRole: UserRole = isSuperAdmin ? 'super_admin' : role
      const isOwner = effectiveRole === 'owner'
      const isAdmin = isOwner || effectiveRole === 'admin'
      const isMember = !!effectiveRole

      if (!cancelled) {
        setState({
          role: effectiveRole,
          isSuperAdmin,
          isOwner,
          isAdmin,
          isMember,
          canManageWorkspace: isOwner || isSuperAdmin,
          canManageProjects: isAdmin || isSuperAdmin,
          canDeleteWorkspace: isOwner || isSuperAdmin,
          loading: false,
        })
      }
    }
    load()
    return () => { cancelled = true }
  }, [workspaceId])

  return state
}
