'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getActiveClientWorkspace } from '@/lib/workspace-context-client'
import {
  History, Loader2, User, Filter, ChevronDown, ChevronRight,
} from 'lucide-react'

interface AuditLog {
  id: string
  workspace_id?: string
  workspace_name?: string
  user_id: string
  user_email: string
  user_name: string | null
  action: string
  resource_type: string | null
  resource_id: string | null
  resource_name: string | null
  metadata: Record<string, unknown>
  created_at: string
}

const ACTION_LABELS: Record<string, { label: string; color: string; icon: string }> = {
  // Workspace
  workspace_created: { label: 'Tạo workspace', color: 'bg-purple-100 text-purple-700', icon: '🏢' },
  workspace_updated: { label: 'Sửa workspace', color: 'bg-blue-100 text-blue-700', icon: '✏️' },
  workspace_deleted: { label: 'Xóa workspace', color: 'bg-red-100 text-red-700', icon: '🗑️' },
  member_added: { label: 'Thêm thành viên', color: 'bg-green-100 text-green-700', icon: '👤' },
  member_removed: { label: 'Xóa thành viên', color: 'bg-red-100 text-red-700', icon: '🚫' },
  role_changed: { label: 'Đổi role', color: 'bg-yellow-100 text-yellow-700', icon: '🔄' },
  // Zalo Account
  zalo_account_created: { label: 'Tạo Zalo Account', color: 'bg-cyan-100 text-cyan-700', icon: '📞' },
  zalo_account_updated: { label: 'Sửa Zalo Account', color: 'bg-blue-100 text-blue-700', icon: '✏️' },
  zalo_account_deleted: { label: 'Xóa Zalo Account', color: 'bg-red-100 text-red-700', icon: '🗑️' },
  // Project
  project_created: { label: 'Tạo dự án', color: 'bg-blue-100 text-blue-700', icon: '📁' },
  project_deleted: { label: 'Xóa dự án', color: 'bg-red-100 text-red-700', icon: '🗑️' },
  // Campaign
  campaign_created: { label: 'Tạo đợt gửi', color: 'bg-blue-100 text-blue-700', icon: '✉️' },
  campaign_recurring_created: { label: 'Tạo đợt gửi lặp lại', color: 'bg-purple-100 text-purple-700', icon: '🔁' },
  campaign_sent: { label: 'Gửi tin nhóm', color: 'bg-green-100 text-green-700', icon: '🚀' },
  personal_campaign_created: { label: 'Tạo đợt cá nhân', color: 'bg-emerald-100 text-emerald-700', icon: '📞' },
  personal_campaign_sent: { label: 'Gửi tin cá nhân', color: 'bg-green-100 text-green-700', icon: '🚀' },
  // Contact
  contact_created: { label: 'Thêm khách', color: 'bg-cyan-100 text-cyan-700', icon: '👤' },
  contacts_imported: { label: 'Import khách hàng', color: 'bg-blue-100 text-blue-700', icon: '📥' },
  groups_imported: { label: 'Import nhóm Zalo', color: 'bg-blue-100 text-blue-700', icon: '📥' },
}

export default function AuditLogPage() {
  const supabase = createClient()
  const [workspaceId, setWorkspaceId] = useState('')
  const [isSuperAdmin, setIsSuperAdmin] = useState(false)
  const [canView, setCanView] = useState(false)
  // Default: nếu Super Admin thì xem toàn hệ thống, không thì xem workspace hiện tại
  const [scope, setScope] = useState<'workspace' | 'all'>('workspace')
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)

  const [filterAction, setFilterAction] = useState('')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())

  const [loadError, setLoadError] = useState<string>('')

  const loadLogs = useCallback(async () => {
    if (!workspaceId) {
      setLoading(false)
      return
    }
    setLoading(true)
    setLoadError('')
    try {
      if (scope === 'all' && isSuperAdmin) {
        const { data, error } = await supabase.rpc('get_all_audit_logs', { p_limit: 200 })
        if (error) {
          console.error('get_all_audit_logs error:', error)
          setLoadError(error.message)
          setLogs([])
        } else {
          setLogs(data || [])
        }
      } else {
        const { data, error } = await supabase.rpc('get_workspace_audit_logs', { p_workspace_id: workspaceId, p_limit: 200 })
        if (error) {
          console.error('get_workspace_audit_logs error:', error)
          setLoadError(error.message)
          setLogs([])
        } else {
          setLogs(data || [])
        }
      }
    } catch (err) {
      setLoadError((err as Error).message || 'Lỗi không xác định')
      setLogs([])
    } finally {
      setLoading(false)
    }
  }, [supabase, workspaceId, scope, isSuperAdmin])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const [m, { data: p }] = await Promise.all([
        getActiveClientWorkspace(supabase, user.id),
        supabase.from('profiles').select('is_super_admin').eq('id', user.id).single(),
      ])
      const isSuper = !!p?.is_super_admin
      setIsSuperAdmin(isSuper)
      // Mặc định: Super Admin xem 'toàn hệ thống', còn lại xem workspace hiện tại
      if (isSuper) setScope('all')
      setWorkspaceId(m?.workspace_id || '')
      const isAdmin = m?.role === 'owner' || m?.role === 'admin'
      setCanView(isSuper || isAdmin)
    }
    init()
  }, [supabase])

  useEffect(() => { loadLogs() }, [loadLogs])

  if (!canView && !loading) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-600">Bạn không có quyền xem audit log. Chỉ Admin/Owner/Super Admin mới được xem.</p>
      </div>
    )
  }

  const filteredLogs = filterAction ? logs.filter(l => l.action === filterAction) : logs
  const uniqueActions = Array.from(new Set(logs.map(l => l.action))).sort()

  function toggleExpand(id: string) {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) newSet.delete(id)
      else newSet.add(id)
      return newSet
    })
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <History className="text-blue-600" size={28} />
        <h1 className="text-2xl font-bold text-gray-900">Lịch sử hoạt động</h1>
      </div>
      <p className="text-gray-500">Audit log các action quan trọng trong workspace</p>

      {/* Filters */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex gap-3 flex-wrap items-center">
          {isSuperAdmin && (
            <select
              value={scope}
              onChange={(e) => setScope(e.target.value as 'workspace' | 'all')}
              className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            >
              <option value="workspace">Workspace hiện tại</option>
              <option value="all">🌍 Toàn hệ thống (Super Admin)</option>
            </select>
          )}

          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
            title="Lọc theo loại hành động cụ thể (vd: chỉ xem các lần tạo dự án)"
          >
            <option value="">📋 Tất cả loại hành động</option>
            <optgroup label="🏢 Workspace">
              {uniqueActions.filter(a => a.includes('workspace') || a.includes('member') || a.includes('role')).map(a => (
                <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>
              ))}
            </optgroup>
            <optgroup label="📞 Zalo Account">
              {uniqueActions.filter(a => a.includes('zalo_account')).map(a => (
                <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>
              ))}
            </optgroup>
            <optgroup label="📁 Dự án & Nhóm Zalo">
              {uniqueActions.filter(a => a.includes('project') || a.includes('group')).map(a => (
                <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>
              ))}
            </optgroup>
            <optgroup label="✉️ Đợt gửi">
              {uniqueActions.filter(a => a.includes('campaign')).map(a => (
                <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>
              ))}
            </optgroup>
            <optgroup label="👥 Khách hàng">
              {uniqueActions.filter(a => a.includes('contact') || a.includes('contacts')).map(a => (
                <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>
              ))}
            </optgroup>
          </select>

          <p className="text-xs text-gray-500 ml-auto">
            Hiển thị {filteredLogs.length} / {logs.length} log (giới hạn 200 gần nhất)
          </p>
        </div>

        {/* Hint giải thích */}
        <div className="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-600 flex flex-wrap gap-x-4 gap-y-1">
          <span><strong className="text-gray-800">💡 Phạm vi:</strong> {scope === 'all' ? 'Toàn hệ thống — xem mọi workspace' : 'Chỉ workspace hiện tại'}</span>
          <span><strong className="text-gray-800">Loại hành động:</strong> chọn để filter (vd chỉ xem &quot;Tạo dự án&quot;)</span>
        </div>
      </div>

      {/* Error state */}
      {loadError && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-xl p-5">
          <h3 className="font-semibold text-red-900 mb-2">❌ Không thể load audit log</h3>
          <p className="text-sm text-red-700 mb-2">
            Lỗi: <code className="bg-red-100 px-2 py-0.5 rounded text-xs">{loadError}</code>
          </p>
          {(loadError.includes('function') || loadError.includes('does not exist')) && (
            <div className="bg-white border border-red-200 rounded-lg p-3 text-sm">
              <p className="font-medium text-gray-900 mb-1">💡 Nguyên nhân khả dĩ:</p>
              <p className="text-gray-700">
                Bảng <code className="bg-gray-100 px-1 rounded">audit_logs</code> hoặc RPC chưa tồn tại.
              </p>
              <p className="text-gray-700 mt-2">
                👉 Chạy file{' '}
                <code className="bg-gray-100 px-1 rounded">supabase/v2-buoi5-audit-log.sql</code>{' '}
                trong Supabase SQL Editor.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Logs list */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-12 text-center"><Loader2 className="animate-spin mx-auto text-gray-400" /></div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <History size={36} className="mx-auto text-gray-300 mb-2" />
            <p>Chưa có log nào</p>
            <p className="text-xs mt-1">Các action sẽ được ghi lại tự động khi user thao tác</p>
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredLogs.map((log) => {
              const info = ACTION_LABELS[log.action] || { label: log.action, color: 'bg-gray-100 text-gray-700', icon: '📋' }
              const expanded = expandedRows.has(log.id)
              const hasMeta = log.metadata && Object.keys(log.metadata).length > 0

              return (
                <div key={log.id} className="p-3">
                  <div
                    className="flex items-start gap-3 cursor-pointer"
                    onClick={() => hasMeta && toggleExpand(log.id)}
                  >
                    <div className="text-xl flex-shrink-0">{info.icon}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${info.color}`}>
                          {info.label}
                        </span>
                        {log.resource_name && (
                          <span className="text-sm font-medium text-gray-900 truncate">{log.resource_name}</span>
                        )}
                        {scope === 'all' && log.workspace_name && (
                          <span className="text-xs px-1.5 py-0.5 bg-purple-50 text-purple-700 rounded">
                            🏢 {log.workspace_name}
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1 flex items-center gap-1.5">
                        <User size={11} />
                        {log.user_name || log.user_email}
                        <span className="text-gray-300">·</span>
                        {new Date(log.created_at).toLocaleString('vi-VN')}
                      </p>
                    </div>
                    {hasMeta && (
                      expanded ? <ChevronDown size={16} className="text-gray-400 flex-shrink-0" /> : <ChevronRight size={16} className="text-gray-400 flex-shrink-0" />
                    )}
                  </div>

                  {hasMeta && expanded && (
                    <pre className="mt-2 ml-9 bg-gray-50 rounded p-2 text-xs text-gray-700 overflow-x-auto">
                      {JSON.stringify(log.metadata, null, 2)}
                    </pre>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
