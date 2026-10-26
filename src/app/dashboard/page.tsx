import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import {
  FolderOpen, Send, Clock, CheckCircle, Users, Phone, MessageSquare,
  TrendingUp, Sparkles,
} from 'lucide-react'
import { CAMPAIGN_STATUS_LABELS, PERSONAL_CAMPAIGN_STATUS_LABELS } from '@/lib/types'
import { RunCronButton } from '@/components/run-cron-button'
import { getActiveServerWorkspace } from '@/lib/workspace-context-server'
import { canManuallyRunCron } from '@/lib/manual-cron-authorization'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { currentWorkspace } = await getActiveServerWorkspace(supabase, user!.id)
  const workspaceId = currentWorkspace?.id

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, is_super_admin')
    .eq('id', user!.id)
    .single()

  const canRunManualCron = canManuallyRunCron(
    currentWorkspace?.role,
    Boolean(profile?.is_super_admin),
  )

  // Stats counts (parallel fetch)
  const [
    { count: projectsCount },
    { count: contactsCount },
    { count: zaloAccountsCount },
    { count: groupsCount },
    { data: groupCampaigns },
    { data: personalCampaigns },
  ] = await Promise.all([
    supabase.from('projects').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId!),
    supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId!),
    supabase.from('zalo_accounts').select('id', { count: 'exact', head: true }).eq('workspace_id', workspaceId!),
    supabase.from('zalo_groups').select('id, project_id, projects!inner(workspace_id)', { count: 'exact', head: true }).eq('projects.workspace_id', workspaceId!),
    supabase.from('campaigns').select('id, name, status, scheduled_at, project_id, projects!inner(workspace_id, name)').eq('projects.workspace_id', workspaceId!).order('scheduled_at', { ascending: true }).limit(500),
    supabase.from('personal_campaigns').select('id, name, status, scheduled_at, batch_size, batch_delay_minutes').eq('workspace_id', workspaceId!).order('scheduled_at', { ascending: true }).limit(500),
  ])

  // Group campaign stats
  const scheduledGroup = (groupCampaigns || []).filter(c => c.status === 'scheduled')
  const sentGroup = (groupCampaigns || []).filter(c => c.status === 'sent')

  // Personal campaign stats
  const scheduledPersonal = (personalCampaigns || []).filter(c => c.status === 'scheduled')
  const sendingPersonal = (personalCampaigns || []).filter(c => c.status === 'sending')
  const sentPersonal = (personalCampaigns || []).filter(c => ['sent', 'partial'].includes(c.status))

  // Tổng messages đã gửi (group + personal sent recipients)
  const [{ count: sentGroupMsgs }, { count: sentPersonalMsgs }] = await Promise.all([
    supabase
      .from('campaign_groups')
      .select('id, campaigns!inner(project_id, projects!inner(workspace_id))', { count: 'exact', head: true })
      .eq('status', 'sent')
      .eq('campaigns.projects.workspace_id', workspaceId!),
    supabase
      .from('personal_campaign_recipients')
      .select('id, personal_campaigns!inner(workspace_id)', { count: 'exact', head: true })
      .eq('status', 'sent')
      .eq('personal_campaigns.workspace_id', workspaceId!),
  ])

  const totalSent = (sentGroupMsgs || 0) + (sentPersonalMsgs || 0)

  // Top 5 upcoming
  const upcomingGroup = (groupCampaigns || [])
    .filter(c => ['scheduled', 'draft'].includes(c.status))
    .slice(0, 5)

  const upcomingPersonal = (personalCampaigns || [])
    .filter(c => ['scheduled', 'sending', 'paused'].includes(c.status))
    .slice(0, 5)

  return (
    <div>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Xin chào, {profile?.full_name || 'bạn'}!
          </h1>
          <p className="text-gray-500 mt-1">Tổng quan hoạt động gửi tin nhắn Zalo</p>
        </div>
        {canRunManualCron && <RunCronButton />}
      </div>

      {/* Top stats - 4 cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mt-6">
        <StatCard
          icon={Phone}
          color="purple"
          value={zaloAccountsCount || 0}
          label="Zalo Accounts"
          href="/dashboard/settings"
        />
        <StatCard
          icon={FolderOpen}
          color="blue"
          value={projectsCount || 0}
          label="Dự án"
          href="/dashboard/projects"
        />
        <StatCard
          icon={Users}
          color="indigo"
          value={groupsCount || 0}
          label="Nhóm Zalo"
        />
        <StatCard
          icon={MessageSquare}
          color="cyan"
          value={contactsCount || 0}
          label="Khách hàng"
          href="/dashboard/contacts"
        />
      </div>

      {/* Send Stats - 2 sections side by side */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Group send stats */}
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-blue-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Users size={18} className="text-blue-700" />
            <h3 className="font-semibold text-blue-900">Gửi nhóm Zalo</h3>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-bold text-yellow-700">{scheduledGroup.length}</p>
              <p className="text-xs text-gray-600">Chờ gửi</p>
            </div>
            <div>
              <p className="text-xl font-bold text-green-700">{sentGroup.length}</p>
              <p className="text-xs text-gray-600">Đã gửi</p>
            </div>
            <div>
              <p className="text-xl font-bold text-blue-700">{sentGroupMsgs || 0}</p>
              <p className="text-xs text-gray-600">Tin tới nhóm</p>
            </div>
          </div>
        </div>

        {/* Personal send stats */}
        <div className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-xl border border-emerald-100 p-5">
          <div className="flex items-center gap-2 mb-3">
            <Phone size={18} className="text-emerald-700" />
            <h3 className="font-semibold text-emerald-900">Gửi cá nhân (SĐT)</h3>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xl font-bold text-yellow-700">{scheduledPersonal.length + sendingPersonal.length}</p>
              <p className="text-xs text-gray-600">Đang chạy</p>
            </div>
            <div>
              <p className="text-xl font-bold text-green-700">{sentPersonal.length}</p>
              <p className="text-xs text-gray-600">Đợt xong</p>
            </div>
            <div>
              <p className="text-xl font-bold text-emerald-700">{sentPersonalMsgs || 0}</p>
              <p className="text-xs text-gray-600">Tin tới khách</p>
            </div>
          </div>
        </div>
      </div>

      {/* Total messages highlight */}
      {totalSent > 0 && (
        <div className="mt-4 bg-gradient-to-r from-purple-600 to-blue-600 text-white rounded-xl p-5 flex items-center gap-4">
          <Sparkles size={28} className="flex-shrink-0" />
          <div>
            <p className="text-2xl font-bold">{totalSent.toLocaleString('vi-VN')}</p>
            <p className="text-sm text-purple-100">Tổng tin nhắn đã gửi thành công qua hệ thống</p>
          </div>
        </div>
      )}

      {/* 2 columns: Upcoming Group + Upcoming Personal */}
      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Send size={16} />
              Đợt gửi nhóm sắp tới
            </h2>
            <Link href="/dashboard/projects" className="text-xs text-blue-600 hover:underline">Xem tất cả</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {upcomingGroup.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-500">Chưa có đợt nào sắp tới</p>
            ) : upcomingGroup.map(c => {
              const info = CAMPAIGN_STATUS_LABELS[c.status as keyof typeof CAMPAIGN_STATUS_LABELS]
              const projData = (c as unknown as { projects: { name?: string } | { name: string }[] | null }).projects
              const proj = Array.isArray(projData) ? projData[0] : projData
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/projects/${c.project_id}/campaigns/${c.id}`}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 transition"
                >
                  <div className="text-xl">{info.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-500 truncate">{proj?.name}</p>
                  </div>
                  {c.scheduled_at && (
                    <p className="text-xs text-gray-500 whitespace-nowrap">
                      {new Date(c.scheduled_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </Link>
              )
            })}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-gray-200">
          <div className="p-4 border-b border-gray-200 flex items-center justify-between">
            <h2 className="font-semibold text-gray-900 flex items-center gap-2">
              <Phone size={16} />
              Đợt gửi cá nhân sắp tới
            </h2>
            <Link href="/dashboard/personal-campaigns" className="text-xs text-blue-600 hover:underline">Xem tất cả</Link>
          </div>
          <div className="divide-y divide-gray-100">
            {upcomingPersonal.length === 0 ? (
              <p className="p-6 text-center text-sm text-gray-500">Chưa có đợt nào sắp tới</p>
            ) : upcomingPersonal.map(c => {
              const info = PERSONAL_CAMPAIGN_STATUS_LABELS[c.status as keyof typeof PERSONAL_CAMPAIGN_STATUS_LABELS]
              return (
                <Link
                  key={c.id}
                  href={`/dashboard/personal-campaigns/${c.id}`}
                  className="flex items-center gap-3 p-3 hover:bg-gray-50 transition"
                >
                  <div className="text-xl">{info.icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                    <p className="text-xs text-gray-500">Batch {c.batch_size}/{c.batch_delay_minutes}p</p>
                  </div>
                  {c.scheduled_at && (
                    <p className="text-xs text-gray-500 whitespace-nowrap">
                      {new Date(c.scheduled_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  )}
                </Link>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}

// ============ Reusable StatCard ============
type IconType = typeof FolderOpen
function StatCard({ icon: Icon, color, value, label, href }: {
  icon: IconType
  color: 'blue' | 'purple' | 'indigo' | 'cyan'
  value: number
  label: string
  href?: string
}) {
  const colors: Record<string, string> = {
    blue: 'bg-blue-100 text-blue-600',
    purple: 'bg-purple-100 text-purple-600',
    indigo: 'bg-indigo-100 text-indigo-600',
    cyan: 'bg-cyan-100 text-cyan-600',
  }
  const inner = (
    <div className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-sm transition">
      <div className="flex items-center gap-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colors[color]}`}>
          <Icon size={20} />
        </div>
        <div className="min-w-0">
          <p className="text-2xl font-bold text-gray-900">{value.toLocaleString('vi-VN')}</p>
          <p className="text-xs text-gray-500 truncate">{label}</p>
        </div>
      </div>
    </div>
  )
  return href ? <Link href={href}>{inner}</Link> : inner
}
