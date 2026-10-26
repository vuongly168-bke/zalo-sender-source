'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { Plus, Trash2, Users, Send, ExternalLink, Loader2, Phone, Upload, Edit2, X } from 'lucide-react'
import type { Project, ZaloGroup, Campaign, ZaloAccount } from '@/lib/types'
import { CAMPAIGN_STATUS_LABELS, describeRecurrence } from '@/lib/types'
import { useUserRole } from '@/lib/hooks/use-user-role'
import { ImportGroupsModal } from '@/components/groups/import-groups-modal'
import Link from 'next/link'

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const supabase = createClient()

  const [project, setProject] = useState<Project | null>(null)
  const [groups, setGroups] = useState<ZaloGroup[]>([])
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [activeTab, setActiveTab] = useState<'groups' | 'campaigns'>('groups')
  const [showAddGroup, setShowAddGroup] = useState(false)
  const [groupLink, setGroupLink] = useState('')
  const [loadingGroup, setLoadingGroup] = useState(false)
  const [groupError, setGroupError] = useState('')
  const [foundGroup, setFoundGroup] = useState<{ name: string; id: string; memberCount: number } | null>(null)
  const [zaloAccounts, setZaloAccounts] = useState<ZaloAccount[]>([])
  const [showChangeZalo, setShowChangeZalo] = useState(false)
  const [savingZalo, setSavingZalo] = useState(false)
  const [showImportGroups, setShowImportGroups] = useState(false)

  // Edit project modal
  const [showEditProject, setShowEditProject] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)
  const [editError, setEditError] = useState('')

  async function handleSaveProject() {
    if (!editName.trim()) { setEditError('Tên dự án không được trống'); return }
    setSavingEdit(true); setEditError('')
    const { error } = await supabase
      .from('projects')
      .update({ name: editName.trim(), description: editDesc.trim() || null })
      .eq('id', projectId)
    if (error) {
      setEditError('Lỗi: ' + error.message)
      setSavingEdit(false)
      return
    }
    setShowEditProject(false)
    setSavingEdit(false)
    await loadData()
    router.refresh()
  }
  const role = useUserRole(project?.workspace_id)

  const loadData = useCallback(async () => {
    const { data: proj } = await supabase
      .from('projects')
      .select('*, zalo_accounts(id, name, phone_number, is_active)')
      .eq('id', projectId)
      .single()
    setProject(proj)

    if (proj?.workspace_id) {
      const { data: zas } = await supabase
        .from('zalo_accounts')
        .select('*')
        .eq('workspace_id', proj.workspace_id)
        .eq('is_active', true)
        .order('name', { ascending: true })
      setZaloAccounts(zas || [])
    }

    const { data: grps } = await supabase
      .from('zalo_groups')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: true })
    setGroups(grps || [])

    const { data: camps } = await supabase
      .from('campaigns')
      .select('*, campaign_groups(count)')  // count thay vì fetch toàn bộ rows
      .eq('project_id', projectId)
      .order('created_at', { ascending: false })
      .limit(200)
    setCampaigns(camps || [])
  }, [supabase, projectId])

  async function handleChangeZalo(newZaloId: string) {
    setSavingZalo(true)
    const { error } = await supabase
      .from('projects')
      .update({ zalo_account_id: newZaloId })
      .eq('id', projectId)
    if (error) { alert('Lỗi: ' + error.message); setSavingZalo(false); return }
    setShowChangeZalo(false)
    await loadData()
    setSavingZalo(false)
  }

  useEffect(() => { loadData() }, [loadData])

  async function handleLookupGroup() {
    if (!groupLink.trim()) return
    setLoadingGroup(true)
    setGroupError('')
    setFoundGroup(null)

    try {
      const res = await fetch('/api/zalo/group-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ groupLink, projectId }),
      })
      const data = await res.json()

      if (data.error) {
        setGroupError(data.error)
      } else {
        setFoundGroup({ name: data.name, id: data.groupId, memberCount: data.memberCount || 0 })
      }
    } catch {
      setGroupError('Không thể kết nối. Kiểm tra lại API key.')
    }
    setLoadingGroup(false)
  }

  async function handleAddGroup() {
    if (!foundGroup) return

    await supabase.from('zalo_groups').insert({
      project_id: projectId,
      group_name: foundGroup.name,
      group_id: foundGroup.id,
      group_link: groupLink,
      member_count: foundGroup.memberCount,
    })

    setShowAddGroup(false)
    setGroupLink('')
    setFoundGroup(null)
    loadData()
  }

  async function handleDeleteGroup(groupId: string) {
    if (!confirm('Xóa nhóm này?')) return
    await supabase.from('zalo_groups').delete().eq('id', groupId)
    loadData()
  }

  if (!project) return <div className="text-center py-20 text-gray-500">Đang tải...</div>

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">{project.name}</h1>
          {project.description && <p className="text-gray-500 mt-1">{project.description}</p>}

          {/* Zalo Account badge */}
          {project.zalo_accounts ? (
            <div className="mt-3 inline-flex items-center gap-2 bg-blue-50 border border-blue-200 px-3 py-1.5 rounded-lg">
              <Phone size={14} className="text-blue-600" />
              <span className="text-sm text-blue-900 font-medium">
                Gửi từ: {project.zalo_accounts.name}
                {project.zalo_accounts.phone_number && (
                  <span className="text-blue-600 ml-1">· {project.zalo_accounts.phone_number}</span>
                )}
              </span>
              {role.canManageProjects && (
                <button
                  onClick={() => setShowChangeZalo(true)}
                  className="text-xs text-blue-600 hover:underline ml-1"
                >
                  Đổi
                </button>
              )}
            </div>
          ) : (
            <div className="mt-3 inline-flex items-center gap-2 bg-orange-50 border border-orange-200 px-3 py-1.5 rounded-lg">
              <Phone size={14} className="text-orange-600" />
              <span className="text-sm text-orange-900 font-medium">⚠️ Chưa gắn Zalo Account</span>
              {role.canManageProjects && (
                <button onClick={() => setShowChangeZalo(true)} className="text-xs text-orange-700 underline ml-1">
                  Chọn ngay
                </button>
              )}
            </div>
          )}
        </div>

        {role.canManageProjects && (
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => {
                setEditName(project.name)
                setEditDesc(project.description || '')
                setEditError('')
                setShowEditProject(true)
              }}
              className="flex items-center gap-2 text-yellow-700 bg-yellow-50 hover:bg-yellow-100 border border-yellow-200 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              <Edit2 size={16} />
              Sửa dự án
            </button>
            <button
              onClick={async () => {
                if (!confirm(`Xóa dự án "${project.name}"?\n\nTất cả nhóm Zalo và đợt gửi trong dự án sẽ bị xóa vĩnh viễn.`)) return
                const { error } = await supabase.from('projects').delete().eq('id', projectId)
                if (error) {
                  alert('Không thể xóa: ' + error.message)
                  return
                }
                router.push('/dashboard/projects')
                router.refresh()
              }}
              className="flex items-center gap-2 text-red-600 hover:bg-red-50 border border-red-200 px-4 py-2 rounded-lg text-sm font-medium transition"
            >
              <Trash2 size={16} />
              Xóa dự án
            </button>
          </div>
        )}
      </div>

      {/* Modal Sửa dự án */}
      {showEditProject && project && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Edit2 size={18} />Sửa dự án
              </h3>
              <button
                onClick={() => setShowEditProject(false)}
                disabled={savingEdit}
                className="text-gray-400 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1.5">Tên dự án *</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none text-gray-900"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1.5">Mô tả (tùy chọn)</label>
                <textarea
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 outline-none text-gray-900 resize-none"
                />
              </div>

              {editError && (
                <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{editError}</div>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button
                  onClick={() => setShowEditProject(false)}
                  disabled={savingEdit}
                  className="px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSaveProject}
                  disabled={savingEdit || !editName.trim()}
                  className="bg-yellow-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-yellow-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {savingEdit && <Loader2 size={14} className="animate-spin" />}
                  Lưu thay đổi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Import Groups hàng loạt */}
      {showImportGroups && project && (
        <ImportGroupsModal
          projectId={projectId}
          workspaceId={project.workspace_id}
          onClose={() => setShowImportGroups(false)}
          onSaved={() => { setShowImportGroups(false); loadData() }}
        />
      )}

      {/* Modal đổi Zalo Account */}
      {showChangeZalo && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900">Đổi Zalo Account</h3>
            <p className="text-sm text-gray-500 mt-1">Chọn Zalo Account dùng cho dự án này</p>

            {zaloAccounts.length === 0 ? (
              <p className="mt-4 text-sm text-gray-700">
                Workspace chưa có Zalo Account nào. <Link href="/dashboard/settings" className="text-blue-600 underline">Vào Cài đặt API để tạo</Link>.
              </p>
            ) : (
              <div className="mt-4 space-y-2 max-h-72 overflow-y-auto">
                {zaloAccounts.map((za) => (
                  <button
                    key={za.id}
                    onClick={() => handleChangeZalo(za.id)}
                    disabled={savingZalo}
                    className="w-full text-left p-3 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition flex items-center gap-3 disabled:opacity-50"
                  >
                    <div className="w-9 h-9 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Phone size={16} className="text-blue-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900">{za.name}</p>
                      {za.phone_number && <p className="text-sm text-gray-500">{za.phone_number}</p>}
                    </div>
                  </button>
                ))}
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <button
                onClick={() => setShowChangeZalo(false)}
                disabled={savingZalo}
                className="px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-4 mt-6 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('groups')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
            activeTab === 'groups' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Users size={16} />
          Nhóm Zalo ({groups.length})
        </button>
        <button
          onClick={() => setActiveTab('campaigns')}
          className={`pb-3 px-1 text-sm font-medium border-b-2 transition flex items-center gap-2 ${
            activeTab === 'campaigns' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Send size={16} />
          Đợt gửi ({campaigns.length})
        </button>
      </div>

      {activeTab === 'groups' && (
        <div className="mt-6">
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setShowAddGroup(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
            >
              <Plus size={16} />
              Thêm 1 nhóm
            </button>
            <button
              onClick={() => setShowImportGroups(true)}
              className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
              title="Paste / upload danh sách link hàng loạt"
            >
              <Upload size={16} />
              Import nhóm hàng loạt
            </button>
          </div>

          {showAddGroup && (
            <div className="mt-4 bg-white rounded-xl border border-gray-200 p-6">
              <h3 className="font-medium text-gray-900">Thêm nhóm Zalo</h3>
              <div className="mt-4 space-y-3">
                <div className="flex gap-3">
                  <input
                    type="text"
                    value={groupLink}
                    onChange={(e) => setGroupLink(e.target.value)}
                    className="flex-1 px-3 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="Paste link nhóm Zalo (https://zalo.me/g/...)"
                  />
                  <button
                    onClick={handleLookupGroup}
                    disabled={loadingGroup || !groupLink.trim()}
                    className="bg-gray-900 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 flex items-center gap-2"
                  >
                    {loadingGroup && <Loader2 size={14} className="animate-spin" />}
                    Lấy thông tin
                  </button>
                </div>

                {groupError && (
                  <div className="bg-red-50 text-red-600 px-4 py-3 rounded-lg text-sm">{groupError}</div>
                )}

                {foundGroup && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-800 font-medium">Tìm thấy nhóm:</p>
                    <p className="text-sm text-green-700 mt-1">Tên: {foundGroup.name}</p>
                    <p className="text-sm text-green-700">ID: {foundGroup.id}</p>
                    <p className="text-sm text-green-700">Thành viên: {foundGroup.memberCount}</p>
                    <div className="mt-3 flex gap-3">
                      <button
                        onClick={handleAddGroup}
                        className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-700 transition"
                      >
                        Thêm vào dự án
                      </button>
                      <button
                        onClick={() => { setFoundGroup(null); setGroupLink('') }}
                        className="text-gray-600 text-sm hover:underline"
                      >
                        Hủy
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="mt-4 space-y-2">
            {groups.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <Users size={48} className="mx-auto text-gray-300" />
                <p className="mt-4 text-gray-500">Chưa có nhóm Zalo nào</p>
              </div>
            )}

            {groups.map((group) => (
              <div key={group.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Users size={18} className="text-blue-600" />
                  </div>
                  <div>
                    <p className="font-medium text-gray-900">{group.group_name}</p>
                    <p className="text-xs text-gray-500">{group.member_count} thành viên</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${group.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                    {group.is_active ? 'Hoạt động' : 'Tắt'}
                  </span>
                  {group.group_link && (
                    <a href={group.group_link} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-blue-500 transition">
                      <ExternalLink size={16} />
                    </a>
                  )}
                  <button onClick={() => handleDeleteGroup(group.id)} className="text-gray-400 hover:text-red-500 transition">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'campaigns' && (
        <div className="mt-6">
          <Link
            href={`/dashboard/projects/${projectId}/campaigns/new`}
            className="inline-flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            <Plus size={16} />
            Tạo đợt gửi mới
          </Link>

          <div className="mt-4 space-y-2">
            {campaigns.length === 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                <Send size={48} className="mx-auto text-gray-300" />
                <p className="mt-4 text-gray-500">Chưa có đợt gửi nào</p>
              </div>
            )}

            {campaigns
              // Ẩn child instances - chỉ hiện parents + standalone campaigns
              .filter(c => !c.recurring_parent_id)
              .map((campaign) => {
                const statusInfo = CAMPAIGN_STATUS_LABELS[campaign.status]
                // campaign_groups(count) trả về [{ count: N }]
                const cg = campaign.campaign_groups as unknown
                const groupCount = Array.isArray(cg)
                  ? (cg[0] as { count?: number })?.count ?? cg.length
                  : 0
                const recurDesc = describeRecurrence(campaign)
                return (
                  <Link
                    key={campaign.id}
                    href={`/dashboard/projects/${projectId}/campaigns/${campaign.id}`}
                    className={`rounded-xl border p-4 flex items-center justify-between hover:shadow-md transition block ${
                      campaign.is_recurring ? 'bg-purple-50 border-purple-200' : 'bg-white border-gray-200'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">{statusInfo.icon}</span>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-medium text-gray-900">{campaign.name}</p>
                          {campaign.is_recurring && (
                            <span className="text-xs px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded-full font-medium">
                              🔁 Lặp lại
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-500">
                          {groupCount} nhóm
                          {recurDesc && ` • ${recurDesc}`}
                          {!campaign.is_recurring && campaign.scheduled_at && ` • ${new Date(campaign.scheduled_at).toLocaleString('vi-VN')}`}
                          {campaign.is_recurring && campaign.next_run_at && ` • Lần kế: ${new Date(campaign.next_run_at).toLocaleString('vi-VN')}`}
                        </p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusInfo.color}`}>
                      {statusInfo.label}
                    </span>
                  </Link>
                )
              })}
          </div>
        </div>
      )}
    </div>
  )
}
