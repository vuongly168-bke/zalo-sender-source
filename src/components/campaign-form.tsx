'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { ArrowLeft, X, Send, Save, Image as ImageIcon, Edit2, Repeat, Calendar as CalIcon } from 'lucide-react'
import type { ZaloGroup } from '@/lib/types'
import Link from 'next/link'
import { uploadImageToR2 } from '@/lib/upload-image'

const MAX_IMAGE_BYTES = 10 * 1024 * 1024

interface CampaignFormProps {
  mode: 'create' | 'edit'
  projectId: string
  campaignId?: string  // for edit mode
  fromCampaignId?: string  // for create mode (copy from)
}

export function CampaignForm({ mode, projectId, campaignId, fromCampaignId }: CampaignFormProps) {
  const router = useRouter()
  const supabase = createClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const MAX_IMAGES = 5

  const [groups, setGroups] = useState<ZaloGroup[]>([])
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [imageUrls, setImageUrls] = useState<string[]>([])

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

  // Recurring state
  const [isRecurring, setIsRecurring] = useState(false)
  const [recurrenceUnit, setRecurrenceUnit] = useState<'day' | 'week' | 'month'>('week')
  const [recurrenceInterval, setRecurrenceInterval] = useState(1)
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([])  // 1=T2..7=CN
  const [recurrenceEndType, setRecurrenceEndType] = useState<'never' | 'date' | 'count'>('never')
  const [recurrenceEndDate, setRecurrenceEndDate] = useState('')
  const [recurrenceEndCount, setRecurrenceEndCount] = useState(10)

  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [loaded, setLoaded] = useState(mode === 'create' && !fromCampaignId)

  // Computed: thời gian gửi có ở quá khứ không?
  const isPastTime = (() => {
    if (!scheduledDate || !scheduledTime) return false
    const parsed = new Date(`${scheduledDate}T${scheduledTime}:00`)
    if (Number.isNaN(parsed.getTime())) return false
    return parsed.getTime() <= Date.now() - 30 * 1000
  })()

  // Today (local) — for input min attribute
  const todayStr = useState(() => {
    const d = new Date()
    const yyyy = d.getFullYear()
    const mm = String(d.getMonth() + 1).padStart(2, '0')
    const dd = String(d.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
  })[0]

  const loadGroups = useCallback(async () => {
    const { data } = await supabase
      .from('zalo_groups')
      .select('*')
      .eq('project_id', projectId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
    setGroups(data || [])
  }, [supabase, projectId])

  // Load existing campaign (edit mode hoặc copy mode)
  const loadExisting = useCallback(async () => {
    const id = mode === 'edit' ? campaignId : fromCampaignId
    if (!id) return

    const { data: camp } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', id)
      .single()
    if (!camp) {
      setError('Không tìm thấy đợt gửi')
      setLoaded(true)
      return
    }

    setName(mode === 'create' ? `${camp.name} (copy)` : camp.name)
    setMessage(camp.message || '')
    // Load image_urls (mới) hoặc fallback image_url (cũ)
    const urls: string[] = Array.isArray(camp.image_urls) && camp.image_urls.length > 0
      ? camp.image_urls
      : (camp.image_url ? [camp.image_url] : [])
    setImageUrls(urls)

    // Parse scheduled_at: convert UTC ISO -> local date+time inputs
    if (camp.scheduled_at) {
      const d = new Date(camp.scheduled_at)
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      const hh = String(d.getHours()).padStart(2, '0')
      const mi = String(d.getMinutes()).padStart(2, '0')
      setScheduledDate(`${yyyy}-${mm}-${dd}`)
      setScheduledTime(`${hh}:${mi}`)
    }

    // Load recurring config nếu là parent recurring
    if (camp.is_recurring) {
      setIsRecurring(true)
      setRecurrenceUnit(camp.recurrence_unit || 'week')
      setRecurrenceInterval(camp.recurrence_interval || 1)
      setRecurrenceDays(camp.recurrence_days_of_week || [])
      setRecurrenceEndType(camp.recurrence_end_type || 'never')
      if (camp.recurrence_end_date) setRecurrenceEndDate(camp.recurrence_end_date)
      setRecurrenceEndCount(camp.recurrence_end_count || 10)
    }

    const { data: cgs } = await supabase
      .from('campaign_groups')
      .select('zalo_group_id')
      .eq('campaign_id', id)
    if (cgs) setSelectedGroups(cgs.map(c => c.zalo_group_id))

    setLoaded(true)
  }, [supabase, mode, campaignId, fromCampaignId])

  function toggleDay(d: number) {
    setRecurrenceDays(prev =>
      prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort()
    )
  }

  useEffect(() => { loadGroups() }, [loadGroups])
  useEffect(() => { loadExisting() }, [loadExisting])

  function toggleGroup(groupId: string) {
    setSelectedGroups(prev =>
      prev.includes(groupId) ? prev.filter(id => id !== groupId) : [...prev, groupId]
    )
  }

  function toggleAll() {
    if (selectedGroups.length === groups.length) setSelectedGroups([])
    else setSelectedGroups(groups.map(g => g.id))
  }

  async function handleImageUpload(files: FileList | File[]) {
    const filesArr = Array.from(files)
    if (imageUrls.length + filesArr.length > MAX_IMAGES) {
      setError(`Tối đa ${MAX_IMAGES} ảnh / đợt gửi. Bạn đang có ${imageUrls.length} ảnh, chỉ thêm được ${MAX_IMAGES - imageUrls.length} nữa.`)
      return
    }

    setUploading(true)
    setError('')
    const newUrls: string[] = []

    try {
      for (const file of filesArr) {
        if (!file.type.startsWith('image/')) {
          setError(`File "${file.name}" không phải ảnh, bỏ qua`)
          continue
        }
        if (file.size > MAX_IMAGE_BYTES) {
          const sizeMB = (file.size / 1024 / 1024).toFixed(2)
          setError(`Ảnh "${file.name}" quá ${sizeMB}MB. Tối đa 10MB. Bỏ qua.`)
          continue
        }
        try {
          const { url } = await uploadImageToR2(file)
          newUrls.push(url)
        } catch (err) {
          setError(`Upload "${file.name}" thất bại: ` + (err as Error).message)
        }
      }
    } finally {
      // Luôn reset spinner dù có lỗi gì
      if (newUrls.length > 0) {
        setImageUrls(prev => [...prev, ...newUrls])
      }
      setUploading(false)
    }
  }

  function removeImage(idx: number) {
    setImageUrls(prev => prev.filter((_, i) => i !== idx))
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) handleImageUpload(e.target.files)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) handleImageUpload(e.dataTransfer.files)
  }

  // Paste ảnh từ clipboard (Ctrl+V / Cmd+V) khi đang focus drop zone hoặc cả page
  function handlePaste(e: React.ClipboardEvent) {
    const items = e.clipboardData?.items
    if (!items) return
    const files: File[] = []
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        const f = item.getAsFile()
        if (f) {
          // Backend kiểm tra extension khớp định dạng thật; clipboard đôi lúc thiếu tên file.
          const ext = item.type.split('/')[1] || 'png'
          const named = new File([f], `paste-${Date.now()}.${ext}`, { type: item.type })
          files.push(named)
        }
      }
    }
    if (files.length > 0) {
      e.preventDefault()
      handleImageUpload(files)
    }
  }

  async function handleSave(status: 'draft' | 'scheduled') {
    if (!name.trim()) { setError('Vui lòng nhập tên đợt gửi'); return }
    if (!message.trim() && imageUrls.length === 0) { setError('Vui lòng nhập nội dung hoặc upload ảnh'); return }
    if (selectedGroups.length === 0) { setError('Vui lòng chọn ít nhất 1 nhóm'); return }
    if (status === 'scheduled' && (!scheduledDate || !scheduledTime)) {
      setError('Vui lòng chọn thời gian gửi'); return
    }

    // Validate recurring config
    if (isRecurring) {
      if (recurrenceUnit === 'week' && recurrenceDays.length === 0) {
        setError('Lặp lại theo tuần: chọn ít nhất 1 ngày trong tuần'); return
      }
      if (recurrenceEndType === 'date' && !recurrenceEndDate) {
        setError('Chọn ngày kết thúc'); return
      }
      if (recurrenceEndType === 'count' && (!recurrenceEndCount || recurrenceEndCount < 1)) {
        setError('Số lần lặp lại phải >= 1'); return
      }
    }

    let scheduledAt: string | null = null
    if (scheduledDate && scheduledTime) {
      const parsed = new Date(`${scheduledDate}T${scheduledTime}:00`)
      if (Number.isNaN(parsed.getTime())) { setError('Thời gian không hợp lệ'); return }
      // Validate cả draft + scheduled: thời gian phải lớn hơn hiện tại
      if (parsed.getTime() <= Date.now() - 30 * 1000) {
        setError('⏰ Thời gian gửi đang ở quá khứ. Vui lòng chọn ngày giờ trong tương lai.'); return
      }
      scheduledAt = parsed.toISOString()
    }

    setSaving(true)
    setError('')

    const { data: { user } } = await supabase.auth.getUser()

    // Recurring fields - chỉ áp dụng nếu isRecurring
    const recurringFields = isRecurring ? {
      is_recurring: true,
      recurrence_unit: recurrenceUnit,
      recurrence_interval: recurrenceInterval,
      recurrence_days_of_week: recurrenceUnit === 'week' ? recurrenceDays : null,
      recurrence_end_type: recurrenceEndType,
      recurrence_end_date: recurrenceEndType === 'date' ? recurrenceEndDate : null,
      recurrence_end_count: recurrenceEndType === 'count' ? recurrenceEndCount : null,
      next_run_at: scheduledAt,
      status: 'active',  // parent recurring dùng 'active' thay vì 'scheduled'
    } : {
      is_recurring: false,
      recurrence_unit: null,
      recurrence_interval: null,
      recurrence_days_of_week: null,
      recurrence_end_type: null,
      recurrence_end_date: null,
      recurrence_end_count: null,
      next_run_at: null,
      status,
    }

    if (mode === 'edit' && campaignId) {
      // EDIT mode: update campaign
      const baseUpdate = {
        name,
        message: message || null,
        image_url: imageUrls[0] || null,
        scheduled_at: scheduledAt,
        ...recurringFields,
      }
      let upErr = (await supabase
        .from('campaigns')
        // The deployed database may predate image_urls; preserve the fallback below.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .update({ ...baseUpdate, image_urls: imageUrls } as any)
        .eq('id', campaignId)).error
      if (upErr && upErr.message.includes('image_urls')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        upErr = (await supabase.from('campaigns').update(baseUpdate as any).eq('id', campaignId)).error
        if (!upErr && imageUrls.length > 1) {
          alert('⚠️ Chỉ ảnh đầu tiên được lưu. Vui lòng chạy SQL v2-multi-images.sql để hỗ trợ nhiều ảnh.')
        }
      }
      if (upErr) { setError('Lỗi: ' + upErr.message); setSaving(false); return }

      // Replace campaign_groups: delete old + insert new
      await supabase.from('campaign_groups').delete().eq('campaign_id', campaignId)
      if (selectedGroups.length > 0) {
        await supabase.from('campaign_groups').insert(
          selectedGroups.map(gId => ({ campaign_id: campaignId, zalo_group_id: gId }))
        )
      }

      router.push(`/dashboard/projects/${projectId}/campaigns/${campaignId}`)
      router.refresh()
    } else {
      // CREATE mode
      const baseInsert = {
        project_id: projectId,
        name,
        message: message || null,
        image_url: imageUrls[0] || null,
        scheduled_at: isRecurring ? null : scheduledAt,
        created_by: user!.id,
        ...recurringFields,
      }
      let { data: campaign, error: campError } = await supabase
        .from('campaigns')
        // The deployed database may predate image_urls; preserve the fallback below.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .insert({ ...baseInsert, image_urls: imageUrls } as any)
        .select()
        .single()
      if (campError && campError.message.includes('image_urls')) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const retry = await supabase.from('campaigns').insert(baseInsert as any).select().single()
        campaign = retry.data
        campError = retry.error
        if (!campError && imageUrls.length > 1) {
          alert('⚠️ Chỉ ảnh đầu tiên được lưu. Vui lòng chạy SQL v2-multi-images.sql để hỗ trợ nhiều ảnh.')
        }
      }
      if (campError || !campaign) { setError('Lỗi: ' + campError?.message); setSaving(false); return }

      const campaignGroups = selectedGroups.map(gId => ({
        campaign_id: campaign.id,
        zalo_group_id: gId,
      }))
      await supabase.from('campaign_groups').insert(campaignGroups)

      router.push(`/dashboard/projects/${projectId}/campaigns/${campaign.id}`)
      router.refresh()
    }
  }

  if (!loaded) {
    return <div className="text-center py-20 text-gray-500">Đang tải...</div>
  }

  const isEdit = mode === 'edit'

  return (
    <div className="max-w-3xl">
      <Link
        href={isEdit && campaignId
          ? `/dashboard/projects/${projectId}/campaigns/${campaignId}`
          : `/dashboard/projects/${projectId}`}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition mb-4"
      >
        <ArrowLeft size={16} />
        Quay lại
      </Link>

      <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
        {isEdit ? <Edit2 size={22} /> : null}
        {isEdit ? 'Sửa đợt gửi' : 'Tạo đợt gửi mới'}
      </h1>

      <div className="mt-6 space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Tên đợt gửi *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            placeholder="VD: Chào mừng khai giảng, Nhắc bài tập tuần 3..."
          />
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">Nội dung tin nhắn</label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={8}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-y"
            placeholder="Nhập nội dung tin nhắn Zalo..."
          />
          <p className="text-xs text-gray-500 mt-1">{message.length} ký tự</p>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Chọn nhóm nhận tin * ({selectedGroups.length}/{groups.length} nhóm)
          </label>

          {groups.length === 0 ? (
            <p className="text-sm text-gray-500">Chưa có nhóm nào. Hãy thêm nhóm Zalo trước.</p>
          ) : (
            <div className="border border-gray-200 rounded-lg max-h-64 overflow-y-auto">
              <label className="flex items-center gap-3 p-3 hover:bg-gray-50 border-b border-gray-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedGroups.length === groups.length && groups.length > 0}
                  onChange={toggleAll}
                  className="w-4 h-4 text-blue-600 rounded border-gray-300"
                />
                <span className="text-sm font-medium text-gray-900">Chọn tất cả</span>
              </label>
              {groups.map((group) => (
                <label key={group.id} className="flex items-center gap-3 p-3 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedGroups.includes(group.id)}
                    onChange={() => toggleGroup(group.id)}
                    className="w-4 h-4 text-blue-600 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">{group.group_name}</span>
                  <span className="text-xs text-gray-400 ml-auto">{group.member_count} TV</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className={`bg-white rounded-xl border p-6 ${isPastTime ? 'border-red-300' : 'border-gray-200'}`}>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            {isRecurring ? 'Lần gửi đầu tiên (giờ:phút áp dụng cho mọi lần lặp)' : 'Thời gian gửi *'}
          </label>
          <div className="flex gap-3 flex-wrap">
            <input
              type="time"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className={`px-3 py-2.5 border-2 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${
                isPastTime ? 'border-red-300 bg-red-50' : 'border-gray-200'
              }`}
            />
            <input
              type="date"
              value={scheduledDate}
              min={todayStr}
              onChange={(e) => setScheduledDate(e.target.value)}
              className={`px-3 py-2.5 border-2 rounded-lg text-sm text-gray-900 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none ${
                isPastTime ? 'border-red-300 bg-red-50' : 'border-gray-200'
              }`}
            />
          </div>
          {isPastTime ? (
            <p className="text-sm text-red-600 mt-2 font-medium flex items-center gap-1.5">
              ⚠️ Thời gian đang ở <strong>quá khứ</strong>. Không thể lưu — vui lòng chọn ngày giờ trong tương lai.
            </p>
          ) : (
            <p className="text-xs text-gray-500 mt-2">
              Thời gian gửi phải <strong>lớn hơn hiện tại</strong>. Hệ thống không cho lưu lịch trong quá khứ.
            </p>
          )}
        </div>

        {/* ============ RECURRING BLOCK ============ */}
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => setIsRecurring(e.target.checked)}
              className="w-5 h-5 text-purple-600 rounded"
            />
            <span className="flex items-center gap-2 font-medium text-gray-900">
              <Repeat size={16} className="text-purple-600" />
              Sự kiện lặp lại
            </span>
            <span className="text-xs text-gray-500">(họp định kỳ, nhắc báo cáo, gửi lịch hàng tuần...)</span>
          </label>

          {isRecurring && (
            <div className="mt-4 pl-8 space-y-4 border-l-2 border-purple-200">
              {/* Frequency */}
              <div>
                <label className="block text-sm text-gray-700 mb-1.5">Lặp lại mỗi:</label>
                <div className="flex gap-2 items-center flex-wrap">
                  <input
                    type="number"
                    value={recurrenceInterval}
                    min={1}
                    max={365}
                    onChange={(e) => setRecurrenceInterval(Number(e.target.value))}
                    className="w-20 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  />
                  <select
                    value={recurrenceUnit}
                    onChange={(e) => setRecurrenceUnit(e.target.value as 'day' | 'week' | 'month')}
                    className="px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-900"
                  >
                    <option value="day">Ngày</option>
                    <option value="week">Tuần</option>
                    <option value="month">Tháng</option>
                  </select>
                </div>
              </div>

              {/* Days of week (chỉ khi unit='week') */}
              {recurrenceUnit === 'week' && (
                <div>
                  <label className="block text-sm text-gray-700 mb-1.5">Lặp lại vào:</label>
                  <div className="flex gap-2 flex-wrap">
                    {[
                      { d: 1, label: 'T2' },
                      { d: 2, label: 'T3' },
                      { d: 3, label: 'T4' },
                      { d: 4, label: 'T5' },
                      { d: 5, label: 'T6' },
                      { d: 6, label: 'T7' },
                      { d: 7, label: 'CN' },
                    ].map(({ d, label }) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleDay(d)}
                        className={`w-12 h-10 rounded-lg text-sm font-medium border-2 transition ${
                          recurrenceDays.includes(d)
                            ? 'bg-purple-600 text-white border-purple-600'
                            : 'bg-white text-gray-700 border-gray-200 hover:border-purple-400'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {recurrenceDays.length === 0 && (
                    <p className="text-xs text-red-500 mt-1">Chọn ít nhất 1 ngày trong tuần</p>
                  )}
                </div>
              )}

              {/* End condition */}
              <div>
                <label className="block text-sm text-gray-700 mb-2">Kết thúc:</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={recurrenceEndType === 'never'}
                      onChange={() => setRecurrenceEndType('never')}
                    />
                    <span className="text-sm text-gray-900">Không bao giờ</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={recurrenceEndType === 'date'}
                      onChange={() => setRecurrenceEndType('date')}
                    />
                    <span className="text-sm text-gray-900 flex items-center gap-2">
                      <CalIcon size={14} />Vào ngày
                    </span>
                    {recurrenceEndType === 'date' && (
                      <input
                        type="date"
                        value={recurrenceEndDate}
                        min={todayStr}
                        onChange={(e) => setRecurrenceEndDate(e.target.value)}
                        className="px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
                      />
                    )}
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={recurrenceEndType === 'count'}
                      onChange={() => setRecurrenceEndType('count')}
                    />
                    <span className="text-sm text-gray-900">Sau</span>
                    {recurrenceEndType === 'count' && (
                      <input
                        type="number"
                        value={recurrenceEndCount}
                        min={1}
                        max={365}
                        onChange={(e) => setRecurrenceEndCount(Number(e.target.value))}
                        className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-gray-900"
                      />
                    )}
                    {recurrenceEndType === 'count' && <span className="text-sm text-gray-900">lần</span>}
                  </label>
                </div>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-xs text-purple-900">
                💡 Khi bật lặp lại, mỗi lần đến hạn hệ thống tự tạo 1 đợt gửi mới và gửi tự động.
                Bạn vẫn xem được kết quả từng lần riêng biệt.
              </div>
            </div>
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Ảnh đính kèm (tùy chọn) — {imageUrls.length}/{MAX_IMAGES}
          </label>

          {/* Grid preview ảnh */}
          {imageUrls.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 mb-3">
              {imageUrls.map((url, i) => (
                <div key={i} className="relative group aspect-square">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={`Ảnh ${i + 1}`} className="w-full h-full object-cover rounded-lg border border-gray-200" />
                  <button
                    type="button"
                    onClick={() => removeImage(i)}
                    className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center hover:bg-red-600 transition opacity-90 group-hover:opacity-100"
                    title="Xóa ảnh này"
                  >
                    <X size={14} />
                  </button>
                  <span className="absolute bottom-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">{i + 1}</span>
                </div>
              ))}
            </div>
          )}

          {/* Drop zone (chỉ hiện khi chưa đủ 5 ảnh) */}
          {imageUrls.length < MAX_IMAGES && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onPaste={handlePaste}
              onClick={() => fileInputRef.current?.click()}
              tabIndex={0}
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 focus:border-blue-500 focus:bg-blue-50 focus:outline-none transition"
              title="Click để chọn, kéo thả, hoặc bấm vào vùng này rồi Ctrl+V để dán"
            >
              {uploading ? (
                <div className="text-blue-600">
                  <div className="animate-spin w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full mx-auto" />
                  <p className="mt-2 text-sm">Đang upload...</p>
                </div>
              ) : (
                <>
                  <ImageIcon size={28} className="mx-auto text-gray-400" />
                  <p className="mt-2 text-sm text-gray-700 font-medium">
                    {imageUrls.length === 0 ? 'Click, kéo thả, hoặc dán ảnh' : `Thêm ảnh (còn ${MAX_IMAGES - imageUrls.length} chỗ)`}
                  </p>
                  <p className="text-xs text-gray-500 mt-1">
                    PNG, JPG, WEBP — tối đa <strong>10MB/ảnh</strong>, tối đa <strong>{MAX_IMAGES} ảnh</strong>. Tự nén khi gửi.
                  </p>
                  <p className="text-xs text-blue-600 mt-1">
                    💡 Bấm vào đây rồi <kbd className="px-1.5 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px]">Ctrl+V</kbd> để dán ảnh từ clipboard (chụp màn hình, copy từ Zalo...)
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
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg text-sm border border-red-200">{error}</div>
        )}

        <div className="flex gap-3 flex-wrap">
          <button
            onClick={() => handleSave('draft')}
            disabled={saving || isPastTime}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-6 py-3 rounded-lg font-medium hover:bg-gray-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
            title={isPastTime ? 'Thời gian gửi đang ở quá khứ' : ''}
          >
            <Save size={18} />
            Lưu nháp
          </button>
          <button
            onClick={() => handleSave('scheduled')}
            disabled={saving || isPastTime}
            className="flex items-center gap-2 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            title={isPastTime ? 'Thời gian gửi đang ở quá khứ' : ''}
          >
            <Send size={18} />
            {saving ? 'Đang lưu...' : isEdit ? 'Cập nhật' : isRecurring ? 'Tạo lịch lặp lại' : 'Lên lịch gửi'}
          </button>
        </div>
      </div>
    </div>
  )
}
