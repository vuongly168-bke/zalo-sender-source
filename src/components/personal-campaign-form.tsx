'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getActiveClientWorkspace } from '@/lib/workspace-context-client'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Send, Save, Image as ImageIcon, X, Search,
  Loader2, AlertCircle, Phone, Eye, Edit2,
} from 'lucide-react'
import Link from 'next/link'
import type { Contact, ZaloAccount } from '@/lib/types'
import { uploadImageToR2 } from '@/lib/upload-image'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024

interface Props {
  mode: 'create' | 'edit'
  campaignId?: string  // for edit mode
  fromCampaignId?: string  // for create mode (copy from)
}

export function PersonalCampaignForm({ mode, campaignId, fromCampaignId }: Props) {
  const supabase = createClient()
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [workspaceId, setWorkspaceId] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [zaloAccounts, setZaloAccounts] = useState<ZaloAccount[]>([])

  // Form state
  const [name, setName] = useState('')
  const [zaloAccountId, setZaloAccountId] = useState('')
  const [message, setMessage] = useState('')
  const MAX_IMAGES = 5
  const [imageUrls, setImageUrls] = useState<string[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  // Defaults an toàn (giảm xuống để tránh Zalo block):
  // - 5 người/batch (trước: 20)
  // - 10 phút delay giữa batch (trước: 5)
  // - 3s delay giữa mỗi tin trong cùng 1 batch (trước: 1s cố định)
  const [batchSize, setBatchSize] = useState(5)
  const [batchDelay, setBatchDelay] = useState(10)
  const [messageDelay, setMessageDelay] = useState(3)

  const defaultSchedule = useState(() => {
    const now = new Date(Date.now() + 10 * 60 * 1000)
    const yyyy = now.getFullYear()
    const mm = String(now.getMonth() + 1).padStart(2, '0')
    const dd = String(now.getDate()).padStart(2, '0')
    const hh = String(now.getHours()).padStart(2, '0')
    const mi = String(now.getMinutes()).padStart(2, '0')
    return { date: `${yyyy}-${mm}-${dd}`, time: `${hh}:${mi}` }
  })[0]
  const [scheduledDate, setScheduledDate] = useState(defaultSchedule.date)
  const [scheduledTime, setScheduledTime] = useState(defaultSchedule.time)

  // Filters for contacts
  const [search, setSearch] = useState('')
  const [tagFilter, setTagFilter] = useState('')
  const [onlyWithZalo, setOnlyWithZalo] = useState(true)

  // UI state
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [loadedEdit, setLoadedEdit] = useState(mode === 'create' && !fromCampaignId)

  const loadAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const m = await getActiveClientWorkspace(supabase, user.id)
    if (!m) return
    setWorkspaceId(m.workspace_id)

    const [{ data: cs }, { data: zas }] = await Promise.all([
      supabase.from('contacts').select('*').eq('workspace_id', m.workspace_id).order('created_at', { ascending: false }),
      supabase.from('zalo_accounts').select('*').eq('workspace_id', m.workspace_id).eq('is_active', true),
    ])
    setContacts(cs || [])
    setZaloAccounts(zas || [])
    if (mode === 'create' && zas && zas.length > 0 && !zaloAccountId) setZaloAccountId(zas[0].id)
  }, [supabase, zaloAccountId, mode])

  // Load existing campaign data for edit mode or copy mode
  const loadExisting = useCallback(async () => {
    const sourceId = mode === 'edit' ? campaignId : fromCampaignId
    if (!sourceId) return

    const { data: camp } = await supabase
      .from('personal_campaigns')
      .select('*')
      .eq('id', sourceId)
      .single()
    if (!camp) { setError('Không tìm thấy đợt gửi'); setLoadedEdit(true); return }

    setName(mode === 'edit' ? camp.name : `${camp.name} (copy)`)
    setZaloAccountId(camp.zalo_account_id || '')
    setMessage(camp.message || '')
    const urls: string[] = Array.isArray(camp.image_urls) && camp.image_urls.length > 0
      ? camp.image_urls
      : (camp.image_url ? [camp.image_url] : [])
    setImageUrls(urls)
    setBatchSize(camp.batch_size)
    setBatchDelay(camp.batch_delay_minutes)
    if (camp.message_delay_seconds) setMessageDelay(camp.message_delay_seconds)

    // Edit mode: load thời gian cũ. Copy mode: giữ default (now + 10 phút)
    if (mode === 'edit' && camp.scheduled_at) {
      const d = new Date(camp.scheduled_at)
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const hh = String(d.getHours()).padStart(2, '0')
      const mi = String(d.getMinutes()).padStart(2, '0')
      setScheduledDate(`${yyyy}-${mm}-${dd}`)
      setScheduledTime(`${hh}:${mi}`)
    }

    // Load recipients
    const { data: recs } = await supabase
      .from('personal_campaign_recipients')
      .select('contact_id')
      .eq('campaign_id', sourceId)
    if (recs) setSelectedIds(new Set(recs.map(r => r.contact_id)))

    setLoadedEdit(true)
  }, [supabase, mode, campaignId, fromCampaignId])

  useEffect(() => { loadAll() }, [loadAll])
  useEffect(() => { loadExisting() }, [loadExisting])

  const filteredContacts = contacts.filter(c => {
    if (onlyWithZalo && !c.zalo_user_id) return false
    if (search) {
      const q = search.toLowerCase()
      if (!c.name?.toLowerCase().includes(q) && !c.phone.includes(search)) return false
    }
    if (tagFilter && !c.tags.includes(tagFilter)) return false
    return true
  })

  const allTags = Array.from(new Set(contacts.flatMap(c => c.tags))).sort()

  const isPastTime = (() => {
    if (!scheduledDate || !scheduledTime) return false
    const parsed = new Date(`${scheduledDate}T${scheduledTime}:00`)
    return parsed.getTime() <= Date.now() - 30 * 1000
  })()

  function toggleContact(id: string) {
    setSelectedIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) newSet.delete(id)
      else newSet.add(id)
      return newSet
    })
  }

  function toggleAllFiltered() {
    if (filteredContacts.every(c => selectedIds.has(c.id))) {
      setSelectedIds(prev => {
        const newSet = new Set(prev)
        filteredContacts.forEach(c => newSet.delete(c.id))
        return newSet
      })
    } else {
      setSelectedIds(prev => {
        const newSet = new Set(prev)
        filteredContacts.forEach(c => newSet.add(c.id))
        return newSet
      })
    }
  }

  async function handleImageUpload(files: FileList | File[]) {
    const filesArr = Array.from(files)
    if (imageUrls.length + filesArr.length > MAX_IMAGES) {
      setError(`Tối đa ${MAX_IMAGES} ảnh / đợt. Bạn có ${imageUrls.length} ảnh rồi.`)
      return
    }
    setUploading(true); setError('')
    const newUrls: string[] = []
    try {
      for (const file of filesArr) {
        if (!file.type.startsWith('image/')) { setError(`"${file.name}" không phải ảnh`); continue }
        if (file.size > MAX_IMAGE_BYTES) {
          setError(`"${file.name}" quá 10MB, bỏ qua`); continue
        }
        try {
          const { url } = await uploadImageToR2(file)
          newUrls.push(url)
        } catch (err) {
          setError(`Upload "${file.name}" thất bại: ` + (err as Error).message)
        }
      }
    } finally {
      if (newUrls.length > 0) setImageUrls(prev => [...prev, ...newUrls])
      setUploading(false)
    }
  }

  function removeImage(idx: number) {
    setImageUrls(prev => prev.filter((_, i) => i !== idx))
  }

  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) {
          const ext = item.type.split('/')[1] || 'png'
          files.push(new File([f], `paste-${Date.now()}.${ext}`, { type: item.type }))
        }
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      handleImageUpload(files)
    }
  }

  function renderPreview(template: string, contact: Contact): string {
    return template
      .replace(/\{ten\}/gi, contact.name || 'Anh/chị')
      .replace(/\{name\}/gi, contact.name || 'Anh/chị')
      .replace(/\{sdt\}/gi, contact.phone)
      .replace(/\{phone\}/gi, contact.phone)
  }

  function insertPlaceholder(placeholder: string) { setMessage(m => m + placeholder) }

  async function handleSave(status: 'draft' | 'scheduled') {
    if (!name.trim()) { setError('Nhập tên đợt gửi'); return }
    if (!zaloAccountId) { setError('Chọn Zalo Account'); return }
    if (!message.trim() && imageUrls.length === 0) { setError('Nhập nội dung hoặc đính kèm ảnh'); return }
    if (selectedIds.size === 0) { setError('Chọn ít nhất 1 khách hàng'); return }
    if (batchSize < 1 || batchSize > 100) { setError('Batch size: 1-100'); return }
    if (batchDelay < 1 || batchDelay > 120) { setError('Delay batch: 1-120 phút'); return }
    if (messageDelay < 1 || messageDelay > 30) { setError('Delay tin: 1-30 giây'); return }
    if (status === 'scheduled' && (!scheduledDate || !scheduledTime)) {
      setError('Chọn thời gian gửi'); return
    }

    let scheduledAt: string | null = null
    if (scheduledDate && scheduledTime) {
      const parsed = new Date(`${scheduledDate}T${scheduledTime}:00`)
      if (Number.isNaN(parsed.getTime())) { setError('Thời gian không hợp lệ'); return }
      if (parsed.getTime() <= Date.now() - 30 * 1000) {
        setError('⏰ Thời gian gửi đang ở quá khứ'); return
      }
      scheduledAt = parsed.toISOString()
    }

    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()
    const idsArr = Array.from(selectedIds)

    if (mode === 'edit' && campaignId) {
      // EDIT mode: update campaign + replace recipients
      const basePayload = {
        name,
        zalo_account_id: zaloAccountId,
        message: message || null,
        image_url: imageUrls[0] || null,
        scheduled_at: scheduledAt,
        batch_size: batchSize,
        batch_delay_minutes: batchDelay,
        message_delay_seconds: messageDelay,
        status,
        // Reset progress khi edit
        current_batch: 0,
        last_batch_sent_at: null,
      }
      // Thử update với image_urls + message_delay_seconds. Nếu cột nào chưa tồn tại thì retry bỏ field đó.
      let upErr = (await supabase
        .from('personal_campaigns')
        .update({ ...basePayload, image_urls: imageUrls })
        .eq('id', campaignId)).error
      if (upErr && upErr.message.includes('message_delay_seconds')) {
        const { message_delay_seconds: _mds, ...payloadWithoutMsgDelay } = basePayload
        void _mds
        upErr = (await supabase.from('personal_campaigns')
          .update({ ...payloadWithoutMsgDelay, image_urls: imageUrls })
          .eq('id', campaignId)).error
      }
      if (upErr && upErr.message.includes('image_urls')) {
        upErr = (await supabase.from('personal_campaigns').update(basePayload).eq('id', campaignId)).error
        if (upErr && upErr.message.includes('message_delay_seconds')) {
          const { message_delay_seconds: _mds, ...payloadMin } = basePayload
          void _mds
          upErr = (await supabase.from('personal_campaigns').update(payloadMin).eq('id', campaignId)).error
        }
        if (!upErr && imageUrls.length > 1) {
          setError('⚠️ Đã lưu nhưng chỉ ảnh đầu tiên được giữ. Vui lòng chạy SQL v2-multi-images.sql để hỗ trợ nhiều ảnh.')
        }
      }
      if (upErr) { setError('Lỗi: ' + upErr.message); setSaving(false); return }

      // Replace recipients: delete + insert
      await supabase.from('personal_campaign_recipients').delete().eq('campaign_id', campaignId)
      const recipients = idsArr.map((cid, i) => ({
        campaign_id: campaignId,
        contact_id: cid,
        batch_number: Math.floor(i / batchSize) + 1,
        status: 'pending',
      }))
      for (let i = 0; i < recipients.length; i += 500) {
        await supabase.from('personal_campaign_recipients').insert(recipients.slice(i, i + 500))
      }

      router.push(`/dashboard/personal-campaigns/${campaignId}`)
      router.refresh()
    } else {
      // CREATE mode
      const baseInsert = {
        workspace_id: workspaceId,
        zalo_account_id: zaloAccountId,
        name,
        message: message || null,
        image_url: imageUrls[0] || null,
        scheduled_at: scheduledAt,
        batch_size: batchSize,
        batch_delay_minutes: batchDelay,
        message_delay_seconds: messageDelay,
        status,
        created_by: user!.id,
      }
      let { data: camp, error: campErr } = await supabase
        .from('personal_campaigns')
        .insert({ ...baseInsert, image_urls: imageUrls })
        .select()
        .single()
      // Fallback nếu cột message_delay_seconds chưa tồn tại
      if (campErr && campErr.message.includes('message_delay_seconds')) {
        const { message_delay_seconds: _mds, ...withoutMsgDelay } = baseInsert
        void _mds
        const retry = await supabase.from('personal_campaigns')
          .insert({ ...withoutMsgDelay, image_urls: imageUrls })
          .select().single()
        camp = retry.data
        campErr = retry.error
      }
      if (campErr && campErr.message.includes('image_urls')) {
        const retry = await supabase.from('personal_campaigns').insert(baseInsert).select().single()
        camp = retry.data
        campErr = retry.error
        if (campErr && campErr.message.includes('message_delay_seconds')) {
          const { message_delay_seconds: _mds, ...payloadMin } = baseInsert
          void _mds
          const retry2 = await supabase.from('personal_campaigns').insert(payloadMin).select().single()
          camp = retry2.data
          campErr = retry2.error
        }
        if (!campErr && imageUrls.length > 1) {
          alert('⚠️ Chỉ ảnh đầu tiên được lưu. Vui lòng chạy SQL v2-multi-images.sql để hỗ trợ nhiều ảnh.')
        }
      }
      if (campErr || !camp) { setError('Lỗi: ' + campErr?.message); setSaving(false); return }

      const recipients = idsArr.map((cid, i) => ({
        campaign_id: camp.id,
        contact_id: cid,
        batch_number: Math.floor(i / batchSize) + 1,
        status: 'pending',
      }))

      for (let i = 0; i < recipients.length; i += 500) {
        await supabase.from('personal_campaign_recipients').insert(recipients.slice(i, i + 500))
      }

      router.push(`/dashboard/personal-campaigns/${camp.id}`)
      router.refresh()
    }
  }

  if (!loadedEdit) {
    return <div className="text-center py-20 text-gray-500"><Loader2 className="animate-spin mx-auto" /></div>
  }

  const selectedContacts = contacts.filter(c => selectedIds.has(c.id))
  const totalBatches = Math.ceil(selectedIds.size / batchSize)
  const totalTime = totalBatches > 0 ? (totalBatches - 1) * batchDelay : 0
  const previewContact = selectedContacts[0] || contacts[0]
  const isEdit = mode === 'edit'

  return (
    <div className="max-w-4xl">
      <Link
        href={isEdit && campaignId ? `/dashboard/personal-campaigns/${campaignId}` : '/dashboard/personal-campaigns'}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition mb-4"
      >
        <ArrowLeft size={16} />Quay lại
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        {isEdit ? <Edit2 size={22} /> : <Send size={22} />}
        {isEdit ? 'Sửa đợt gửi cá nhân' : 'Tạo đợt gửi cá nhân'}
      </h1>
      <p className="text-gray-500 mt-1">Gửi tin nhắn hàng loạt theo SĐT với batch + delay tránh spam</p>

      <div className="mt-6 space-y-6">
        {/* 1. Tên + Zalo Account */}
        <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1.5">Tên đợt gửi *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
              placeholder="VD: CSKH tháng 5, Khuyến mãi K29..."
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-800 mb-1.5">Gửi từ Zalo Account *</label>
            <select
              value={zaloAccountId}
              onChange={(e) => setZaloAccountId(e.target.value)}
              className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm text-gray-900"
            >
              <option value="">-- Chọn --</option>
              {zaloAccounts.map(za => (
                <option key={za.id} value={za.id}>
                  {za.name}{za.phone_number ? ` (${za.phone_number})` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* 2. Nội dung tin nhắn + placeholders */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
            <label className="block text-sm font-medium text-gray-800">Nội dung tin nhắn</label>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={() => insertPlaceholder('{ten}')}
                className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-2 py-1 rounded hover:bg-purple-100"
              >+ {'{ten}'}</button>
              <button
                type="button"
                onClick={() => insertPlaceholder('{sdt}')}
                className="text-xs bg-purple-50 border border-purple-200 text-purple-700 px-2 py-1 rounded hover:bg-purple-100"
              >+ {'{sdt}'}</button>
              {message && previewContact && (
                <button
                  type="button"
                  onClick={() => setShowPreview(!showPreview)}
                  className="text-xs bg-blue-50 border border-blue-200 text-blue-700 px-2 py-1 rounded hover:bg-blue-100 flex items-center gap-1"
                >
                  <Eye size={11} />Preview
                </button>
              )}
            </div>
          </div>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={6}
            className="w-full px-3 py-2.5 border-2 border-gray-200 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none resize-y"
            placeholder="VD: Chào {ten}, BKE Team gửi anh/chị lịch học tuần này..."
          />
          <p className="text-xs text-gray-500 mt-1">
            {message.length} ký tự · Dùng <code className="bg-gray-100 px-1 rounded">{'{ten}'}</code>, <code className="bg-gray-100 px-1 rounded">{'{sdt}'}</code> để cá nhân hóa
          </p>

          {showPreview && previewContact && (
            <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-900 font-medium mb-1">Preview với {previewContact.name || previewContact.phone}:</p>
              <p className="text-sm text-blue-900 whitespace-pre-wrap">{renderPreview(message, previewContact)}</p>
            </div>
          )}
        </div>

        {/* 3. Ảnh đính kèm - multi */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-800 mb-2">
            Ảnh đính kèm (tùy chọn) — {imageUrls.length}/{MAX_IMAGES}
          </label>

          {imageUrls.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-3">
              {imageUrls.map((url, i) => (
                <div key={i} className="relative group aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Ảnh ${i + 1}`} className="w-full h-full object-cover rounded-lg border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600"
                  ><X size={14} /></button>
                  <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">{i + 1}</span>
                </div>
              ))}
            </div>
          )}

          {imageUrls.length < MAX_IMAGES && (
            <div
              onClick={() => fileInputRef.current?.click()}
              onPaste={handlePaste}
              tabIndex={0}
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 focus:border-blue-500 focus:bg-blue-50 focus:outline-none transition"
              title="Click để chọn hoặc bấm vào vùng này rồi Ctrl+V để dán"
            >
              {uploading ? (
                <Loader2 className="mx-auto animate-spin text-blue-600" size={28} />
              ) : (
                <>
                  <ImageIcon size={28} className="mx-auto text-gray-400" />
                  <p className="mt-2 text-sm text-gray-700">
                    {imageUrls.length === 0 ? 'Click hoặc dán ảnh' : `Thêm ảnh (còn ${MAX_IMAGES - imageUrls.length} chỗ)`}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Tối đa 10MB/ảnh, {MAX_IMAGES} ảnh/đợt</p>
                  <p className="text-xs text-blue-600 mt-1">
                    💡 Bấm vào đây rồi <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px]">Ctrl+V</kbd> để dán
                  </p>
                </>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => { if (e.target.files && e.target.files.length > 0) handleImageUpload(e.target.files) }}
            className="hidden"
          />
        </div>

        {/* 4. Chọn khách hàng */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="mb-3">
            <label className="block text-sm font-medium text-gray-800">
              Chọn khách hàng * <span className="text-blue-600">({selectedIds.size} đã chọn)</span> / {filteredContacts.length} hiển thị
            </label>
          </div>

          <div className="flex gap-2 mb-3 flex-wrap">
            <div className="flex-1 min-w-[180px] relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                placeholder="Tìm tên/SĐT..."
              />
            </div>
            {allTags.length > 0 && (
              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              >
                <option value="">Mọi tag</option>
                {allTags.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            )}
            <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer px-2">
              <input type="checkbox" checked={onlyWithZalo} onChange={(e) => setOnlyWithZalo(e.target.checked)} />
              Chỉ có Zalo
            </label>
          </div>

          <div className="border border-gray-200 rounded-lg max-h-96 overflow-y-auto">
            {filteredContacts.length === 0 ? (
              <p className="text-center text-sm text-gray-500 py-8">Không có khách hàng phù hợp</p>
            ) : (
              <>
                {/* Checkbox chọn tất cả (sticky ở top) */}
                <label className="sticky top-0 bg-blue-50 border-b-2 border-blue-200 flex items-center gap-3 p-3 cursor-pointer hover:bg-blue-100 transition z-10">
                  <input
                    type="checkbox"
                    checked={filteredContacts.every(c => selectedIds.has(c.id)) && filteredContacts.length > 0}
                    onChange={toggleAllFiltered}
                    className="w-4 h-4 text-blue-600 rounded"
                  />
                  <span className="text-sm font-semibold text-blue-900">
                    Chọn tất cả {filteredContacts.length} khách đang hiển thị
                    {(search || tagFilter || onlyWithZalo) && (
                      <span className="text-xs font-normal text-blue-700 ml-1">(sau khi đã lọc)</span>
                    )}
                  </span>
                </label>
                {filteredContacts.map(c => (
                  <label key={c.id} className="flex items-center gap-3 p-2.5 hover:bg-gray-50 border-b border-gray-50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(c.id)}
                      onChange={() => toggleContact(c.id)}
                      className="w-4 h-4 text-blue-600 rounded"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-gray-900 truncate">{c.name || <span className="text-gray-400 italic">Chưa có tên</span>}</p>
                        {c.zalo_user_id && <span className="text-[10px] px-1 bg-green-100 text-green-700 rounded">Zalo</span>}
                      </div>
                      <p className="text-xs text-gray-500 truncate flex items-center gap-1"><Phone size={10} />{c.phone}</p>
                    </div>
                    {c.tags.length > 0 && (
                      <div className="hidden sm:flex gap-1 flex-wrap max-w-[150px]">
                        {c.tags.slice(0, 2).map(t => (
                          <span key={t} className="text-[10px] px-1 bg-gray-100 text-gray-600 rounded">{t}</span>
                        ))}
                      </div>
                    )}
                  </label>
                ))}
              </>
            )}
          </div>
        </div>

        {/* 5. Batch config */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-800 mb-3">⚙️ Cấu hình batch (chống spam Zalo)</label>

          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-xs text-red-900">
            <p className="font-medium mb-1">⚠️ Cảnh báo Zalo:</p>
            <p>Zalo <strong>giới hạn ~5 tin/lần</strong>. Gửi quá nhanh/quá nhiều sẽ bị error code 216 (spam) hoặc 312 (rate limit).</p>
            <p className="mt-1">👉 <strong>Khuyến nghị an toàn</strong>: 5 người/batch · 10 phút giữa batch · 3s giữa mỗi tin.</p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">Số người / batch</label>
              <input
                type="number"
                value={batchSize}
                min={1}
                max={100}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
              <p className="text-xs text-gray-500 mt-1">Khuyến nghị: <strong>5</strong></p>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Delay giữa batch (phút)</label>
              <input
                type="number"
                value={batchDelay}
                min={1}
                max={120}
                onChange={(e) => setBatchDelay(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
              <p className="text-xs text-gray-500 mt-1">Khuyến nghị: <strong>10</strong></p>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">Delay mỗi tin (giây)</label>
              <input
                type="number"
                value={messageDelay}
                min={1}
                max={30}
                onChange={(e) => setMessageDelay(Number(e.target.value))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
              />
              <p className="text-xs text-gray-500 mt-1">Khuyến nghị: <strong>3-5</strong></p>
            </div>
          </div>

          {selectedIds.size > 0 && (() => {
            const intraBatchSeconds = batchSize * messageDelay
            const totalSeconds = totalBatches * intraBatchSeconds + totalTime * 60
            const totalMinutes = Math.ceil(totalSeconds / 60)
            return (
              <div className="mt-4 bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-900">
                📊 <strong>{totalBatches}</strong> batch · gửi <strong>{selectedIds.size}</strong> người ·
                khoảng <strong>{totalMinutes} phút</strong> tổng cộng
                <p className="text-xs text-blue-700 mt-1">
                  ({intraBatchSeconds}s/batch + {batchDelay}p delay giữa batch)
                </p>
              </div>
            )
          })()}
          {isEdit && (
            <div className="mt-3 bg-yellow-50 border border-yellow-200 rounded-lg p-3 text-xs text-yellow-900">
              ⚠️ Edit sẽ <strong>reset progress</strong> (current_batch về 0). Các recipients cũ sẽ được thay bằng list mới.
            </div>
          )}
        </div>

        {/* 6. Thời gian gửi */}
        <div className={`bg-white rounded-xl border p-6 ${isPastTime ? 'border-red-300' : 'border-gray-200'}`}>
          <label className="block text-sm font-medium text-gray-800 mb-2">Thời gian gửi *</label>
          <div className="flex gap-3 flex-wrap">
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className={`px-3 py-2 border-2 rounded-lg text-sm text-gray-900 ${isPastTime ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
            />
            <input
              type="date"
              value={scheduledDate}
              min={defaultSchedule.date}
              onChange={(e) => setScheduledDate(e.target.value)}
              className={`px-3 py-2 border-2 rounded-lg text-sm text-gray-900 ${isPastTime ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}
            />
          </div>
          {isPastTime && (
            <p className="text-sm text-red-600 mt-2 font-medium">⚠️ Thời gian đang ở quá khứ — không thể lưu</p>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-start gap-2">
            <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />{error}
          </div>
        )}

        <div className="flex gap-3 flex-wrap sticky bottom-4">
          <button
            onClick={() => handleSave('draft')}
            disabled={saving || isPastTime}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save size={18} />Lưu nháp
          </button>
          <button
            onClick={() => handleSave('scheduled')}
            disabled={saving || isPastTime}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
          >
            <Send size={18} />
            {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : 'Lên lịch gửi'}
          </button>
        </div>
      </div>
    </div>
  )
}
