'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { X, Phone, Loader2, Check, Sparkles, AlertCircle } from 'lucide-react'
import type { Contact, ZaloAccount } from '@/lib/types'

interface Props {
  workspaceId: string
  zaloAccounts: ZaloAccount[]
  editing?: Contact
  onClose: () => void
  onSaved: () => void
}

export function AddContactModal({ workspaceId, zaloAccounts, editing, onClose, onSaved }: Props) {
  const supabase = createClient()
  const [phone, setPhone] = useState(editing?.phone || '')
  const [name, setName] = useState(editing?.name || '')
  const [tagsStr, setTagsStr] = useState((editing?.tags || []).join(', '))
  const [notes, setNotes] = useState(editing?.notes || '')
  const [zaloUserId, setZaloUserId] = useState(editing?.zalo_user_id || '')

  const [lookupZaloId, setLookupZaloId] = useState(zaloAccounts[0]?.id || '')
  const [looking, setLooking] = useState(false)
  const [lookupMsg, setLookupMsg] = useState('')

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleLookup() {
    if (!phone.trim()) { setLookupMsg('❌ Cần nhập SĐT trước'); return }
    if (!lookupZaloId) { setLookupMsg('❌ Cần chọn Zalo Account để lookup'); return }
    setLooking(true)
    setLookupMsg('')

    try {
      const res = await fetch('/api/zalo/user-info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, zaloAccountId: lookupZaloId }),
      })
      const data = await res.json()
      if (data.error) {
        const errMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error)
        setLookupMsg('❌ ' + errMsg)
      } else {
        if (data.userName) setName(data.userName)
        if (data.userId) setZaloUserId(data.userId)
        if (data.normalizedPhone) setPhone(data.normalizedPhone)
        setLookupMsg(`✅ Đã lấy: ${data.userName || '(không có tên)'}`)
      }
    } catch (e) {
      setLookupMsg('❌ Lỗi: ' + (e as Error).message)
    }
    setLooking(false)
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!phone.trim()) { setError('Cần nhập SĐT'); return }
    setSaving(true)
    setError('')

    const tags = tagsStr.split(',').map(t => t.trim()).filter(Boolean)

    const payload = {
      workspace_id: workspaceId,
      phone: phone.trim(),
      name: name.trim() || null,
      zalo_user_id: zaloUserId.trim() || null,
      tags,
      notes: notes.trim() || null,
      last_synced_at: zaloUserId ? new Date().toISOString() : null,
    }

    if (editing) {
      const { error: e } = await supabase.from('contacts').update(payload).eq('id', editing.id)
      if (e) { setError(e.message); setSaving(false); return }
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      const { error: e } = await supabase.from('contacts').insert({ ...payload, created_by: user!.id })
      if (e) {
        if (e.code === '23505') setError('SĐT này đã có trong danh sách')
        else setError(e.message)
        setSaving(false)
        return
      }
    }

    onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-white">
          <h3 className="text-lg font-semibold text-gray-900">
            {editing ? 'Sửa khách hàng' : 'Thêm khách hàng mới'}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-700">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSave} className="p-6 space-y-4">
          {/* Phone + lookup */}
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1.5">
              SĐT <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <Phone size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm font-mono text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
                  placeholder="0901234567"
                  required
                />
              </div>
              <button
                type="button"
                onClick={handleLookup}
                disabled={looking || !phone.trim()}
                className="bg-purple-600 text-white px-3 py-2 rounded-lg text-sm font-medium hover:bg-purple-700 transition disabled:opacity-50 flex items-center gap-1.5 whitespace-nowrap"
                title="Tự động lấy tên từ API Zalo"
              >
                {looking ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                Lấy tên
              </button>
            </div>

            {/* Lookup config */}
            <div className="mt-2 flex gap-2 items-center">
              <label className="text-xs text-gray-500">Lookup từ:</label>
              <select
                value={lookupZaloId}
                onChange={(e) => setLookupZaloId(e.target.value)}
                className="text-xs px-2 py-1 border border-gray-300 rounded text-gray-900 flex-1"
              >
                <option value="">-- Chọn Zalo Account --</option>
                {zaloAccounts.map(za => (
                  <option key={za.id} value={za.id}>
                    {za.name}{za.phone_number ? ` (${za.phone_number})` : ''}
                  </option>
                ))}
              </select>
            </div>
            {lookupMsg && (
              <p className={`text-xs mt-2 ${lookupMsg.startsWith('✅') ? 'text-green-700' : 'text-red-600'}`}>
                {lookupMsg}
              </p>
            )}
          </div>

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1.5">Tên (tùy chọn)</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="VD: Anh Nam, Chị Hoa..."
            />
            <p className="text-xs text-gray-500 mt-1">Để trống → bấm &quot;Lấy tên&quot; sẽ tự fill</p>
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1.5">Tags (cách nhau bởi dấu phẩy)</label>
            <input
              type="text"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="VIP, Khách mới, T5-2026"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1.5">Ghi chú</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-none"
              placeholder="VD: Sinh nhật 15/3, đã chốt khóa CK3H..."
            />
          </div>

          {/* Zalo User ID (auto fill khi lookup) */}
          {zaloUserId && (
            <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm text-green-900">
              <p className="font-medium flex items-center gap-1.5">
                <Check size={14} />Đã liên kết Zalo
              </p>
              <p className="font-mono text-xs mt-1">User ID: {zaloUserId}</p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded-lg text-sm flex items-start gap-2">
              <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          <div className="flex gap-3 justify-end pt-2 border-t border-gray-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-100"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={saving || !phone.trim()}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50 flex items-center gap-2"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {editing ? 'Cập nhật' : 'Thêm'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
