'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getActiveClientWorkspace } from '@/lib/workspace-context-client'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { FolderOpen, Plus, Trash2, Phone, AlertCircle } from 'lucide-react'
import type { Project, ZaloAccount } from '@/lib/types'

export default function ProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([])
  const [zaloAccounts, setZaloAccounts] = useState<ZaloAccount[]>([])
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [newZaloId, setNewZaloId] = useState('')
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState('')
  const [workspaceId, setWorkspaceId] = useState('')
  const router = useRouter()
  const searchParams = useSearchParams()
  const supabase = createClient()

  const loadAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const membership = await getActiveClientWorkspace(supabase, user.id)

    if (!membership) return
    setWorkspaceId(membership.workspace_id)

    const { data: projs } = await supabase
      .from('projects')
      .select('*, zalo_accounts(name, phone_number)')
      .eq('workspace_id', membership.workspace_id)
      .order('created_at', { ascending: false })
    setProjects(projs || [])

    const { data: zas } = await supabase
      .from('zalo_accounts')
      .select('*')
      .eq('workspace_id', membership.workspace_id)
      .eq('is_active', true)
      .order('name', { ascending: true })
    setZaloAccounts(zas || [])
  }, [supabase])

  useEffect(() => {
    loadAll()
    if (searchParams.get('new') === 'true') setShowNew(true)
  }, [loadAll, searchParams])

  async function handleCreate() {
    if (!newName.trim()) return
    if (!newZaloId) {
      setCreateError('Vui lòng chọn Zalo Account')
      return
    }
    setCreating(true)
    setCreateError('')

    const { data: { user } } = await supabase.auth.getUser()

    const { data, error } = await supabase
      .from('projects')
      .insert({
        name: newName,
        description: newDesc || null,
        workspace_id: workspaceId,
        zalo_account_id: newZaloId,
        created_by: user!.id,
      })
      .select()
      .single()

    if (error) {
      setCreateError(error.message)
      setCreating(false)
      return
    }

    if (data) {
      router.push(`/dashboard/projects/${data.id}`)
      router.refresh()
    }
    setCreating(false)
  }

  async function handleDelete(id: string) {
    if (!confirm('Xóa dự án này? Tất cả nhóm và đợt gửi trong dự án sẽ bị xóa.')) return
    await supabase.from('projects').delete().eq('id', id)
    loadAll()
    router.refresh()
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dự án</h1>
          <p className="text-gray-500 mt-1">Quản lý các dự án gửi tin nhắn Zalo</p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          <Plus size={16} />
          Tạo dự án mới
        </button>
      </div>

      {showNew && (
        <div className="mt-6 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="font-semibold text-gray-900">Tạo dự án mới</h3>

          {zaloAccounts.length === 0 && (
            <div className="mt-4 bg-orange-50 border border-orange-200 rounded-lg p-4 text-sm text-orange-900 flex items-start gap-2">
              <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium mb-1">Chưa có Zalo Account nào</p>
                <p>Vào <Link href="/dashboard/settings" className="underline font-medium">Cài đặt API</Link> để tạo Zalo Account trước khi tạo dự án.</p>
              </div>
            </div>
          )}

          <div className="mt-4 space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1.5">Tên dự án *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                placeholder="VD: CK3H K29, VTS1 K26..."
                autoFocus
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1.5">
                Gửi từ Zalo Account nào? *
              </label>
              <select
                value={newZaloId}
                onChange={(e) => setNewZaloId(e.target.value)}
                disabled={zaloAccounts.length === 0}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none disabled:bg-gray-50"
              >
                <option value="">-- Chọn Zalo Account --</option>
                {zaloAccounts.map((za) => (
                  <option key={za.id} value={za.id}>
                    {za.name}{za.phone_number ? ` (${za.phone_number})` : ''}
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-500 mt-1">Dự án sẽ dùng Zalo Account này để gửi tin nhắn</p>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-800 mb-1.5">Mô tả (tùy chọn)</label>
              <input
                type="text"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
                className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                placeholder="Mô tả ngắn"
              />
            </div>

            {createError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm">{createError}</div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={handleCreate}
                disabled={creating || !newName.trim() || !newZaloId}
                className="bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
              >
                {creating ? 'Đang tạo...' : 'Tạo dự án'}
              </button>
              <button
                onClick={() => { setShowNew(false); setNewName(''); setNewDesc(''); setNewZaloId(''); setCreateError('') }}
                className="text-gray-600 px-4 py-2.5 rounded-lg text-sm hover:bg-gray-100 transition"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-6 grid gap-3">
        {projects.length === 0 && !showNew && (
          <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
            <FolderOpen size={48} className="mx-auto text-gray-300" />
            <p className="mt-4 text-gray-500">Chưa có dự án nào</p>
            <button
              onClick={() => setShowNew(true)}
              className="mt-4 text-blue-600 text-sm font-medium hover:underline"
            >
              Tạo dự án đầu tiên
            </button>
          </div>
        )}

        {projects.map((project) => (
          <div
            key={project.id}
            className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-300 transition cursor-pointer flex items-center justify-between"
            onClick={() => router.push(`/dashboard/projects/${project.id}`)}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold text-gray-900">{project.name}</h3>
                {project.zalo_accounts && (
                  <span className="text-xs px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full flex items-center gap-1 border border-blue-200">
                    <Phone size={11} />
                    {project.zalo_accounts.name}
                    {project.zalo_accounts.phone_number && <span className="text-blue-500">· {project.zalo_accounts.phone_number}</span>}
                  </span>
                )}
                {!project.zalo_accounts && (
                  <span className="text-xs px-2 py-0.5 bg-orange-50 text-orange-700 rounded-full border border-orange-200">⚠️ Chưa gắn Zalo</span>
                )}
              </div>
              {project.description && <p className="text-sm text-gray-500 mt-1 truncate">{project.description}</p>}
              <p className="text-xs text-gray-400 mt-2">
                Tạo ngày {new Date(project.created_at).toLocaleDateString('vi-VN')}
              </p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleDelete(project.id) }}
              className="text-gray-400 hover:text-red-500 transition p-2 ml-3"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
