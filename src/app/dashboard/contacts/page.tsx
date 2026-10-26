'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getActiveClientWorkspace } from '@/lib/workspace-context-client'
import {
  Users, Plus, Phone, Search, Trash2, Edit2, Loader2, Tag,
  Upload, Sparkles, X,
} from 'lucide-react'
import type { Contact, ZaloAccount } from '@/lib/types'
import { AddContactModal } from '@/components/contacts/add-contact-modal'
import { ImportContactsModal } from '@/components/contacts/import-contacts-modal'

type SortBy = 'created_desc' | 'name_asc' | 'phone_asc'

export default function ContactsPage() {
  const supabase = createClient()
  const [workspaceId, setWorkspaceId] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [zaloAccounts, setZaloAccounts] = useState<ZaloAccount[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState<string>('')
  const [sortBy, setSortBy] = useState<SortBy>('created_desc')

  const [showAdd, setShowAdd] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)

  // Bulk lookup state
  const [bulkLookupOpen, setBulkLookupOpen] = useState(false)
  const [bulkLookupZaloId, setBulkLookupZaloId] = useState('')
  const [bulkLookupRunning, setBulkLookupRunning] = useState(false)
  const [bulkProgress, setBulkProgress] = useState({ current: 0, total: 0, success: 0, failed: 0 })

  const loadContacts = useCallback(async (wsId: string) => {
    let query = supabase.from('contacts').select('*').eq('workspace_id', wsId)
    if (sortBy === 'created_desc') query = query.order('created_at', { ascending: false })
    if (sortBy === 'name_asc') query = query.order('name', { ascending: true, nullsFirst: false })
    if (sortBy === 'phone_asc') query = query.order('phone', { ascending: true })
    const { data } = await query
    setContacts(data || [])
  }, [supabase, sortBy])

  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const m = await getActiveClientWorkspace(supabase, user.id)
      if (m) {
        setWorkspaceId(m.workspace_id)
        await loadContacts(m.workspace_id)
        const { data: zas } = await supabase
          .from('zalo_accounts')
          .select('*')
          .eq('workspace_id', m.workspace_id)
          .eq('is_active', true)
        setZaloAccounts(zas || [])
      }
      setLoading(false)
    }
    init()
  }, [supabase, loadContacts])

  // Filter
  const filteredContacts = contacts.filter((c) => {
    if (search) {
      const q = search.toLowerCase()
      const matched = (c.name?.toLowerCase().includes(q))
        || c.phone.includes(search)
        || c.notes?.toLowerCase().includes(q)
      if (!matched) return false
    }
    if (tagFilter && !c.tags.includes(tagFilter)) return false
    return true
  })

  // All unique tags
  const allTags = Array.from(new Set(contacts.flatMap(c => c.tags))).sort()

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Xóa khách hàng "${name}"?`)) return
    await supabase.from('contacts').delete().eq('id', id)
    await loadContacts(workspaceId)
  }

  // Bulk lookup tên cho mọi contact chưa có name hoặc chưa có zalo_user_id
  async function handleBulkLookup() {
    if (!bulkLookupZaloId) { alert('Chọn Zalo Account để lookup'); return }
    const targets = contacts.filter(c => !c.name || !c.zalo_user_id)
    if (targets.length === 0) {
      alert('Tất cả khách đã có tên + đã liên kết Zalo. Không cần lookup.')
      return
    }
    if (!confirm(`Sẽ lookup ${targets.length} khách hàng từ Zalo. Mất ~${Math.round(targets.length * 0.5)}s. Tiếp tục?`)) return

    setBulkLookupRunning(true)
    setBulkProgress({ current: 0, total: targets.length, success: 0, failed: 0 })

    let success = 0
    let failed = 0

    for (let i = 0; i < targets.length; i++) {
      const c = targets[i]
      try {
        const res = await fetch('/api/zalo/user-info', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: c.phone, zaloAccountId: bulkLookupZaloId }),
        })
        const data = await res.json()
        if (!data.error && (data.userName || data.userId)) {
          await supabase.from('contacts').update({
            name: data.userName || c.name,
            zalo_user_id: data.userId || c.zalo_user_id,
            last_synced_at: new Date().toISOString(),
          }).eq('id', c.id)
          success++
        } else {
          failed++
        }
      } catch {
        failed++
      }
      setBulkProgress({ current: i + 1, total: targets.length, success, failed })
      await new Promise(r => setTimeout(r, 500)) // rate limit buffer
    }

    setBulkLookupRunning(false)
    await loadContacts(workspaceId)
    setTimeout(() => setBulkLookupOpen(false), 2500)
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-gray-500"><Loader2 className="animate-spin" /></div>

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Users className="text-blue-600" size={28} />
            <h1 className="text-2xl font-bold text-gray-900">Khách hàng</h1>
          </div>
          <p className="text-gray-500">Quản lý danh sách SĐT khách hàng để gửi tin cá nhân</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          {contacts.some(c => !c.name || !c.zalo_user_id) && zaloAccounts.length > 0 && (
            <button
              onClick={() => { setBulkLookupZaloId(zaloAccounts[0]?.id || ''); setBulkLookupOpen(true) }}
              className="flex items-center gap-2 bg-purple-50 border border-purple-200 text-purple-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-purple-100 transition"
              title="Tự động lấy tên Zalo cho mọi khách thiếu tên"
            >
              <Sparkles size={16} />
              Lookup tên Zalo
            </button>
          )}
          <button
            onClick={() => setShowImport(true)}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            <Upload size={16} />
            Import Excel/CSV
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
          >
            <Plus size={16} />
            Thêm khách hàng
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="mt-6 bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex gap-3 flex-wrap">
          <div className="flex-1 min-w-[200px] relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              placeholder="Tìm theo tên, SĐT, ghi chú..."
            />
          </div>
          {allTags.length > 0 && (
            <select
              value={tagFilter}
              onChange={(e) => setTagFilter(e.target.value)}
              className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900"
            >
              <option value="">Tất cả tags</option>
              {allTags.map(t => <option key={t} value={t}>🏷️ {t}</option>)}
            </select>
          )}
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortBy)}
            className="px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900"
          >
            <option value="created_desc">Mới nhất</option>
            <option value="name_asc">Tên A→Z</option>
            <option value="phone_asc">SĐT tăng dần</option>
          </select>
        </div>
        <p className="text-xs text-gray-500 mt-3">
          Hiển thị <strong>{filteredContacts.length}</strong> / {contacts.length} khách hàng
        </p>
      </div>

      {/* List */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200">
        {filteredContacts.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={48} className="mx-auto text-gray-300" />
            <p className="mt-3 text-gray-700 font-medium">
              {contacts.length === 0 ? 'Chưa có khách hàng nào' : 'Không tìm thấy khách hàng phù hợp'}
            </p>
            {contacts.length === 0 && (
              <div className="mt-4 flex gap-2 justify-center">
                <button
                  onClick={() => setShowAdd(true)}
                  className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  + Thêm khách đầu tiên
                </button>
                <button
                  onClick={() => setShowImport(true)}
                  className="bg-white border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50"
                >
                  📤 Import Excel
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-100">
            {filteredContacts.map((c) => (
              <div key={c.id} className="flex items-center gap-4 p-4 hover:bg-gray-50 transition">
                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-semibold flex-shrink-0">
                  {(c.name || c.phone).slice(0, 1).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-medium text-gray-900 truncate">
                      {c.name || <span className="text-gray-400 italic">Chưa có tên</span>}
                    </p>
                    {c.zalo_user_id && (
                      <span className="text-xs px-1.5 py-0.5 bg-green-100 text-green-700 rounded">✓ Có Zalo</span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500 mt-0.5">
                    <span className="flex items-center gap-1"><Phone size={12} />{c.phone}</span>
                    {c.tags.length > 0 && (
                      <span className="flex items-center gap-1.5">
                        <Tag size={12} />
                        {c.tags.map(t => (
                          <span key={t} className="px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded text-xs">{t}</span>
                        ))}
                      </span>
                    )}
                  </div>
                  {c.notes && <p className="text-xs text-gray-500 mt-1 line-clamp-1">📝 {c.notes}</p>}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditingContact(c)}
                    className="text-gray-400 hover:text-blue-600 p-2 transition"
                    title="Sửa"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    onClick={() => handleDelete(c.id, c.name || c.phone)}
                    className="text-gray-400 hover:text-red-500 p-2 transition"
                    title="Xóa"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modals */}
      {showAdd && (
        <AddContactModal
          workspaceId={workspaceId}
          zaloAccounts={zaloAccounts}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); loadContacts(workspaceId) }}
        />
      )}
      {editingContact && (
        <AddContactModal
          workspaceId={workspaceId}
          zaloAccounts={zaloAccounts}
          editing={editingContact}
          onClose={() => setEditingContact(null)}
          onSaved={() => { setEditingContact(null); loadContacts(workspaceId) }}
        />
      )}
      {showImport && (
        <ImportContactsModal
          workspaceId={workspaceId}
          zaloAccounts={zaloAccounts}
          onClose={() => setShowImport(false)}
          onSaved={() => { setShowImport(false); loadContacts(workspaceId) }}
        />
      )}

      {/* Bulk Lookup Modal */}
      {bulkLookupOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Sparkles size={20} className="text-purple-600" />
                Lookup tên Zalo hàng loạt
              </h3>
              <button
                onClick={() => !bulkLookupRunning && setBulkLookupOpen(false)}
                disabled={bulkLookupRunning}
                className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
              >
                <X size={20} />
              </button>
            </div>

            {!bulkLookupRunning && bulkProgress.current === 0 && (
              <>
                <div className="bg-purple-50 border border-purple-200 rounded-lg p-4 mb-4 text-sm">
                  <p className="text-purple-900">
                    Hệ thống sẽ gọi API <code className="bg-purple-100 px-1 rounded text-xs">get_user_info</code> cho <strong>{contacts.filter(c => !c.name || !c.zalo_user_id).length}</strong> khách thiếu tên hoặc thiếu Zalo User ID.
                  </p>
                  <p className="text-purple-700 mt-1.5 text-xs">
                    Chậm ~0.5s/khách. Số chưa có Zalo sẽ bị bỏ qua (không bị xóa).
                  </p>
                </div>

                <label className="block text-sm font-medium text-gray-800 mb-1.5">Lookup từ Zalo Account:</label>
                <select
                  value={bulkLookupZaloId}
                  onChange={(e) => setBulkLookupZaloId(e.target.value)}
                  className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-purple-500 focus:border-purple-500 outline-none"
                >
                  <option value="">-- Chọn --</option>
                  {zaloAccounts.map(za => (
                    <option key={za.id} value={za.id}>
                      {za.name}{za.phone_number ? ` (${za.phone_number})` : ''}
                    </option>
                  ))}
                </select>

                <div className="mt-5 flex gap-3 justify-end">
                  <button
                    onClick={() => setBulkLookupOpen(false)}
                    className="px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
                  >
                    Hủy
                  </button>
                  <button
                    onClick={handleBulkLookup}
                    disabled={!bulkLookupZaloId}
                    className="bg-purple-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    <Sparkles size={14} />
                    Bắt đầu lookup
                  </button>
                </div>
              </>
            )}

            {bulkLookupRunning && (
              <div className="text-center py-4">
                <Loader2 className="mx-auto animate-spin text-purple-600" size={36} />
                <p className="mt-3 text-gray-900 font-medium">Đang lookup...</p>
                <p className="text-sm text-gray-500 mt-1">{bulkProgress.current} / {bulkProgress.total}</p>
                <div className="mt-4 bg-gray-200 rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-purple-600 transition-all"
                    style={{ width: `${(bulkProgress.current / bulkProgress.total) * 100}%` }}
                  />
                </div>
                <div className="mt-3 flex justify-center gap-4 text-sm">
                  <span className="text-green-700">✓ {bulkProgress.success}</span>
                  <span className="text-orange-700">✗ {bulkProgress.failed} (không có Zalo)</span>
                </div>
              </div>
            )}

            {!bulkLookupRunning && bulkProgress.current > 0 && (
              <div className="text-center py-4">
                <div className="text-5xl mb-2">✅</div>
                <p className="text-lg font-semibold text-gray-900">Xong!</p>
                <p className="text-sm text-gray-600 mt-1">
                  Đã cập nhật <strong className="text-green-700">{bulkProgress.success}</strong> khách hàng
                </p>
                {bulkProgress.failed > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    {bulkProgress.failed} khách bị bỏ qua (chưa có Zalo hoặc thông tin riêng tư)
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
