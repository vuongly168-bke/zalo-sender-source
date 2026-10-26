'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Building2, Save, Trash2, Crown, Shield, User,
  UserMinus, Loader2, Mail, Users,
} from 'lucide-react'
import Link from 'next/link'

interface Member {
  member_id: string
  user_id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  role: string
  joined_at: string
}

interface WorkspaceDetail {
  id: string
  name: string
  description: string | null
  help_url: string | null
  created_at: string
}

const ROLE_INFO: Record<string, { label: string; icon: typeof Crown; color: string }> = {
  owner: { label: 'Owner', icon: Crown, color: 'text-purple-700 bg-purple-100' },
  admin: { label: 'Admin', icon: Shield, color: 'text-blue-700 bg-blue-100' },
  member: { label: 'Member', icon: User, color: 'text-gray-700 bg-gray-100' },
}

export default function AdminWorkspaceDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = createClient()
  const workspaceId = params.id as string

  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [workspace, setWorkspace] = useState<WorkspaceDetail | null>(null)
  const [members, setMembers] = useState<Member[]>([])

  // Edit form
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editHelpUrl, setEditHelpUrl] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

  // Stats
  const [stats, setStats] = useState({ projects: 0, contacts: 0, campaigns: 0 })

  const loadAll = useCallback(async () => {
    const { data: ws } = await supabase
      .from('workspaces')
      .select('id, name, description, help_url, created_at')
      .eq('id', workspaceId)
      .single()
    if (ws) {
      setWorkspace(ws)
      setEditName(ws.name)
      setEditDesc(ws.description || '')
      setEditHelpUrl(ws.help_url || '')
    }

    const { data: ms } = await supabase.rpc('get_workspace_members', { p_workspace_id: workspaceId })
    setMembers(ms || [])

    const [{ count: pCount }, { count: cCount }] = await Promise.all([
      supabase.from('projects').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
      supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId),
    ])
    setStats({ projects: pCount || 0, contacts: cCount || 0, campaigns: 0 })
  }, [supabase, workspaceId])

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      const { data: profile } = await supabase
        .from('profiles')
        .select('is_super_admin')
        .eq('id', user.id)
        .single()
      if (!profile?.is_super_admin) {
        router.push('/dashboard')
        return
      }
      setAuthorized(true)
      await loadAll()
      setLoading(false)
    }
    check()
  }, [supabase, router, loadAll])

  async function handleSave() {
    setSaving(true)
    setSaveMsg('')
    const { error } = await supabase.rpc('update_workspace_info', {
      p_workspace_id: workspaceId,
      p_name: editName,
      p_description: editDesc || null,
      p_help_url: editHelpUrl.trim() || null,
    })
    if (error) setSaveMsg('❌ ' + error.message)
    else {
      setSaveMsg('✅ Đã lưu')
      await loadAll()
      setTimeout(() => setSaveMsg(''), 2000)
    }
    setSaving(false)
  }

  async function handleDeleteWorkspace() {
    if (!workspace) return
    const confirmText = workspace.name
    const input = prompt(`⚠️ Xóa workspace "${workspace.name}" sẽ XÓA VĨNH VIỄN tất cả projects, campaigns, contacts. Gõ tên workspace để xác nhận:`)
    if (input !== confirmText) {
      if (input !== null) alert('Tên không khớp. Hủy.')
      return
    }
    const { error } = await supabase.rpc('delete_workspace', { p_workspace_id: workspaceId })
    if (error) {
      alert('Lỗi: ' + error.message)
      return
    }
    router.push('/dashboard/admin')
  }

  async function handleChangeRole(targetUserId: string, newRole: string) {
    const { error } = await supabase.rpc('change_member_role', {
      p_workspace_id: workspaceId,
      p_target_user_id: targetUserId,
      p_new_role: newRole,
    })
    if (error) { alert('Lỗi: ' + error.message); return }
    await loadAll()
  }

  async function handleRemoveMember(targetUserId: string, targetName: string) {
    if (!confirm(`Xóa ${targetName} khỏi workspace?`)) return
    const { error } = await supabase.rpc('remove_workspace_member', {
      p_workspace_id: workspaceId,
      p_target_user_id: targetUserId,
    })
    if (error) { alert('Lỗi: ' + error.message); return }
    await loadAll()
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-gray-500"><Loader2 className="animate-spin" /></div>
  if (!authorized || !workspace) return null

  return (
    <div className="max-w-4xl">
      <Link
        href="/dashboard/admin"
        className="inline-flex items-center gap-2 text-sm text-gray-600 hover:text-gray-900 mb-4"
      >
        <ArrowLeft size={16} />
        Quay lại Super Admin
      </Link>

      <div className="flex items-start gap-3 mb-1">
        <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center flex-shrink-0">
          <Building2 className="text-purple-600" size={24} />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{workspace.name}</h1>
          <p className="text-gray-500 text-sm">
            Tạo ngày {new Date(workspace.created_at).toLocaleDateString('vi-VN')}
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mt-6">
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{members.length}</p>
          <p className="text-sm text-gray-500">Thành viên</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{stats.projects}</p>
          <p className="text-sm text-gray-500">Dự án</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-2xl font-bold text-gray-900">{stats.contacts}</p>
          <p className="text-sm text-gray-500">Khách hàng</p>
        </div>
      </div>

      {/* Edit info */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="font-semibold text-gray-900">Thông tin workspace</h2>
        <div className="mt-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1.5">Tên workspace</label>
            <input
              type="text"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1.5">Mô tả</label>
            <textarea
              value={editDesc}
              onChange={(e) => setEditDesc(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900 resize-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1.5">
              📚 Link tài liệu hướng dẫn (Notion / Google Docs / ...)
            </label>
            <input
              type="url"
              value={editHelpUrl}
              onChange={(e) => setEditHelpUrl(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
              placeholder="https://www.notion.so/... hoặc https://docs.google.com/..."
            />
            <p className="text-xs text-gray-500 mt-1">
              Link này sẽ hiện ở sidebar cho mọi member của workspace. Member click vào sẽ mở tab mới.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving || !editName.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              {saving ? 'Đang lưu...' : 'Lưu'}
            </button>
            {saveMsg && <span className="text-sm text-gray-600">{saveMsg}</span>}
          </div>
        </div>
      </div>

      {/* Members */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center gap-2">
          <Users size={18} />
          <h2 className="font-semibold text-gray-900">Thành viên ({members.length})</h2>
        </div>
        <div className="divide-y divide-gray-100">
          {members.map((m) => {
            const info = ROLE_INFO[m.role] || ROLE_INFO.member
            const Icon = info.icon
            const isLastOwner = m.role === 'owner' && members.filter(x => x.role === 'owner').length === 1

            return (
              <div key={m.member_id} className="flex items-center gap-4 p-4">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-semibold flex-shrink-0">
                  {(m.full_name || m.email)[0]?.toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-gray-900 truncate">{m.full_name || m.email}</p>
                  <p className="text-sm text-gray-500 truncate flex items-center gap-1.5">
                    <Mail size={12} />{m.email}
                  </p>
                </div>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${info.color}`}>
                  <Icon size={12} />
                  {info.label}
                </div>
                <select
                  value={m.role}
                  onChange={(e) => handleChangeRole(m.user_id, e.target.value)}
                  disabled={isLastOwner}
                  className="text-sm px-2.5 py-1.5 border border-gray-300 rounded-lg disabled:opacity-50"
                  title={isLastOwner ? 'Owner cuối cùng không thể đổi role' : ''}
                >
                  <option value="member">Member</option>
                  <option value="admin">Admin</option>
                  <option value="owner">Owner</option>
                </select>
                <button
                  onClick={() => handleRemoveMember(m.user_id, m.full_name || m.email)}
                  disabled={isLastOwner}
                  className="text-gray-400 hover:text-red-500 transition p-2 disabled:opacity-30"
                  title={isLastOwner ? 'Owner cuối cùng không thể bị kick' : 'Kick'}
                >
                  <UserMinus size={16} />
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Danger zone */}
      <div className="mt-6 bg-red-50 border border-red-200 rounded-xl p-6">
        <h2 className="font-semibold text-red-900 flex items-center gap-2">
          <Trash2 size={18} />
          Vùng nguy hiểm
        </h2>
        <p className="text-sm text-red-700 mt-1">
          Xóa workspace sẽ xóa vĩnh viễn tất cả projects, campaigns, contacts, Zalo accounts. Không thể khôi phục.
        </p>
        <button
          onClick={handleDeleteWorkspace}
          className="mt-4 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 transition flex items-center gap-2"
        >
          <Trash2 size={14} />
          Xóa workspace này
        </button>
      </div>
    </div>
  )
}
