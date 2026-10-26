'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { getActiveClientWorkspace } from '@/lib/workspace-context-client'
import Link from 'next/link'
import {
  Send, Plus, Clock, CheckCircle2, AlertCircle, Phone, Loader2,
  Trash2, Pause,
} from 'lucide-react'
import { PERSONAL_CAMPAIGN_STATUS_LABELS } from '@/lib/types'
import type { PersonalCampaign } from '@/lib/types'

type CampaignWithMeta = Omit<PersonalCampaign, 'zalo_accounts'> & {
  zalo_accounts?: { name: string; phone_number: string | null } | null
  recipient_count?: number
  sent_count?: number
  failed_count?: number
}

export default function PersonalCampaignsPage() {
  const supabase = createClient()
  const [workspaceId, setWorkspaceId] = useState('')
  const [campaigns, setCampaigns] = useState<CampaignWithMeta[]>([])
  const [loading, setLoading] = useState(true)

  const loadAll = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const m = await getActiveClientWorkspace(supabase, user.id)
    if (!m) { setLoading(false); return }
    setWorkspaceId(m.workspace_id)

    // Dùng RPC aggregate: 1 query thay vì N+1 (trước đây 3 query × số campaign)
    const { data: rows, error } = await supabase.rpc('get_personal_campaigns_with_stats', {
      p_workspace_id: m.workspace_id,
    })

    if (!error && rows) {
      setCampaigns((rows as Array<Record<string, unknown>>).map((r) => ({
        id: r.id as string,
        workspace_id: m.workspace_id,
        name: r.name as string,
        status: r.status as PersonalCampaign['status'],
        scheduled_at: r.scheduled_at as string | null,
        batch_size: r.batch_size as number,
        batch_delay_minutes: r.batch_delay_minutes as number,
        zalo_account_id: r.zalo_account_id as string | null,
        zalo_accounts: r.zalo_account_name
          ? { name: r.zalo_account_name as string, phone_number: r.zalo_account_phone as string | null }
          : null,
        recipient_count: Number(r.recipient_count) || 0,
        sent_count: Number(r.sent_count) || 0,
        failed_count: Number(r.failed_count) || 0,
      })) as CampaignWithMeta[])
    } else {
      // Fallback nếu RPC chưa tồn tại (chưa chạy SQL): query đơn giản không stats
      const { data: camps } = await supabase
        .from('personal_campaigns')
        .select('id, name, status, scheduled_at, batch_size, batch_delay_minutes, zalo_account_id, zalo_accounts(name, phone_number)')
        .eq('workspace_id', m.workspace_id)
        .order('created_at', { ascending: false })
        .limit(100)
      setCampaigns((camps || []) as unknown as CampaignWithMeta[])
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadAll() }, [loadAll])

  async function handleDelete(id: string, name: string) {
    if (!confirm(`Xóa đợt gửi "${name}"?\n\nTất cả recipients sẽ bị xóa.`)) return
    await supabase.from('personal_campaigns').delete().eq('id', id)
    await loadAll()
  }

  if (loading) return <div className="flex items-center justify-center min-h-[60vh] text-gray-500"><Loader2 className="animate-spin" /></div>

  return (
    <div>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Send className="text-blue-600" size={28} />
            <h1 className="text-2xl font-bold text-gray-900">Đợt gửi cá nhân</h1>
          </div>
          <p className="text-gray-500">Gửi tin nhắn cá nhân hàng loạt theo SĐT với batch + delay tránh spam</p>
        </div>
        <Link
          href="/dashboard/personal-campaigns/new"
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 transition"
        >
          <Plus size={16} />
          Tạo đợt gửi mới
        </Link>
      </div>

      <div className="mt-6 grid gap-3">
        {campaigns.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-gray-300 p-12 text-center">
            <Send size={48} className="mx-auto text-gray-300" />
            <p className="mt-3 text-gray-700 font-medium">Chưa có đợt gửi cá nhân nào</p>
            <p className="text-sm text-gray-500 mt-1">Tạo đợt đầu tiên để gửi tin hàng loạt theo SĐT</p>
            <Link
              href="/dashboard/personal-campaigns/new"
              className="inline-flex items-center gap-2 mt-4 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Plus size={14} />Tạo đợt đầu tiên
            </Link>
          </div>
        ) : campaigns.map((c) => {
          const info = PERSONAL_CAMPAIGN_STATUS_LABELS[c.status]
          const progress = c.recipient_count ? Math.round(((c.sent_count || 0) / c.recipient_count) * 100) : 0

          return (
            <Link
              key={c.id}
              href={`/dashboard/personal-campaigns/${c.id}`}
              className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md hover:border-blue-300 transition block"
            >
              <div className="flex items-start justify-between gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xl">{info.icon}</span>
                    <h3 className="font-semibold text-gray-900">{c.name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${info.color}`}>{info.label}</span>
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500 mt-2">
                    {c.zalo_accounts && (
                      <span className="flex items-center gap-1">
                        <Phone size={11} />
                        {c.zalo_accounts.name}
                        {c.zalo_accounts.phone_number && ` · ${c.zalo_accounts.phone_number}`}
                      </span>
                    )}
                    <span>👥 {c.recipient_count} người nhận</span>
                    <span>📦 Batch {c.batch_size} người / {c.batch_delay_minutes} phút</span>
                    {c.scheduled_at && (
                      <span className="flex items-center gap-1">
                        <Clock size={11} />
                        {new Date(c.scheduled_at).toLocaleString('vi-VN')}
                      </span>
                    )}
                  </div>

                  {/* Progress bar (chỉ hiện khi đã gửi) */}
                  {(c.sent_count || 0) + (c.failed_count || 0) > 0 && (
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>{c.sent_count}/{c.recipient_count} đã gửi</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="bg-gray-200 rounded-full h-1.5 overflow-hidden">
                        <div className="h-full bg-blue-600 transition-all" style={{ width: `${progress}%` }} />
                      </div>
                      <div className="flex gap-3 mt-1.5 text-xs">
                        <span className="text-green-700">✓ {c.sent_count}</span>
                        {(c.failed_count || 0) > 0 && (
                          <span className="text-red-700">✗ {c.failed_count}</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  onClick={(e) => { e.preventDefault(); handleDelete(c.id, c.name) }}
                  className="text-gray-400 hover:text-red-500 p-2 transition"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
