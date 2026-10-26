'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Shield, Users, Building2, Ban, Check, Plus, UserPlus, Loader2, ChevronRight, Settings, BookOpen, Save, BarChart3, Send, Phone, MessageSquare, TrendingUp, Sparkles, FolderOpen, Activity, Search, Clock3 } from 'lucide-react'
import Link from 'next/link'

interface PendingUser {
  user_id: string
  email: string
  full_name: string | null
  avatar_url: string | null
  created_at: string
}

interface AdminWorkspace {
  id: string
  name: string
  description: string | null
  created_at: string
  member_count: number
  owner_email: string | null
}

interface AdminUser {
  user_id: string
  email: string
  full_name: string | null
  is_banned: boolean
  created_at: string
  workspace_count: number
  workspace_names: string
}

interface WorkspaceHealth {
  workspace_id: string
  workspace_name: string
  created_at: string
  member_count: number
  project_count: number
  contact_count: number
  last_activity: string
  inactive_days: number
  health_status: 'active' | 'quiet' | 'inactive'
}

type AssignableUser = Pick<PendingUser, 'user_id' | 'email' | 'full_name'>

export default function SuperAdminPage() {
  const router = useRouter()
  const supabase = createClient()
  const [authorized, setAuthorized] = useState(false)
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'overview' | 'pending' | 'users' | 'workspaces' | 'cleanup' | 'create' | 'settings'>('overview')

  // Overview data
  interface SystemOverview {
    total_workspaces: number
    total_users: number
    total_banned_users: number
    total_zalo_accounts: number
    total_projects: number
    total_groups: number
    total_contacts: number
    group_campaigns: { total: number; scheduled: number; sent: number; partial: number; failed: number; draft: number }
    personal_campaigns: { total: number; scheduled: number; sending: number; sent: number; partial: number; failed: number; paused: number; draft: number }
    messages_sent: { to_groups: number; to_users: number; failed_groups: number; failed_users: number }
    activity_30d: { new_workspaces: number; new_users: number; campaigns_sent: number; personal_campaigns_sent: number }
  }
  interface TopWorkspace {
    workspace_id: string
    workspace_name: string
    member_count: number
    zalo_account_count: number
    project_count: number
    contact_count: number
    total_messages_sent: number
    last_activity: string
  }
  const [overview, setOverview] = useState<SystemOverview | null>(null)
  const [topWorkspaces, setTopWorkspaces] = useState<TopWorkspace[]>([])
  const [overviewError, setOverviewError] = useState<string>('')
  const [topWorkspacesError, setTopWorkspacesError] = useState('')
  const [workspaceHealth, setWorkspaceHealth] = useState<WorkspaceHealth[]>([])
  const [workspaceHealthError, setWorkspaceHealthError] = useState('')

  // System settings
  const [globalHelpUrl, setGlobalHelpUrl] = useState('')
  const [savingHelpUrl, setSavingHelpUrl] = useState(false)
  const [helpUrlMsg, setHelpUrlMsg] = useState('')

  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([])
  const [allUsers, setAllUsers] = useState<AdminUser[]>([])
  const [userSearch, setUserSearch] = useState('')
  const [workspaces, setWorkspaces] = useState<AdminWorkspace[]>([])

  // Form: tạo workspace
  const [newWsName, setNewWsName] = useState('')
  const [newWsDesc, setNewWsDesc] = useState('')
  const [newWsOwnerEmail, setNewWsOwnerEmail] = useState('')
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')

  // Modal: gán user vào workspace
  const [assignModal, setAssignModal] = useState<AssignableUser | null>(null)
  const [assignWsId, setAssignWsId] = useState('')
  const [assignRole, setAssignRole] = useState('member')

  const loadData = useCallback(async () => {
    const { data: pending, error: errP } = await supabase.rpc('get_pending_users')
    if (errP) {
      console.error('pending error:', errP.message)
      setPendingUsers([])
    } else {
      setPendingUsers(pending || [])
    }

    const { data: ws, error: errW } = await supabase.rpc('get_all_workspaces_admin')
    if (errW) {
      console.error('workspaces error:', errW.message)
      setWorkspaces([])
    } else {
      setWorkspaces(ws || [])
    }

    const { data: settings } = await supabase
      .from('system_settings')
      .select('value')
      .eq('key', 'global_help_url')
      .single()
    setGlobalHelpUrl(settings?.value || '')

    // System overview stats
    const { data: ov, error: ovErr } = await supabase.rpc('get_system_overview')
    if (ovErr) {
      console.error('get_system_overview error:', ovErr)
      setOverviewError(ovErr.message || 'Lỗi không xác định')
      setOverview(null)
    } else {
      setOverview(ov || null)
      setOverviewError('')
    }

    const { data: top, error: topErr } = await supabase.rpc('get_top_workspaces_by_activity', { p_limit: 10 })
    if (topErr) {
      console.error('get_top_workspaces error:', topErr)
      setTopWorkspacesError(topErr.message || 'Không thể tải danh sách workspace')
    } else {
      setTopWorkspacesError('')
    }
    setTopWorkspaces(top || [])

    const { data: users, error: usersErr } = await supabase.rpc('get_all_users_admin')
    if (usersErr) {
      console.error('get_all_users_admin error:', usersErr)
      setAllUsers([])
    } else {
      setAllUsers(users || [])
    }

    const { data: health, error: healthErr } = await supabase.rpc('get_workspace_health_overview', { p_inactive_days: 14 })
    if (healthErr) {
      console.error('get_workspace_health_overview error:', healthErr)
      setWorkspaceHealthError(healthErr.message || 'Không thể tải sức khỏe workspace')
      setWorkspaceHealth([])
    } else {
      setWorkspaceHealthError('')
      setWorkspaceHealth(health || [])
    }
  }, [supabase])

  async function saveGlobalHelpUrl() {
    setSavingHelpUrl(true)
    setHelpUrlMsg('')
    const { error } = await supabase.rpc('set_system_setting', {
      p_key: 'global_help_url',
      p_value: globalHelpUrl.trim(),
    })
    if (error) setHelpUrlMsg('❌ ' + error.message)
    else {
      setHelpUrlMsg('✅ Đã lưu')
      setTimeout(() => setHelpUrlMsg(''), 2500)
    }
    setSavingHelpUrl(false)
  }

  useEffect(() => {
    async function checkAuth() {
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
      await loadData()
      setLoading(false)
    }
    checkAuth()
  }, [supabase, router, loadData])

  async function handleCreateWorkspace(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateMsg('')
    const { error } = await supabase.rpc('create_workspace_with_owner', {
      workspace_name: newWsName.trim(),
      workspace_desc: newWsDesc.trim() || null,
      owner_email: newWsOwnerEmail.trim() || null,
    })
    if (error) {
      setCreateMsg('❌ ' + error.message)
    } else {
      setCreateMsg('✅ Tạo workspace thành công!')
      setNewWsName('')
      setNewWsDesc('')
      setNewWsOwnerEmail('')
      await loadData()
    }
    setCreating(false)
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault()
    if (!assignModal || !assignWsId) return
    const { error } = await supabase.rpc('assign_user_to_workspace', {
      target_user_id: assignModal.user_id,
      target_workspace_id: assignWsId,
      target_role: assignRole,
    })
    if (error) {
      alert('Lỗi: ' + error.message)
      return
    }
    setAssignModal(null)
    setAssignWsId('')
    setAssignRole('member')
    await loadData()
  }

  async function handleBan(userId: string, banned: boolean) {
    if (banned && !confirm('Cấm user này không cho đăng nhập?')) return
    const { error } = await supabase.rpc('set_user_banned', {
      target_user_id: userId,
      banned,
    })
    if (error) {
      alert('Lỗi: ' + error.message)
      return
    }
    await loadData()
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-500"><Loader2 className="animate-spin" /></div>
  }

  if (!authorized) return null

  const inactiveWorkspaces = workspaceHealth.filter(ws => ws.health_status === 'inactive')
  const quietWorkspaces = workspaceHealth.filter(ws => ws.health_status === 'quiet')
  const filteredUsers = allUsers.filter(user => {
    const keyword = userSearch.trim().toLowerCase()
    return !keyword
      || user.email.toLowerCase().includes(keyword)
      || (user.full_name || '').toLowerCase().includes(keyword)
      || user.workspace_names.toLowerCase().includes(keyword)
  })

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Shield className="text-purple-600" size={28} />
        <h1 className="text-2xl font-bold text-gray-900">Super Admin</h1>
      </div>
      <p className="text-gray-500">Quản lý toàn hệ thống Zalo Sender</p>

      <div className="flex gap-6 mt-6 border-b border-gray-200 overflow-x-auto">
        <button
          onClick={() => setTab('overview')}
          className={`pb-3 text-sm font-medium border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            tab === 'overview' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <BarChart3 size={16} />
          Tổng quan
        </button>
        <button
          onClick={() => setTab('pending')}
          className={`pb-3 text-sm font-medium border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            tab === 'pending' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users size={16} />
          User chờ duyệt ({pendingUsers.length})
        </button>
        <button
          onClick={() => setTab('users')}
          className={`pb-3 text-sm font-medium border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            tab === 'users' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <UserPlus size={16} />
          Gán user ({allUsers.length})
        </button>
        <button
          onClick={() => setTab('workspaces')}
          className={`pb-3 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
            tab === 'workspaces' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Building2 size={16} />
          Tất cả workspaces ({workspaces.length})
        </button>
        <button
          onClick={() => setTab('cleanup')}
          className={`pb-3 text-sm font-medium border-b-2 transition flex items-center gap-2 whitespace-nowrap ${
            tab === 'cleanup' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Activity size={16} />
          Dọn dẹp {inactiveWorkspaces.length > 0 && <span className="text-xs px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">{inactiveWorkspaces.length}</span>}
        </button>
        <button
          onClick={() => setTab('create')}
          className={`pb-3 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
            tab === 'create' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Plus size={16} />
          Tạo workspace mới
        </button>
        <button
          onClick={() => setTab('settings')}
          className={`pb-3 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
            tab === 'settings' ? 'border-purple-600 text-purple-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Settings size={16} />
          Cài đặt hệ thống
        </button>
      </div>

      {/* TAB 0: OVERVIEW */}
      {tab === 'overview' && !overview && (
        <div className="mt-6">
          {overviewError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-6">
              <h3 className="font-semibold text-red-900 mb-2">❌ Không thể load thống kê</h3>
              <p className="text-sm text-red-700 mb-3">Lỗi: <code className="bg-red-100 px-2 py-0.5 rounded">{overviewError}</code></p>
              {overviewError.includes('function') || overviewError.includes('does not exist') ? (
                <div className="bg-white border border-red-200 rounded-lg p-4 text-sm">
                  <p className="font-medium text-gray-900 mb-2">💡 Nguyên nhân khả dĩ:</p>
                  <p className="text-gray-700">RPC <code className="bg-gray-100 px-1.5 py-0.5 rounded">get_system_overview</code> chưa tồn tại trong database.</p>
                  <p className="text-gray-700 mt-2">
                    👉 Vào <a href="https://supabase.com/dashboard/projects" target="_blank" rel="noopener" className="text-blue-600 underline">Supabase SQL Editor</a>,
                    chạy file <code className="bg-gray-100 px-1.5 py-0.5 rounded">supabase/v2-buoi5-super-admin-stats.sql</code> rồi refresh trang.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-red-700">Mở Console (F12) để xem chi tiết.</p>
              )}
            </div>
          ) : (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="animate-spin text-gray-400" />
            </div>
          )}
        </div>
      )}

      {tab === 'overview' && overview && (
        <div className="mt-6 space-y-6">
          {/* Big banner: tổng tin nhắn */}
          <div className="bg-gradient-to-r from-purple-600 via-blue-600 to-indigo-600 text-white rounded-2xl p-6 flex items-center gap-4 shadow-lg">
            <Sparkles size={40} className="flex-shrink-0" />
            <div>
              <p className="text-3xl font-bold">
                {(overview.messages_sent.to_groups + overview.messages_sent.to_users).toLocaleString('vi-VN')}
              </p>
              <p className="text-sm text-purple-100">Tổng tin nhắn đã gửi thành công qua toàn hệ thống</p>
              <p className="text-xs text-purple-200 mt-1">
                Nhóm: {overview.messages_sent.to_groups.toLocaleString('vi-VN')} ·
                Cá nhân: {overview.messages_sent.to_users.toLocaleString('vi-VN')} ·
                Thất bại: {(overview.messages_sent.failed_groups + overview.messages_sent.failed_users).toLocaleString('vi-VN')}
              </p>
            </div>
          </div>

          {/* Stats cards grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <AdminStatCard icon={Building2} color="purple" value={overview.total_workspaces} label="Workspaces" />
            <AdminStatCard icon={Users} color="blue" value={overview.total_users} label="Users (active)" />
            <AdminStatCard icon={Phone} color="cyan" value={overview.total_zalo_accounts} label="Zalo Accounts" />
            <AdminStatCard icon={FolderOpen} color="indigo" value={overview.total_projects} label="Dự án" />
            <AdminStatCard icon={MessageSquare} color="emerald" value={overview.total_contacts} label="Khách hàng" />
            <AdminStatCard icon={Users} color="amber" value={overview.total_groups} label="Nhóm Zalo" />
            <AdminStatCard icon={Ban} color="red" value={overview.total_banned_users} label="User bị cấm" />
            <AdminStatCard icon={TrendingUp} color="pink" value={overview.activity_30d.new_users} label="User mới 30d" />
          </div>

          {/* Campaigns breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <Send size={16} className="text-blue-600" />
                Đợt gửi nhóm Zalo
              </h3>
              <div className="space-y-2">
                <StatusRow label="📝 Nháp" value={overview.group_campaigns.draft} color="gray" />
                <StatusRow label="⏳ Chờ gửi" value={overview.group_campaigns.scheduled} color="blue" />
                <StatusRow label="✅ Đã gửi" value={overview.group_campaigns.sent} color="green" />
                <StatusRow label="⚠️ Gửi 1 phần" value={overview.group_campaigns.partial} color="orange" />
                <StatusRow label="❌ Lỗi" value={overview.group_campaigns.failed} color="red" />
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-700">
                <strong>Tổng: {overview.group_campaigns.total}</strong> đợt
              </div>
            </div>

            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <Phone size={16} className="text-emerald-600" />
                Đợt gửi cá nhân
              </h3>
              <div className="space-y-2">
                <StatusRow label="📝 Nháp" value={overview.personal_campaigns.draft} color="gray" />
                <StatusRow label="⏳ Chờ gửi" value={overview.personal_campaigns.scheduled} color="blue" />
                <StatusRow label="🔄 Đang gửi" value={overview.personal_campaigns.sending} color="yellow" />
                <StatusRow label="⏸️ Tạm dừng" value={overview.personal_campaigns.paused} color="purple" />
                <StatusRow label="✅ Đã gửi" value={overview.personal_campaigns.sent} color="green" />
                <StatusRow label="⚠️ Gửi 1 phần" value={overview.personal_campaigns.partial} color="orange" />
                <StatusRow label="❌ Lỗi" value={overview.personal_campaigns.failed} color="red" />
              </div>
              <div className="mt-3 pt-3 border-t border-gray-100 text-sm text-gray-700">
                <strong>Tổng: {overview.personal_campaigns.total}</strong> đợt
              </div>
            </div>
          </div>

          {/* 30 day activity */}
          <div className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-5">
            <h3 className="font-semibold text-amber-900 flex items-center gap-2 mb-3">
              <TrendingUp size={16} />
              Hoạt động 30 ngày qua
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
              <div>
                <p className="text-2xl font-bold text-amber-900">{overview.activity_30d.new_workspaces}</p>
                <p className="text-xs text-amber-700">Workspace mới</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-900">{overview.activity_30d.new_users}</p>
                <p className="text-xs text-amber-700">User mới</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-900">{overview.activity_30d.campaigns_sent}</p>
                <p className="text-xs text-amber-700">Đợt nhóm gửi</p>
              </div>
              <div>
                <p className="text-2xl font-bold text-amber-900">{overview.activity_30d.personal_campaigns_sent}</p>
                <p className="text-xs text-amber-700">Đợt cá nhân gửi</p>
              </div>
            </div>
          </div>

          {/* System health - ưu tiên những việc Super Admin cần xử lý */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <button onClick={() => setTab('cleanup')} className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-red-300 hover:shadow-sm transition">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-2xl font-bold text-red-600">{inactiveWorkspaces.length}</p>
                  <p className="text-sm text-gray-700 mt-1">Không hoạt động ≥ 14 ngày</p>
                </div>
                <Clock3 className="text-red-500" size={24} />
              </div>
              <p className="text-xs text-gray-500 mt-2">Mở để xem và dọn workspace cũ</p>
            </button>
            <button onClick={() => setTab('cleanup')} className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-amber-300 hover:shadow-sm transition">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-2xl font-bold text-amber-600">{quietWorkspaces.length}</p>
                  <p className="text-sm text-gray-700 mt-1">Ít hoạt động 7–13 ngày</p>
                </div>
                <Activity className="text-amber-500" size={24} />
              </div>
              <p className="text-xs text-gray-500 mt-2">Nên kiểm tra trước khi thành inactive</p>
            </button>
            <Link href="/dashboard/audit-log" className="text-left bg-white rounded-xl border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-2xl font-bold text-blue-600">{overview.group_campaigns.failed + overview.personal_campaigns.failed}</p>
                  <p className="text-sm text-gray-700 mt-1">Đợt gửi đang lỗi</p>
                </div>
                <Send className="text-blue-500" size={24} />
              </div>
              <p className="text-xs text-gray-500 mt-2">Mở lịch sử để xem diễn biến</p>
            </Link>
          </div>

          {/* Top workspaces */}
          <div className="bg-white rounded-xl border border-gray-200">
            <div className="p-4 border-b border-gray-200">
              <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                <Building2 size={16} />
                Top workspaces hoạt động gần đây
              </h3>
            </div>
            <div className="overflow-x-auto">
              {topWorkspacesError && (
                <div className="m-4 rounded-lg bg-red-50 border border-red-200 px-3 py-2 text-sm text-red-700">
                  Không tải được danh sách: {topWorkspacesError}
                </div>
              )}
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-700">Workspace</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Members</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Zalo</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Dự án</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Khách</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Tin đã gửi</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-700">Hoạt động</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {topWorkspaces.map(w => (
                    <tr key={w.workspace_id} className="hover:bg-gray-50">
                      <td className="px-3 py-2">
                        <Link
                          href={`/dashboard/admin/workspaces/${w.workspace_id}`}
                          className="text-blue-600 hover:underline font-medium"
                        >
                          {w.workspace_name}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-right text-gray-700">{w.member_count}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{w.zalo_account_count}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{w.project_count}</td>
                      <td className="px-3 py-2 text-right text-gray-700">{w.contact_count}</td>
                      <td className="px-3 py-2 text-right font-medium text-gray-900">
                        {Number(w.total_messages_sent).toLocaleString('vi-VN')}
                      </td>
                      <td className="px-3 py-2 text-right text-xs text-gray-500">
                        {w.last_activity ? new Date(w.last_activity).toLocaleDateString('vi-VN') : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 1: PENDING USERS */}
      {tab === 'pending' && (
        <div className="mt-6">
          {pendingUsers.length === 0 ? (
            <div className="bg-green-50 border border-green-200 rounded-xl p-8 text-center">
              <Check className="mx-auto text-green-600 mb-2" size={32} />
              <p className="text-green-900 font-medium">Tất cả user đã được phân workspace</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {pendingUsers.map((u) => (
                <div key={u.user_id} className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-medium">
                    {(u.full_name || u.email)[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{u.full_name || u.email}</p>
                    <p className="text-sm text-gray-500 truncate">{u.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">Đăng ký: {new Date(u.created_at).toLocaleString('vi-VN')}</p>
                  </div>
                  <button
                    onClick={() => setAssignModal(u)}
                    className="bg-blue-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition flex items-center gap-1.5"
                  >
                    <UserPlus size={14} />
                    Gán workspace
                  </button>
                  <button
                    onClick={() => handleBan(u.user_id, true)}
                    className="text-gray-400 hover:text-red-500 p-2 transition"
                    title="Ban user"
                  >
                    <Ban size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ALL USERS - one Gmail can be assigned to many workspaces */}
      {tab === 'users' && (
        <div className="mt-6">
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-900 mb-4">
            <p className="font-medium">Một Gmail có thể thuộc nhiều workspace.</p>
            <p className="mt-1 text-blue-800">Chọn “Gán workspace” để thêm workspace thứ 2, thứ 3… hoặc đổi role ở workspace đã có.</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="p-4 border-b border-gray-200 flex gap-3 flex-wrap items-center">
              <div className="relative flex-1 min-w-60">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Tìm tên, Gmail hoặc workspace..."
                  className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                />
              </div>
              <span className="text-xs text-gray-500">{filteredUsers.length} / {allUsers.length} user</span>
            </div>
            <div className="divide-y divide-gray-100">
              {filteredUsers.map((u) => (
                <div key={u.user_id} className="flex items-center gap-4 p-4">
                  <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center text-purple-700 font-medium">
                    {(u.full_name || u.email)[0]?.toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900">{u.full_name || u.email}</p>
                    <p className="text-sm text-gray-500 truncate">{u.email}</p>
                    <p className="text-xs text-gray-500 mt-1">
                      {u.workspace_count} workspace{u.workspace_count !== 1 ? 's' : ''}{u.workspace_names ? ` · ${u.workspace_names}` : ' · Chưa được gán workspace'}
                    </p>
                  </div>
                  {u.is_banned && <span className="text-xs px-2 py-1 rounded-full bg-red-100 text-red-700">Đã cấm</span>}
                  <button
                    onClick={() => setAssignModal(u)}
                    disabled={u.is_banned}
                    className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition disabled:opacity-50 flex items-center gap-1.5"
                  >
                    <UserPlus size={14} />
                    Gán workspace
                  </button>
                </div>
              ))}
              {filteredUsers.length === 0 && <p className="p-10 text-center text-gray-500">Không tìm thấy user phù hợp.</p>}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: WORKSPACES */}
      {tab === 'workspaces' && (
        <div className="mt-6">
          {workspaces.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
              <Building2 size={48} className="mx-auto text-gray-300" />
              <p className="mt-4 text-gray-500">Chưa có workspace nào. Hãy tạo workspace đầu tiên.</p>
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 divide-y divide-gray-100">
              {workspaces.map((ws) => (
                <Link
                  key={ws.id}
                  href={`/dashboard/admin/workspaces/${ws.id}`}
                  className="flex items-center justify-between p-4 hover:bg-gray-50 transition"
                >
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900">{ws.name}</h3>
                    {ws.description && <p className="text-sm text-gray-500 mt-0.5 truncate">{ws.description}</p>}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-400 mt-2">
                      <span>👥 {ws.member_count} thành viên</span>
                      {ws.owner_email && <span>👑 {ws.owner_email}</span>}
                      <span>📅 {new Date(ws.created_at).toLocaleDateString('vi-VN')}</span>
                    </div>
                  </div>
                  <ChevronRight size={18} className="text-gray-400 flex-shrink-0 ml-3" />
                </Link>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 4: CLEANUP inactive workspaces */}
      {tab === 'cleanup' && (
        <div className="mt-6">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-900 mb-4">
            <p className="font-medium">Dọn dẹp workspace không hoạt động</p>
            <p className="mt-1 text-amber-800">Danh sách đánh giá hoạt động gần nhất từ thao tác, dự án và đợt gửi. Mở workspace để kiểm tra trước; nút xóa vĩnh viễn nằm trong trang chi tiết và yêu cầu gõ đúng tên workspace.</p>
          </div>
          {workspaceHealthError ? (
            <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">Không tải được dữ liệu: {workspaceHealthError}</div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-xs text-gray-600">
                  <tr>
                    <th className="px-4 py-3 text-left">Workspace</th>
                    <th className="px-4 py-3 text-right">Members</th>
                    <th className="px-4 py-3 text-right">Dự án</th>
                    <th className="px-4 py-3 text-right">Khách</th>
                    <th className="px-4 py-3 text-right">Không hoạt động</th>
                    <th className="px-4 py-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {workspaceHealth.map((ws) => {
                    const status = ws.health_status === 'inactive'
                      ? 'bg-red-100 text-red-700'
                      : ws.health_status === 'quiet'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-green-100 text-green-700'
                    const statusLabel = ws.health_status === 'inactive' ? 'Inactive' : ws.health_status === 'quiet' ? 'Ít hoạt động' : 'Đang hoạt động'
                    return (
                      <tr key={ws.workspace_id} className="hover:bg-gray-50">
                        <td className="px-4 py-3">
                          <Link href={`/dashboard/admin/workspaces/${ws.workspace_id}`} className="font-medium text-blue-600 hover:underline">{ws.workspace_name}</Link>
                          <span className={`ml-2 text-xs px-2 py-0.5 rounded-full ${status}`}>{statusLabel}</span>
                        </td>
                        <td className="px-4 py-3 text-right">{ws.member_count}</td>
                        <td className="px-4 py-3 text-right">{ws.project_count}</td>
                        <td className="px-4 py-3 text-right">{ws.contact_count}</td>
                        <td className="px-4 py-3 text-right">{ws.inactive_days} ngày</td>
                        <td className="px-4 py-3 text-right"><Link href={`/dashboard/admin/workspaces/${ws.workspace_id}`} className="text-blue-600 hover:underline">Kiểm tra</Link></td>
                      </tr>
                    )
                  })}
                  {workspaceHealth.length === 0 && <tr><td colSpan={6} className="p-10 text-center text-gray-500">Chưa có dữ liệu workspace.</td></tr>}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 5: CREATE */}
      {tab === 'create' && (
        <div className="mt-6 max-w-2xl">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900">Tạo workspace mới</h3>
            <p className="text-sm text-gray-500 mt-1">Workspace cho 1 công ty / team. Sau khi tạo, gán Owner để họ tự quản lý.</p>

            <form onSubmit={handleCreateWorkspace} className="mt-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1.5">Tên workspace *</label>
                <input
                  type="text"
                  value={newWsName}
                  onChange={(e) => setNewWsName(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                  placeholder="VD: Công ty ABC"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1.5">Mô tả (tùy chọn)</label>
                <input
                  type="text"
                  value={newWsDesc}
                  onChange={(e) => setNewWsDesc(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                  placeholder="VD: Phòng marketing và CSKH"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1.5">Email Owner (tùy chọn)</label>
                <input
                  type="email"
                  value={newWsOwnerEmail}
                  onChange={(e) => setNewWsOwnerEmail(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                  placeholder="email@example.com (đã đăng nhập Google ít nhất 1 lần)"
                />
                <p className="text-xs text-gray-500 mt-1">Để trống = bạn (Super Admin) làm owner. User cần đã đăng nhập Google ít nhất 1 lần.</p>
              </div>

              {createMsg && (
                <div className={`px-4 py-3 rounded-lg text-sm ${createMsg.startsWith('✅') ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                  {createMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={creating || !newWsName.trim()}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {creating ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                {creating ? 'Đang tạo...' : 'Tạo workspace'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* TAB 6: SETTINGS */}
      {tab === 'settings' && (
        <div className="mt-6 max-w-2xl">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
              <BookOpen size={18} />
              Link hướng dẫn mặc định (Global)
            </h3>
            <p className="text-sm text-gray-500 mt-1">
              Link này áp dụng cho <strong>tất cả workspace</strong>. Mỗi workspace có thể override bằng link riêng (vào Workspace Detail để chỉnh).
            </p>

            <div className="mt-5">
              <label className="block text-sm font-medium text-gray-800 mb-1.5">URL hướng dẫn</label>
              <input
                type="url"
                value={globalHelpUrl}
                onChange={(e) => setGlobalHelpUrl(e.target.value)}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none text-gray-900 font-mono"
                placeholder="https://example.com/huong-dan"
              />
              <p className="text-xs text-gray-500 mt-1">
                Mặc định: <code className="bg-gray-100 px-1.5 py-0.5 rounded">https://example.com/huong-dan</code>
              </p>
            </div>

            <div className="mt-5 flex items-center gap-3">
              <button
                onClick={saveGlobalHelpUrl}
                disabled={savingHelpUrl}
                className="bg-purple-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition disabled:opacity-50 flex items-center gap-2"
              >
                {savingHelpUrl ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Lưu
              </button>
              {helpUrlMsg && (
                <span className={`text-sm font-medium ${helpUrlMsg.startsWith('✅') ? 'text-green-700' : 'text-red-600'}`}>
                  {helpUrlMsg}
                </span>
              )}
            </div>
          </div>

          <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
            <p className="font-medium mb-1">💡 Cách hoạt động:</p>
            <ul className="list-disc pl-5 space-y-0.5 text-blue-800">
              <li>Sidebar mỗi user sẽ hiện nút <strong>&quot;📚 Hướng dẫn sử dụng&quot;</strong></li>
              <li>Nếu workspace có set link riêng → dùng link đó</li>
              <li>Nếu không → fallback về link global này</li>
              <li>Nếu cả 2 đều trống → ẩn nút (không hiện)</li>
            </ul>
          </div>
        </div>
      )}

      {/* MODAL: Gán user */}
      {assignModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900">Gán user vào workspace</h3>
            <p className="text-sm text-gray-600 mt-1">User: <strong>{assignModal.email}</strong></p>

            <form onSubmit={handleAssign} className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1.5">Workspace *</label>
                <select
                  value={assignWsId}
                  onChange={(e) => setAssignWsId(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm text-gray-900"
                  required
                >
                  <option value="">-- Chọn workspace --</option>
                  {workspaces.map((ws) => (
                    <option key={ws.id} value={ws.id}>{ws.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1.5">Role *</label>
                <select
                  value={assignRole}
                  onChange={(e) => setAssignRole(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm text-gray-900"
                >
                  <option value="member">Member (thường)</option>
                  <option value="admin">Admin (quản lý)</option>
                  <option value="owner">Owner (chủ workspace)</option>
                </select>
              </div>

              <div className="flex gap-3 justify-end">
                <button
                  type="button"
                  onClick={() => { setAssignModal(null); setAssignWsId(''); setAssignRole('member') }}
                  className="px-4 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={!assignWsId}
                  className="bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
                >
                  Gán
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// =========== Helpers ===========
type IconType = typeof Building2
function AdminStatCard({ icon: Icon, color, value, label }: { icon: IconType; color: string; value: number; label: string }) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    purple: 'bg-purple-100 text-purple-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    cyan: 'bg-cyan-100 text-cyan-600',
    emerald: 'bg-emerald-100 text-emerald-600',
    amber: 'bg-amber-100 text-amber-600',
    red: 'bg-red-100 text-red-600',
    pink: 'bg-pink-100 text-pink-600',
  }
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center gap-2.5">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${colors[color] || colors.blue}`}>
          <Icon size={18} />
        </div>
        <div className="min-w-0">
          <p className="text-xl font-bold text-gray-900">{value.toLocaleString('vi-VN')}</p>
          <p className="text-xs text-gray-500 truncate">{label}</p>
        </div>
      </div>
    </div>
  )
}

function StatusRow({ label, value, color }: { label: string; value: number; color: string }) {
  const colors: Record<string, string> = {
    gray: 'text-gray-600',
    blue: 'text-blue-600',
    yellow: 'text-yellow-700',
    purple: 'text-purple-700',
    green: 'text-green-700',
    orange: 'text-orange-700',
    red: 'text-red-700',
  }
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-gray-700">{label}</span>
      <span className={`font-semibold ${colors[color] || 'text-gray-700'}`}>{value.toLocaleString('vi-VN')}</span>
    </div>
  )
}
