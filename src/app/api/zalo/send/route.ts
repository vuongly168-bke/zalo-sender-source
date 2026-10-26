import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { processGroupCampaign } from '@/lib/group-campaign-sender'

/**
 * Gửi một đợt campaign NHÓM do người dùng bấm.
 *
 * Route này chỉ nhận phiên đăng nhập thật. Cron gọi thẳng
 * `processGroupCampaign` với admin client thay vì đi vòng qua HTTP, nên ở đây
 * không còn cửa hậu bằng header nào cả.
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

  const outcome = await processGroupCampaign(supabase, campaignId)
  return NextResponse.json(outcome.data, { status: outcome.status })
}
