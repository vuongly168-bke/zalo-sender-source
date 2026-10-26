'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useParams, useRouter } from 'next/navigation'
import { ArrowLeft, Send, Trash2, Clock, CheckCircle, XCircle, AlertCircle, Copy, RefreshCw, Edit2 } from 'lucide-react'
import { CAMPAIGN_STATUS_LABELS } from '@/lib/types'
import type { Campaign, CampaignGroup, ZaloGroup } from '@/lib/types'
import { ImageGallery } from '@/components/image-gallery'
import Link from 'next/link'

export default function CampaignDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string
  const campaignId = params.campaignId as string
  const supabase = createClient()

  const [campaign, setCampaign] = useState<Campaign | null>(null)
  const [campaignGroups, setCampaignGroups] = useState<(CampaignGroup & { zalo_groups: ZaloGroup })[]>([])
  const [sending, setSending] = useState(false)

  const loadData = useCallback(async () => {
    const { data: camp } = await supabase
      .from('campaigns')
      .select('*')
      .eq('id', campaignId)
      .single()
    setCampaign(camp)

    const { data: cGroups } = await supabase
      .from('campaign_groups')
      .select('*, zalo_groups(*)')
      .eq('campaign_id', campaignId)
    setCampaignGroups(cGroups || [])
  }, [supabase, campaignId])

  useEffect(() => { loadData() }, [loadData])

  async function handleSendNow() {
    const isRetry = ['failed', 'partial'].includes(campaign?.status || '')
    const confirmMsg = isRetry
      ? 'Gửi lại các nhóm bị thất bại?'
      : 'Gửi tin nhắn ngay bây giờ?'
    if (!confirm(confirmMsg)) return
    setSending(true)

    if (isRetry) {
      await supabase
        .from('campaign_groups')
        .update({ status: 'pending', error_message: null, sent_at: null })
        .eq('campaign_id', campaignId)
        .eq('status', 'failed')
    }

    try {
      const res = await fetch('/api/zalo/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campaignId }),
      })
      const data = await res.json()

      if (data.error) {
        alert('Lỗi: ' + data.error)
      } else {
        alert(`Đã gửi thành công ${data.successCount}/${data.totalGroups} nhóm`)
      }
    } catch {
      alert('Lỗi kết nối')
    }

    setSending(false)
    loadData()
  }

  async function handleDelete() {
    if (!confirm('Xóa đợt gửi này?')) return
    await supabase.from('campaigns').delete().eq('id', campaignId)
    router.push(`/dashboard/projects/${projectId}`)
    router.refresh()
  }

  if (!campaign) return <div className="text-center py-20 text-gray-500">Đang tải...</div>

  const statusInfo = CAMPAIGN_STATUS_LABELS[campaign.status]
  const sentCount = campaignGroups.filter(cg => cg.status === 'sent').length
  const failedCount = campaignGroups.filter(cg => cg.status === 'failed').length

  return (
    <div className="max-w-3xl">
      <Link
        href={`/dashboard/projects/${projectId}`}
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700 transition mb-4"
      >
        <ArrowLeft size={16} />
        Quay lại dự án
      </Link>

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-3">
            <span className="text-2xl">{statusInfo.icon}</span>
            <h1 className="text-2xl font-bold text-gray-900">{campaign.name}</h1>
          </div>
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium mt-2 ${statusInfo.color}`}>
            {statusInfo.label}
          </span>
        </div>
        <div className="flex gap-2 flex-wrap">
          {['draft', 'scheduled'].includes(campaign.status) && (
            <>
              <button
                onClick={handleSendNow}
                disabled={sending}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition disabled:opacity-50"
              >
                <Send size={16} />
                {sending ? 'Đang gửi...' : 'Gửi ngay'}
              </button>
              <Link
                href={`/dashboard/projects/${projectId}/campaigns/${campaignId}/edit`}
                className="flex items-center gap-2 bg-yellow-50 text-yellow-700 border border-yellow-200 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-yellow-100 transition"
              >
                <Edit2 size={16} />
                Sửa
              </Link>
            </>
          )}
          {['failed', 'partial'].includes(campaign.status) && (
            <button
              onClick={handleSendNow}
              disabled={sending}
              className="flex items-center gap-2 bg-orange-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-orange-700 transition disabled:opacity-50"
            >
              <RefreshCw size={16} />
              {sending ? 'Đang gửi...' : 'Gửi lại nhóm thất bại'}
            </button>
          )}
          <Link
            href={`/dashboard/projects/${projectId}/campaigns/new?from=${campaignId}`}
            className="flex items-center gap-2 bg-gray-100 text-gray-700 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-200 transition"
          >
            <Copy size={16} />
            Sao chép & sửa
          </Link>
          <button
            onClick={handleDelete}
            className="flex items-center gap-2 text-red-600 px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-red-50 transition"
          >
            <Trash2 size={16} />
            Xóa
          </button>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-gray-900">{campaignGroups.length}</p>
          <p className="text-xs text-gray-500 mt-1">Tổng nhóm</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-green-600">{sentCount}</p>
          <p className="text-xs text-gray-500 mt-1">Thành công</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center">
          <p className="text-2xl font-bold text-red-600">{failedCount}</p>
          <p className="text-xs text-gray-500 mt-1">Thất bại</p>
        </div>
      </div>

      {campaign.scheduled_at && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
          <Clock size={18} className="text-blue-600" />
          <div>
            <p className="text-sm font-medium text-gray-900">Lịch gửi</p>
            <p className="text-sm text-gray-600">{new Date(campaign.scheduled_at).toLocaleString('vi-VN')}</p>
          </div>
        </div>
      )}

      {campaign.message && (
        <div className="mt-4 bg-white rounded-xl border border-gray-200 p-6">
          <h3 className="text-sm font-medium text-gray-700 mb-2">Nội dung tin nhắn:</h3>
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-800 whitespace-pre-wrap">
            {campaign.message}
          </div>
        </div>
      )}

      {(() => {
        const urls: string[] = Array.isArray(campaign.image_urls) && campaign.image_urls.length > 0
          ? campaign.image_urls
          : (campaign.image_url ? [campaign.image_url] : [])
        return urls.length > 0 ? (
          <div className="mt-4 bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">Ảnh đính kèm ({urls.length}) — bấm để xem & tải về:</h3>
            <ImageGallery urls={urls} />
          </div>
        ) : null
      })()}
      <div className="mt-4 bg-white rounded-xl border border-gray-200">
        <div className="p-4 border-b border-gray-200">
          <h3 className="font-medium text-gray-900">Nhóm nhận tin ({campaignGroups.length})</h3>
        </div>
        <div className="divide-y divide-gray-100">
          {campaignGroups.map((cg) => (
            <div key={cg.id} className="flex items-center gap-3 p-4">
              <div className="flex-shrink-0">
                {cg.status === 'sent' && <CheckCircle size={18} className="text-green-500" />}
                {cg.status === 'failed' && <XCircle size={18} className="text-red-500" />}
                {cg.status === 'pending' && <Clock size={18} className="text-gray-400" />}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">{cg.zalo_groups?.group_name}</p>
                {cg.error_message && (
                  <p className="text-xs text-red-500 flex items-center gap-1 mt-1">
                    <AlertCircle size={12} />
                    {cg.error_message}
                  </p>
                )}
              </div>
              {cg.sent_at && (
                <p className="text-xs text-gray-500">{new Date(cg.sent_at).toLocaleString('vi-VN')}</p>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
