'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import {
  ArrowLeft, Send, Trash2, Clock, Phone, Loader2, Pause, Play,
  Download, AlertCircle, RefreshCw, Edit2, Copy,
} from 'lucide-react'
import Link from 'next/link'
import { PERSONAL_CAMPAIGN_STATUS_LABELS } from '@/lib/types'
import type { PersonalCampaign } from '@/lib/types'
import { ImageGallery } from '@/components/image-gallery'
import { downloadXlsx } from '@/lib/spreadsheet-browser'

interface Recipient {
  id: string
  contact_id: string
  batch_number: number | null
  status: 'pending' | 'sent' | 'failed'
  sent_at: string | null
  error_message: string | null
  contacts: { phone: string; name: string | null; zalo_user_id: string | null }
}

export default function PersonalCampaignDetailPage() {
  const supabase = createClient()
  const params = useParams()
  const router = useRouter()
  const campaignId = params.id as string

  const [campaign, setCampaign] = useState<(PersonalCampaign & { zalo_accounts?: { name: string; phone_number: string | null } | null }) | null>(null)
  const [recipients, setRecipients] = useState<Recipient[]>([])
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'failed' | 'pending'>('all')

  const loadAll = useCallback(async () => {
    const { data: camp } = await supabase
      .from('personal_campaigns')
      .select('*, zalo_accounts(name, phone_number)')
      .eq('id', campaignId)
      .single()
    setCampaign(camp)

    const { data: rs } = await supabase
      .from('personal_campaign_recipients')
      .select('*, contacts(phone, name, zalo_user_id)')
      .eq('campaign_id', campaignId)
      .order('batch_number', { ascending: true })
      .limit(2000)  // giới hạn để tránh tải vô hạn nếu campaign cực lớn
    setRecipients(rs || [])

    setLoading(false)
  }, [supabase, campaignId])

  useEffect(() => {
    async function load() {
      await loadAll()
    }
    void load()
  }, [loadAll])

  // Auto refresh khi đang sending — giãn 15s + chỉ khi tab đang mở (tiết kiệm tải)
  useEffect(() => {
    if (campaign?.status !== 'sending') return
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadAll()
    }, 15000)
    return () => clearInterval(interval)
  }, [campaign?.status, loadAll])

  async function handleSendBatchNow() {
    if (!confirm('Gửi 1 batch ngay bây giờ?')) return
    setSending(true)
    try {
      const res = await fetch('/api/zalo/personal-send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      })
      const data = await res.json()
      if (!res.ok || data.error) alert('Lỗi: ' + (data.error || `HTTP ${res.status}`))
      else alert(`Đã gửi batch ${data.batch}: ${data.successCount}/${data.totalInBatch} thành công`)
    } catch (err) {
      alert('Lỗi: ' + (err as Error).message)
    }
    setSending(false)
    await loadAll()
  }

  async function handleRetryFailed() {
    if (!confirm('Gửi lại các người bị thất bại?')) return
    setSending(true)
    await supabase
      .from('personal_campaign_recipients')
      .update({ status: 'pending', error_message: null, sent_at: null })
      .eq('campaign_id', campaignId)
      .eq('status', 'failed')

    // Cho cron xử lý ngay; sender sẽ tự tìm batch cũ nhỏ nhất đang pending.
    await supabase
      .from('personal_campaigns')
      .update({ status: 'sending', last_batch_sent_at: null })
      .eq('id', campaignId)
    setSending(false)
    await loadAll()
  }

  async function handlePauseResume() {
    if (!campaign) return
    const newStatus = campaign.status === 'paused' ? 'sending' : 'paused'
    await supabase.from('personal_campaigns').update({ status: newStatus }).eq('id', campaignId)
    await loadAll()
  }

  async function handleDelete() {
    if (!campaign) return
    if (!confirm(`Xóa đợt "${campaign.name}"?`)) return
    await supabase.from('personal_campaigns').delete().eq('id', campaignId)
    router.push('/dashboard/personal-campaigns')
  }

  async function handleExport() {
    if (!campaign) return
    const rows = [
      ['STT', 'Batch', 'SĐT', 'Tên', 'Zalo ID', 'Trạng thái', 'Thời gian gửi', 'Lỗi'],
      ...recipients.map((r, i) => [
        i + 1,
        r.batch_number ?? '',
        r.contacts?.phone || '',
        r.contacts?.name || '',
        r.contacts?.zalo_user_id || '',
        r.status === 'sent' ? 'Đã gửi' : r.status === 'failed' ? 'Lỗi' : 'Chờ',
        r.sent_at ? new Date(r.sent_at).toLocaleString('vi-VN') : '',
        r.error_message || '',
      ]),
    ]
    await downloadXlsx(
      rows,
      `${campaign.name}-${new Date().toISOString().split('T')[0]}.xlsx`,
      'Recipients',
    )
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-gray-500"><Loader2 className="animate-spin" /></div>
  if (!campaign) return <div className="text-center py-20 text-gray-500">Không tìm thấy</div>

  const info = PERSONAL_CAMPAIGN_STATUS_LABELS[campaign.status]
  const sentCount = recipients.filter(r => r.status === 'sent').length
  const failedCount = recipients.filter(r => r.status === 'failed').length
  const pendingCount = recipients.filter(r => r.status === 'pending').length
  const progress = recipients.length ? Math.round(((sentCount + failedCount) / recipients.length) * 100) : 0

  const filteredRecipients = recipients.filter(r => {
    if (statusFilter === 'all') return true
    return r.status === statusFilter
  })

  // Estimate remaining time
  const remainingBatches = Math.ceil(pendingCount / campaign.batch_size)
  const remainingMinutes = remainingBatches > 0 ? remainingBatches * campaign.batch_delay_minutes : 0

  return (
    <div className="max-w-5xl">
      <Link
        href="/dashboard/personal-campaigns"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition mb-4"
      >
        <ArrowLeft size={16} />Quay lại danh sách
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-2xl">{info.icon}</span>
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
            <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${info.color}`}>{info.label}</span>
          </div>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-gray-500 mt-2">
            {campaign.zalo_accounts && (
              <span className="flex items-center gap-1">
                <Phone size={12} />
                Gửi từ: {campaign.zalo_accounts.name}
                {campaign.zalo_accounts.phone_number && ` · ${campaign.zalo_accounts.phone_number}`}
              </span>
            )}
            <span>📦 Batch {campaign.batch_size}/{campaign.batch_delay_minutes}p</span>
            {campaign.scheduled_at && (
              <span className="flex items-center gap-1">
                <Clock size={12} />
                {new Date(campaign.scheduled_at).toLocaleString('vi-VN')}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {['scheduled', 'sending'].includes(campaign.status) && pendingCount > 0 && (
            <button
              onClick={handleSendBatchNow}
              disabled={sending}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
              title="Gửi 1 batch ngay (bypass schedule)"
            >
              <Send size={14} />
              {sending ? 'Đang gửi...' : 'Gửi batch ngay'}
            </button>
          )}
          {['draft', 'scheduled'].includes(campaign.status) && (
            <Link
              href={`/dashboard/personal-campaigns/${campaignId}/edit`}
              className="flex items-center gap-2 bg-yellow-50 text-yellow-700 border border-yellow-200 px-3 py-2 rounded-lg text-sm font-medium hover:bg-yellow-100 transition"
            >
              <Edit2 size={14} />Sửa
            </Link>
          )}
          <Link
            href={`/dashboard/personal-campaigns/new?from=${campaignId}`}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 border border-gray-200 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
          >
            <Copy size={14} />Sao chép &amp; sửa
          </Link>
          {failedCount > 0 && (
            <button
              onClick={handleRetryFailed}
              disabled={sending}
              className="flex items-center gap-2 bg-orange-100 border border-orange-300 text-orange-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-orange-200 transition disabled:opacity-50"
            >
              <RefreshCw size={14} />Gửi lại lỗi
            </button>
          )}
          {['sending', 'paused'].includes(campaign.status) && (
            <button
              onClick={handlePauseResume}
              className="flex items-center gap-2 bg-gray-100 border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
            >
              {campaign.status === 'paused' ? <Play size={14} /> : <Pause size={14} />}
              {campaign.status === 'paused' ? 'Tiếp tục' : 'Tạm dừng'}
            </button>
          )}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 bg-white border border-gray-300 text-gray-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition"
          >
            <Download size={14} />Excel
          </button>
          <button
            onClick={handleDelete}
            className="text-red-600 border border-red-200 hover:bg-red-50 px-3 py-2 rounded-lg text-sm font-medium transition"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{recipients.length}</p>
          <p className="text-xs text-gray-500 mt-1">Tổng người</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{sentCount}</p>
          <p className="text-xs text-gray-500 mt-1">Đã gửi</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{failedCount}</p>
          <p className="text-xs text-gray-500 mt-1">Thất bại</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-orange-600">{pendingCount}</p>
          <p className="text-xs text-gray-500 mt-1">Còn chờ</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
        <div className="flex justify-between text-sm text-gray-700 mb-2">
          <span>Tiến độ {sentCount + failedCount}/{recipients.length}</span>
          <span className="font-medium">{progress}%</span>
        </div>
        <div className="bg-gray-200 rounded-full h-3 overflow-hidden">
          <div className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all" style={{ width: `${progress}%` }} />
        </div>
        {pendingCount > 0 && campaign.status === 'sending' && (
          <p className="text-xs text-gray-500 mt-2">
            ⏳ Còn {remainingBatches} batch · ước tính {remainingMinutes} phút nữa (auto cron mỗi phút)
          </p>
        )}
      </div>

      {/* Message preview */}
      {campaign.message && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
          <p className="text-sm font-medium text-gray-700 mb-2">Nội dung tin nhắn:</p>
          <div className="bg-gray-50 rounded-lg p-3 text-sm text-gray-900 whitespace-pre-wrap">{campaign.message}</div>
        </div>
      )}

      {(() => {
        const urls: string[] = Array.isArray(campaign.image_urls) && campaign.image_urls.length > 0
          ? campaign.image_urls
          : (campaign.image_url ? [campaign.image_url] : [])
        return urls.length > 0 ? (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 p-5">
            <p className="text-sm font-medium text-gray-700 mb-2">Ảnh đính kèm ({urls.length}) — bấm để xem & tải về:</p>
            <ImageGallery urls={urls} />
          </div>
        ) : null
      })()}
      {/* Recipients list */}
      <div className="mt-4 bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-semibold text-gray-900">Danh sách người nhận</h2>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setStatusFilter('all')}
              className={`text-xs px-2.5 py-1 rounded-full ${statusFilter === 'all' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
            >
              Tất cả ({recipients.length})
            </button>
            <button
              onClick={() => setStatusFilter('sent')}
              className={`text-xs px-2.5 py-1 rounded-full ${statusFilter === 'sent' ? 'bg-green-600 text-white' : 'bg-green-50 text-green-700 hover:bg-green-100'}`}
            >
              Đã gửi ({sentCount})
            </button>
            <button
              onClick={() => setStatusFilter('failed')}
              className={`text-xs px-2.5 py-1 rounded-full ${statusFilter === 'failed' ? 'bg-red-600 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100'}`}
            >
              Lỗi ({failedCount})
            </button>
            <button
              onClick={() => setStatusFilter('pending')}
              className={`text-xs px-2.5 py-1 rounded-full ${statusFilter === 'pending' ? 'bg-orange-600 text-white' : 'bg-orange-50 text-orange-700 hover:bg-orange-100'}`}
            >
              Chờ ({pendingCount})
            </button>
          </div>
        </div>
        <div className="divide-y divide-gray-100 max-h-[600px] overflow-y-auto">
          {filteredRecipients.length === 0 ? (
            <p className="text-center text-sm text-gray-500 py-8">Không có người nhận trong filter này</p>
          ) : filteredRecipients.map((r) => (
            <div key={r.id} className="flex items-center gap-3 p-3">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                r.status === 'sent' ? 'bg-green-500'
                : r.status === 'failed' ? 'bg-red-500'
                : 'bg-orange-400'
              }`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {r.contacts?.name || <span className="text-gray-400 italic">Chưa có tên</span>}
                  </p>
                  <span className="text-xs text-gray-500">{r.contacts?.phone}</span>
                  <span className="text-[10px] px-1 bg-blue-50 text-blue-700 rounded">Batch {r.batch_number}</span>
                </div>
                {r.error_message && (
                  <p className="text-xs text-red-600 mt-0.5 flex items-start gap-1">
                    <AlertCircle size={10} className="flex-shrink-0 mt-0.5" />
                    {r.error_message}
                  </p>
                )}
              </div>
              <div className="text-xs text-gray-400 whitespace-nowrap">
                {r.sent_at ? new Date(r.sent_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '-'}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
