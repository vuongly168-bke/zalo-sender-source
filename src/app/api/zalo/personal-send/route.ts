import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processPersonalCampaignBatch } from '@/lib/personal-campaign-sender'

/**
 * Gửi 1 batch của personal campaign do người dùng bấm.
 * - Tự tìm batch nhỏ nhất còn recipient status='pending'
 * - Render placeholders ({ten}, {sdt})
 * - Gọi user_send_message + user_send_images (với Account-Token)
 * - Update status từng recipient
 * - Khóa optimistic để tránh 2 tiến trình gửi trùng cùng một batch
 * - Nếu xong batch cuối → status = sent/partial/failed
 *
 * Cron gọi thẳng `processPersonalCampaignBatch` với admin client, nên route này
 * chỉ nhận phiên đăng nhập thật.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let campaignId = ''
  try {
    const body = await request.json()
    campaignId = typeof body.campaignId === 'string' ? body.campaignId : ''
  } catch {
    return NextResponse.json({ error: 'Dữ liệu không hợp lệ' }, { status: 400 })
  }
  if (!campaignId) return NextResponse.json({ error: 'Thiếu campaignId' }, { status: 400 })

  const outcome = await processPersonalCampaignBatch(supabase, campaignId)
  return NextResponse.json(outcome.data, { status: outcome.status })
}
