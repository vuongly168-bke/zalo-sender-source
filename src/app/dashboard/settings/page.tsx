'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getActiveClientWorkspace } from '@/lib/workspace-context-client'
import { API_KEY_LABELS, API_KEY_DESCRIPTIONS, API_KEY_GROUPS, KEYS_NEED_ACCOUNT_TOKEN, HIGHLIGHTED_KEYS } from '@/lib/types'
import {
  Phone, Plus, Trash2, Edit2, Check, X, Loader2, Settings, Power,
  KeyRound, ChevronRight, ChevronDown, AlertCircle, Save, Shield,
} from 'lucide-react'

interface ZaloAccountWithStats {
  id: string
  name: string
  phone_number: string | null
  description: string | null
  is_active: boolean
  configured_keys: number
  total_keys: number
  project_count: number
  created_at: string
}

export default function SettingsPage() {
  const supabase = createClient()
  const [workspaceId, setWorkspaceId] = useState('')
  const [zaloAccounts, setZaloAccounts] = useState<ZaloAccountWithStats[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null)

  // Permissions — fetch trực tiếp để tránh race condition của useUserRole
  const [perms, setPerms] = useState({ canEdit: false, canDelete: false })

  // Modal: tạo Zalo Account
  const [showCreate, setShowCreate] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createPhone, setCreatePhone] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const [creating, setCreating] = useState(false)
  const [createMsg, setCreateMsg] = useState('')

  const loadAccounts = useCallback(async (wsId: string) => {
    const { data, error } = await supabase.rpc('get_zalo_accounts_with_stats', { p_workspace_id: wsId })
    if (error) {
      console.error(error)
      setZaloAccounts([])
    } else {
      setZaloAccounts(data || [])
    }
  }, [supabase])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const [{ data: profile }, m] = await Promise.all([
        supabase.from('profiles').select('is_super_admin').eq('id', user.id).single(),
        getActiveClientWorkspace(supabase, user.id),
      ])

      const isSuperAdmin = !!profile?.is_super_admin
      const role = m?.role || null
      const isOwner = role === 'owner'
      const isAdmin = isOwner || role === 'admin'

      setPerms({
        canEdit: isAdmin || isSuperAdmin,
        canDelete: isOwner || isSuperAdmin,
      })

      if (m) {
        setWorkspaceId(m.workspace_id)
        await loadAccounts(m.workspace_id)
      }
      setLoading(false)
    }
    init()
  }, [supabase, loadAccounts])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    setCreateMsg('')
    const { data, error } = await supabase.rpc('create_zalo_account', {
      p_workspace_id: workspaceId,
      p_name: createName.trim(),
      p_phone_number: createPhone.trim() || null,
      p_description: createDesc.trim() || null,
    })
    if (error) {
      setCreateMsg('❌ ' + error.message)
    } else {
      await loadAccounts(workspaceId)
      setShowCreate(false)
      setCreateName('')
      setCreatePhone('')
      setCreateDesc('')
      setCreateMsg('')
      if (data) setSelectedAccountId(data)
    }
    setCreating(false)
  }

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] text-gray-500"><Loader2 className="animate-spin" /></div>
  }

  if (selectedAccountId) {
    return <ZaloAccountDetail
      accountId={selectedAccountId}
      onBack={() => { setSelectedAccountId(null); loadAccounts(workspaceId) }}
      canEdit={perms.canEdit}
      canDelete={perms.canDelete}
    />
  }

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <Settings className="text-blue-600" size={28} />
        <h1 className="text-2xl font-bold text-gray-900">Cài đặt API</h1>
      </div>
      <p className="text-gray-500">Quản lý các tài khoản Zalo và API keys của workspace</p>

      <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <p className="font-medium mb-1">💡 Cách hoạt động:</p>
        <p>Mỗi <strong>Zalo Account</strong> là 1 tài khoản Zalo riêng (vd: Chăm sóc, Chốt đơn, Nội bộ...). Mỗi cái có bộ <strong>6 API key</strong> riêng từ <a href="https://func.vn" target="_blank" rel="noopener" className="underline">func.vn</a>. Khi tạo dự án, bạn chọn dự án đó dùng Zalo nào để gửi.</p>
      </div>

      <div className="mt-6 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Zalo Accounts ({zaloAccounts.length})</h2>
        {perms.canEdit && (
          <button
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            <Plus size={16} />
            Thêm Zalo Account
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-3">
        {zaloAccounts.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <Phone size={40} className="mx-auto text-gray-300" />
            <p className="mt-3 text-gray-700 font-medium">Chưa có Zalo Account nào</p>
            <p className="text-sm text-gray-500 mt-1">Tạo Zalo Account đầu tiên để bắt đầu cấu hình API.</p>
            {perms.canEdit && (
              <button
                onClick={() => setShowCreate(true)}
                className="mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
              >
                + Tạo Zalo Account
              </button>
            )}
          </div>
        ) : zaloAccounts.map((acc) => {
          const fullyConfigured = acc.configured_keys === acc.total_keys
          return (
            <button
              key={acc.id}
              onClick={() => setSelectedAccountId(acc.id)}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-300 transition text-left flex items-center gap-4"
            >
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                acc.is_active ? 'bg-blue-100' : 'bg-gray-100'
              }`}>
                <Phone className={acc.is_active ? 'text-blue-600' : 'text-gray-400'} size={22} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-gray-900">{acc.name}</h3>
                  {!acc.is_active && (
                    <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">Tạm tắt</span>
                  )}
                  {fullyConfigured ? (
                    <span className="text-xs px-2 py-0.5 bg-green-100 text-green-700 rounded-full flex items-center gap-1">
                      <Check size={11} />Đầy đủ {acc.configured_keys}/{acc.total_keys} API
                    </span>
                  ) : (
                    <span className="text-xs px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full flex items-center gap-1">
                      <AlertCircle size={11} />{acc.configured_keys}/{acc.total_keys} API
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mt-1.5">
                  {acc.phone_number && <span>📞 {acc.phone_number}</span>}
                  <span>📂 {acc.project_count} dự án</span>
                </div>
                {acc.description && <p className="text-sm text-gray-600 mt-1.5 line-clamp-1">{acc.description}</p>}
              </div>

              <ChevronRight size={18} className="text-gray-400 flex-shrink-0" />
            </button>
          )
        })}
      </div>

      {/* MODAL: tạo Zalo Account */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900">Thêm Zalo Account</h3>
            <p className="text-sm text-gray-500 mt-1">1 tài khoản Zalo riêng với bộ API keys riêng</p>

            <form onSubmit={handleCreate} className="mt-5 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1.5">Tên *</label>
                <input
                  type="text"
                  value={createName}
                  onChange={(e) => setCreateName(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                  placeholder="VD: BKE Chăm sóc, BKE Chốt đơn, BKE Nội bộ"
                  required
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1.5">SĐT (tùy chọn)</label>
                <input
                  type="text"
                  value={createPhone}
                  onChange={(e) => setCreatePhone(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                  placeholder="VD: 0912345678"
                />
                <p className="text-xs text-gray-500 mt-1">SĐT của tài khoản Zalo này (để dễ phân biệt)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-800 mb-1.5">Mô tả (tùy chọn)</label>
                <input
                  type="text"
                  value={createDesc}
                  onChange={(e) => setCreateDesc(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-gray-900"
                  placeholder="VD: Dùng cho gửi tin chăm sóc khách hàng cũ"
                />
              </div>

              {createMsg && (
                <div className="bg-red-50 text-red-700 px-3 py-2 rounded-lg text-sm">{createMsg}</div>
              )}

              <div className="flex gap-3 justify-end pt-2">
                <button
                  type="button"
                  onClick={() => { setShowCreate(false); setCreateName(''); setCreatePhone(''); setCreateDesc(''); setCreateMsg('') }}
                  className="px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={creating || !createName.trim()}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
                >
                  {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                  Tạo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

// =================================================================
// Zalo Account Detail (form 6 API keys)
// =================================================================
function ZaloAccountDetail({
  accountId,
  onBack,
  canEdit,
  canDelete,
}: {
  accountId: string
  onBack: () => void
  canEdit: boolean
  canDelete: boolean
}) {
  const supabase = createClient()
  const [account, setAccount] = useState<{
    name: string
    phone_number: string | null
    description: string | null
    is_active: boolean
  } | null>(null)
  const [editingMeta, setEditingMeta] = useState(false)
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editActive, setEditActive] = useState(true)

  const [keys, setKeys] = useState<Record<string, {
    url: string
    token: string
    account_token?: string
    configured?: boolean
    accountTokenConfigured?: boolean
  }>>({})
  // Collapsible: mặc định mở section đầu tiên ('Gửi tin nhóm Zalo')
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    'Gửi tin nhóm Zalo': true,
    'Gửi tin cá nhân (SĐT)': false,
  })
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  const loadAll = useCallback(async () => {
    const { data: a } = await supabase.from('zalo_accounts').select('name, phone_number, description, is_active').eq('id', accountId).single()
    if (a) {
      setAccount(a)
      setEditName(a.name)
      setEditPhone(a.phone_number || '')
      setEditDesc(a.description || '')
      setEditActive(a.is_active)
    }

    if (!canEdit) {
      setKeys({})
      return
    }

    const response = await fetch(`/api/settings/api-keys?accountId=${encodeURIComponent(accountId)}`, {
      cache: 'no-store',
    })
    if (!response.ok) {
      setSavedMsg('❌ Không thể tải trạng thái API key')
      return
    }
    const payload = await response.json() as {
      keys?: Array<{
        keyType: string
        apiUrl: string
        hasBearerToken: boolean
        hasAccountToken: boolean
      }>
    }
    const map: Record<string, {
      url: string
      token: string
      account_token?: string
      configured?: boolean
      accountTokenConfigured?: boolean
    }> = {}
    for (const key of payload.keys ?? []) {
      map[key.keyType] = {
        url: key.apiUrl,
        token: '',
        account_token: '',
        configured: key.hasBearerToken,
        accountTokenConfigured: key.hasAccountToken,
      }
    }
    setKeys(map)
  }, [supabase, accountId, canEdit])

  useEffect(() => {
    async function load() {
      await loadAll()
    }
    void load()
  }, [loadAll])

  async function handleSaveMeta() {
    const { error } = await supabase.rpc('update_zalo_account', {
      p_zalo_account_id: accountId,
      p_name: editName.trim(),
      p_phone_number: editPhone.trim() || null,
      p_description: editDesc.trim() || null,
      p_is_active: editActive,
    })
    if (error) { alert('Lỗi: ' + error.message); return }
    setEditingMeta(false)
    await loadAll()
  }

  function updateKey(type: string, field: 'url' | 'token' | 'account_token', value: string) {
    setKeys((prev) => ({ ...prev, [type]: { ...prev[type], [field]: value } }))
  }

  async function handleSaveKeys() {
    setSaving(true)
    setSavedMsg('')
    const updates = Object.entries(keys)
      .filter(([, value]) => value.url.trim())
      .map(([keyType, value]) => ({
        keyType,
        apiUrl: value.url.trim(),
        bearerToken: value.token.trim(),
        accountToken: value.account_token?.trim() || undefined,
      }))
    if (updates.length === 0) {
      setSaving(false)
      setSavedMsg('Không có cấu hình cần lưu')
      return
    }

    const response = await fetch('/api/settings/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId, keys: updates }),
    })
    const payload = await response.json() as { error?: string }
    setSaving(false)
    if (!response.ok) {
      setSavedMsg('❌ ' + (payload.error || 'Không thể lưu API key'))
      return
    }
    setSavedMsg('✅ Đã lưu')
    await loadAll()
    setTimeout(() => setSavedMsg(''), 2500)
  }

  async function handleDeleteAccount() {
    if (!account) return
    const input = prompt(`Xóa Zalo Account "${account.name}"? Gõ tên để xác nhận:`)
    if (input !== account.name) {
      if (input !== null) alert('Tên không khớp.')
      return
    }
    const { error } = await supabase.rpc('delete_zalo_account', { p_zalo_account_id: accountId })
    if (error) { alert('Lỗi: ' + error.message); return }
    onBack()
  }

  if (!account) return <div className="flex items-center justify-center min-h-[60vh] text-gray-500"><Loader2 className="animate-spin" /></div>

  return (
    <div className="max-w-4xl">
      <button onClick={onBack} className="text-sm text-gray-600 hover:text-gray-900 mb-4 flex items-center gap-1.5">
        <ChevronRight className="rotate-180" size={16} />
        Quay lại danh sách Zalo Accounts
      </button>

      {/* Header */}
      <div className="flex items-start gap-4">
        <div className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${
          account.is_active ? 'bg-blue-100' : 'bg-gray-100'
        }`}>
          <Phone className={account.is_active ? 'text-blue-600' : 'text-gray-400'} size={26} />
        </div>
        <div className="flex-1 min-w-0">
          {!editingMeta ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{account.name}</h1>
                {!account.is_active && <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">Tạm tắt</span>}
              </div>
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-500 mt-1">
                {account.phone_number && <span>📞 {account.phone_number}</span>}
              </div>
              {account.description && <p className="text-sm text-gray-600 mt-1">{account.description}</p>}
            </>
          ) : (
            <div className="space-y-3">
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full px-3 py-2 border-2 border-blue-300 rounded-lg text-lg font-semibold text-gray-900"
                placeholder="Tên Zalo Account"
              />
              <input
                type="text"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm text-gray-900"
                placeholder="SĐT (tùy chọn)"
              />
              <input
                type="text"
                value={editDesc}
                onChange={(e) => setEditDesc(e.target.value)}
                className="w-full px-3 py-2 border-2 border-gray-200 rounded-lg text-sm text-gray-900"
                placeholder="Mô tả (tùy chọn)"
              />
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="checkbox" checked={editActive} onChange={(e) => setEditActive(e.target.checked)} />
                <Power size={14} />
                Đang hoạt động
              </label>
              <div className="flex gap-2">
                <button onClick={handleSaveMeta} className="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 flex items-center gap-1.5">
                  <Check size={14} />Lưu
                </button>
                <button onClick={() => setEditingMeta(false)} className="text-gray-600 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-100 flex items-center gap-1.5">
                  <X size={14} />Hủy
                </button>
              </div>
            </div>
          )}
        </div>
        {!editingMeta && canEdit && (
          <button
            onClick={() => setEditingMeta(true)}
            className="text-gray-400 hover:text-gray-700 p-2"
            title="Sửa thông tin"
          >
            <Edit2 size={16} />
          </button>
        )}
      </div>

      {/* API Keys form */}
      <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900">
        <p className="font-medium mb-1">📖 Hướng dẫn lấy API key:</p>
        <p>
          Đăng nhập <a href="https://func.vn" target="_blank" rel="noopener" className="underline">func.vn</a>
          {' '}→ <strong>Functions</strong> → copy <strong>API URL</strong>, <strong>API TOKEN</strong>,
          và <strong>Account Token</strong> (chỉ với 2 API <code className="bg-blue-100 px-1 rounded">GET_USER_INFO</code>,
          <code className="bg-blue-100 px-1 rounded">USER_SEND_*</code>).
        </p>
      </div>

      {API_KEY_GROUPS.map((group) => {
        const isOpen = openSections[group.title] ?? true
        const configuredCount = group.keys.filter(k => keys[k]?.configured || (keys[k]?.url && keys[k]?.token)).length
        return (
          <div key={group.title} className="mt-4">
            {/* Section header (clickable) */}
            <button
              type="button"
              onClick={() => setOpenSections(prev => ({ ...prev, [group.title]: !isOpen }))}
              className="w-full flex items-center gap-3 px-4 py-3 bg-white rounded-xl border border-gray-200 hover:bg-gray-50 transition"
            >
              <span className="text-xl">{group.icon}</span>
              <div className="flex-1 text-left">
                <h3 className="font-semibold text-gray-900">{group.title}</h3>
                <p className="text-xs text-gray-500 mt-0.5">{group.description}</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full font-medium ${
                configuredCount === group.keys.length
                  ? 'bg-green-100 text-green-700'
                  : 'bg-orange-100 text-orange-700'
              }`}>
                {configuredCount}/{group.keys.length}
              </span>
              {isOpen ? <ChevronDown size={18} className="text-gray-400" /> : <ChevronRight size={18} className="text-gray-400" />}
            </button>

            {isOpen && (
              <div className="mt-3 space-y-3">
                {group.keys.map((keyType, idx) => {
                  const needAccountToken = KEYS_NEED_ACCOUNT_TOKEN.includes(keyType)
                  const isHighlighted = HIGHLIGHTED_KEYS.includes(keyType)
                  return (
                    <div
                      key={keyType}
                      className={`rounded-xl border p-5 ${
                        isHighlighted
                          ? 'bg-blue-50 border-blue-300 ring-2 ring-blue-100'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-3 flex-wrap">
                        <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                          isHighlighted ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {idx + 1}
                        </span>
                        <KeyRound size={14} className={isHighlighted ? 'text-blue-700' : 'text-blue-600'} />
                        <h4 className={`font-mono font-bold text-sm tracking-wide ${
                          isHighlighted ? 'text-blue-900' : 'text-gray-900'
                        }`}>
                          {API_KEY_LABELS[keyType]}
                        </h4>
                        {isHighlighted && (
                          <span className="text-[10px] px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded font-medium">
                            ⭐ Cần cấu hình trước
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-gray-600 mb-3">{API_KEY_DESCRIPTIONS[keyType]}</p>

                      <div className="space-y-2">
                        {/* Order: URL → Account Token (nếu có) → API Token */}
                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">API URL</label>
                          <input
                            type="text"
                            value={keys[keyType]?.url || ''}
                            onChange={(e) => updateKey(keyType, 'url', e.target.value)}
                            disabled={!canEdit}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 disabled:bg-gray-50"
                            placeholder="https://public-api.func.vn/functions/..."
                          />
                        </div>

                        {/* Account Token: hiển thị TRƯỚC API Token theo yêu cầu cho user_* APIs */}
                        {needAccountToken && (
                          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                            <label className="text-xs text-purple-900 font-medium mb-1 flex items-center gap-1.5">
                              <Shield size={12} />
                              ACCOUNT TOKEN <span className="text-purple-600 font-normal">(header Account-Token)</span>
                            </label>
                            <input
                              type="password"
                              value={keys[keyType]?.account_token || ''}
                              onChange={(e) => updateKey(keyType, 'account_token', e.target.value)}
                              disabled={!canEdit}
                              className="w-full px-3 py-2 border border-purple-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none text-gray-900 disabled:bg-gray-50"
                            placeholder={keys[keyType]?.accountTokenConfigured
                              ? 'Đã lưu — nhập token mới nếu muốn thay'
                              : 'eyJhbGciOiJIUzI1NiIs... (Account Token của Zalo trên func.vn)'}
                            />
                            <p className="text-xs text-purple-700 mt-1">
                              API user của func.vn yêu cầu thêm token này (khác với API Token thường).
                            </p>
                          </div>
                        )}

                        <div>
                          <label className="block text-xs font-medium text-gray-700 mb-1">API TOKEN</label>
                          <input
                            type="password"
                            value={keys[keyType]?.token || ''}
                            onChange={(e) => updateKey(keyType, 'token', e.target.value)}
                            disabled={!canEdit}
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-gray-900 disabled:bg-gray-50"
                            placeholder={keys[keyType]?.configured
                              ? 'Đã lưu — nhập token mới nếu muốn thay'
                              : 'eyJhbGciOiJIUzI1NiIs... (API Token của function trên func.vn)'}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {canEdit && (
        <div className="mt-6 sticky bottom-4 z-10 flex items-center gap-3">
          <button
            onClick={handleSaveKeys}
            disabled={saving}
            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2 shadow-lg"
          >
            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
            {saving ? 'Đang lưu...' : 'Lưu API keys'}
          </button>
          {savedMsg && <span className="text-sm text-green-700 font-medium">{savedMsg}</span>}
        </div>
      )}

      {canDelete && (
        <div className="mt-12 bg-red-50 border border-red-200 rounded-xl p-5">
          <h3 className="font-semibold text-red-900 flex items-center gap-2">
            <Trash2 size={16} />Vùng nguy hiểm
          </h3>
          <p className="text-sm text-red-700 mt-1">
            Xóa Zalo Account này. Chỉ xóa được khi không có dự án nào đang dùng.
          </p>
          <button
            onClick={handleDeleteAccount}
            className="mt-3 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-red-700 flex items-center gap-2"
          >
            <Trash2 size={14} />Xóa Zalo Account
          </button>
        </div>
      )}
    </div>
  )
}
