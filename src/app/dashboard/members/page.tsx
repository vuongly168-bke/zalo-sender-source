'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { getActiveClientWorkspace } from '@/lib/workspace-context-client'
import { Users, Crown, Shield, User, UserMinus, Loader2, Mail } from 'lucide-react'

interface Member {
  member_id: string
  user_id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string
  joined_at: string
}

const ROLE_INFO: Record<string, { label: string; icon: typeof Crown; color: string }> = {
  owner: { label: 'Owner', icon: Crown, color: 'text-purple-700 bg-purple-100' },
  admin: { label: 'Admin', icon: Shield, color: 'text-blue-700 bg-blue-100' },
  member: { label: 'Member', icon: User, color: 'text-gray-700 bg-gray-100' },
}

export default function MembersPage() {
  const supabase = createClient()
  const [workspaceId, setWorkspaceId] = useState('')
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUserId, setCurrentUserId] = useState('')
  const role = useUserRole(workspaceId)

  const loadMembers = useCallback(async (wsId: string) => {
    const { data, error } = await supabase.rpc('get_workspace_members', { p_workspace_id: wsId })
    if (error) {
      console.error(error)
      setMembers([])
    } else {
      setMembers(data || [])
    }
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setCurrentUserId(user.id)

      const m = await getActiveClientWorkspace(supabase, user.id)
      if (m) {
        setWorkspaceId(m.workspace_id)
        await loadMembers(m.workspace_id)
      }
      setLoading(false)
    }
    init()
  }, [supabase, loadMembers])

  async function handleChangeRole(targetUserId: string, newRole: string) {
    const { error } = await supabase.rpc('change_member_role', {
      p_workspace_id: workspaceId,
      p_target_user_id: targetUserId,
      p_new_role: newRole,
    })
    if (error) {
      alert('Lỗi: ' + error.message)
      return
    }
    await loadMembers(workspaceId)
  }

  async function handleRemove(targetUserId: string, targetName: string) {
    if (!confirm(`Xóa ${targetName} khỏi workspace?`)) return
    const { error } = await supabase.rpc('remove_workspace_member', {
      p_workspace_id: workspaceId,
      p_target_user_id: targetUserId,
    })
    if (error) {
      alert('Lỗi: ' + error.message)
      return
    }
    await loadMembers(workspaceId)
  }

  const canManage = role.isOwner || role.isSuperAdmin

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-gray-500"><Loader2 className="animate-spin" /></div>

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Users className="text-blue-600" size={28} />
        <h1 className="text-2xl font-bold text-gray-900">Quản lý thành viên</h1>
      </div>
      <p className="text-gray-500">Quản lý role và quyền của các thành viên trong workspace</p>

      {!canManage && (
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-800">
          <p>📋 Bạn chỉ có quyền <strong>xem</strong> danh sách. Chỉ <strong>Owner</strong> mới được đổi role hoặc kick member.</p>
        </div>
      )}

      <div className="mt-6 bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <p className="font-medium text-gray-900">Tổng cộng: {members.length} thành viên</p>
        </div>

        <div className="divide-y divide-gray-100">
          {members.map((m) => {
            const info = ROLE_INFO[m.role] || ROLE_INFO.member
            const Icon = info.icon
            const isMe = m.user_id === currentUserId
            const isLastOwner = m.role === 'owner' && members.filter(x => x.role === 'owner').length === 1

            return (
              <div key={m.member_id} className="flex items-center gap-4 p-4">
                <div className="w-11 h-11 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-semibold flex-shrink-0">
                  {(m.full_name || m.email)[0]?.toUpperCase()}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-900 truncate">
                      {m.full_name || m.email}
                    </p>
                    {isMe && <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">Bạn</span>}
                  </div>
                  <p className="text-sm text-gray-500 truncate flex items-center gap-1.5">
                    <Mail size={12} />{m.email}
                  </p>
                </div>

                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${info.color}`}>
                  <Icon size={12} />
                  {info.label}
                </div>

                {canManage && !isMe && (
                  <div className="flex items-center gap-2">
                    <select
                      value={m.role}
                      onChange={(e) => handleChangeRole(m.user_id, e.target.value)}
                      disabled={isLastOwner}
                      className="text-sm px-2.5 py-1.5 border border-gray-300 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                      title={isLastOwner ? 'Owner cuối cùng không thể đổi role' : ''}
                    >
                      <option value="member">Member</option>
                      <option value="admin">Admin</option>
                      <option value="owner">Owner</option>
                    </select>
                    <button
                      onClick={() => handleRemove(m.user_id, m.full_name || m.email)}
                      disabled={isLastOwner}
                      className="text-gray-400 hover:text-red-500 transition p-2 disabled:opacity-30 disabled:hover:text-gray-400"
                      title={isLastOwner ? 'Owner cuối cùng không thể bị kick' : 'Kick member'}
                    >
                      <UserMinus size={16} />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {canManage && (
        <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
          <p className="font-medium mb-1">💡 Cách thêm thành viên mới:</p>
          <p>Vì hệ thống dùng <strong>invite-only</strong>, người được mời cần đăng nhập Google ít nhất 1 lần trước. Sau đó, <strong>Super Admin</strong> sẽ gán họ vào workspace của bạn ở trang <strong>Super Admin</strong>.</p>
        </div>
      )}
    </div>
  )
}
