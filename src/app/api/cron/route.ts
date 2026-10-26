import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { processGroupCampaign } from '@/lib/group-campaign-sender'
import { processPersonalCampaignBatch } from '@/lib/personal-campaign-sender'
import {
  extractBearerToken,
  hasValidCronSecret,
  isTrustedCronCaller,
} from '@/lib/cron-authorization'

export async function GET(request: NextRequest) {
  const expectedCronSecret = process.env.CRON_SECRET
  if (!expectedCronSecret || !hasValidCronSecret(
    extractBearerToken(request.headers.get('authorization')),
    expectedCronSecret,
  )) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!isTrustedCronCaller(request.headers.get('x-forwarded-for'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const now = new Date()
  const nowISO = now.toISOString()
  // Scheduler is intentionally allowed to catch up for a short outage, but it
  // must never replay an old backlog after a deployment or an outage.
  const configuredGraceMinutes = Number(process.env.CRON_MAX_LATE_MINUTES ?? 60)
  const maxLateMinutes = Number.isFinite(configuredGraceMinutes) && configuredGraceMinutes >= 5
    ? configuredGraceMinutes
    : 60
  const oldestAllowedScheduleISO = new Date(
    now.getTime() - maxLateMinutes * 60 * 1000,
  ).toISOString()

  // ============ 0. RECURRING PARENTS - Generate child instances ============
  // Tìm parents 'active' có next_run_at <= now + 1h (gen trước 1h cho an toàn)
  const generatedInstances: unknown[] = []
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000).toISOString()

  const { data: dueRecurringParents } = await supabase
    .from('campaigns')
    .select('id, name, next_run_at')
    .eq('is_recurring', true)
    .eq('status', 'active')
    .lte('next_run_at', oneHourFromNow)

  for (const p of dueRecurringParents || []) {
    try {
      const { data: newId, error } = await supabase.rpc('generate_recurring_instance', { p_parent_id: p.id })
      if (error) {
        generatedInstances.push({ parentId: p.id, error: error.message })
      } else {
        generatedInstances.push({ parentId: p.id, parentName: p.name, newChildId: newId })
      }
    } catch (err) {
      generatedInstances.push({ parentId: p.id, error: (err as Error).message })
    }
  }

  // ============ 1. GROUP CAMPAIGNS ============
  const { data: groupCampaigns } = await supabase
    .from('campaigns')
    .select('id, name, scheduled_at')
    .eq('status', 'scheduled')
    .gte('scheduled_at', oldestAllowedScheduleISO)
    .lte('scheduled_at', nowISO)

  // A campaign that missed the grace window is paused instead of sent. This
  // protects users from a duplicate broadcast when a former scheduler already
  // sent the message but did not persist its final status.
  const { data: staleGroupCampaigns } = await supabase
    .from('campaigns')
    .select('id, name, scheduled_at')
    .eq('status', 'scheduled')
    .lt('scheduled_at', oldestAllowedScheduleISO)

  const staleGroupResults: unknown[] = []
  if (staleGroupCampaigns?.length) {
    const { data, error } = await supabase
      .from('campaigns')
      .update({ status: 'paused' })
      .in('id', staleGroupCampaigns.map(c => c.id))
      .eq('status', 'scheduled')
      .lt('scheduled_at', oldestAllowedScheduleISO)
      .select('id, name, scheduled_at')

    if (error) {
      staleGroupResults.push({ error: error.message })
    } else {
      staleGroupResults.push(...(data || []))
    }
  }

  const groupResults: unknown[] = []

  for (const c of groupCampaigns || []) {
    try {
      // Gọi trực tiếp logic server. Đi vòng qua HTTP sẽ cần một secret cho phép
      // bypass RLS trên route public, và đó chính là cửa hậu ta muốn bỏ.
      const outcome = await processGroupCampaign(supabase, c.id)
      groupResults.push({
        campaignId: c.id,
        name: c.name,
        httpStatus: outcome.status,
        ...outcome.data,
      })
    } catch (err) {
      groupResults.push({ campaignId: c.id, error: (err as Error).message })
    }
  }

  // ============ 2. PERSONAL CAMPAIGNS (batch processing) ============
  // Logic:
  // - Campaign status='scheduled' AND scheduled_at <= now → bắt đầu (gửi batch 1)
  // - Campaign status='sending' AND last_batch_sent_at + delay_minutes <= now → gửi batch tiếp

  // 2a. Campaigns chưa bắt đầu
  const { data: pendingPersonal } = await supabase
    .from('personal_campaigns')
    .select('id, name, batch_size, batch_delay_minutes')
    .eq('status', 'scheduled')
    .gte('scheduled_at', oldestAllowedScheduleISO)
    .lte('scheduled_at', nowISO)

  const { data: stalePersonalCampaigns } = await supabase
    .from('personal_campaigns')
    .select('id, name, scheduled_at')
    .eq('status', 'scheduled')
    .lt('scheduled_at', oldestAllowedScheduleISO)

  const stalePersonalResults: unknown[] = []
  if (stalePersonalCampaigns?.length) {
    const { data, error } = await supabase
      .from('personal_campaigns')
      .update({ status: 'paused' })
      .in('id', stalePersonalCampaigns.map(c => c.id))
      .eq('status', 'scheduled')
      .lt('scheduled_at', oldestAllowedScheduleISO)
      .select('id, name, scheduled_at')

    if (error) {
      stalePersonalResults.push({ error: error.message })
    } else {
      stalePersonalResults.push(...(data || []))
    }
  }

  // 2b. Campaigns đang gửi và đến lúc batch tiếp
  const { data: sendingPersonal } = await supabase
    .from('personal_campaigns')
    .select('id, name, batch_delay_minutes, last_batch_sent_at')
    .eq('status', 'sending')

  const dueNextBatch = (sendingPersonal || []).filter(c => {
    if (!c.last_batch_sent_at) return true
    const lastTime = new Date(c.last_batch_sent_at).getTime()
    const dueAt = lastTime + c.batch_delay_minutes * 60 * 1000
    return now.getTime() >= dueAt
  })

  const personalResults: unknown[] = []

  for (const c of [...(pendingPersonal || []), ...dueNextBatch]) {
    try {
      // Gọi trực tiếp logic server, không tạo thêm một Vercel Function invocation.
      const outcome = await processPersonalCampaignBatch(supabase, c.id)
      personalResults.push({
        campaignId: c.id,
        name: c.name,
        httpStatus: outcome.status,
        ...outcome.data,
      })
    } catch (err) {
      personalResults.push({ campaignId: c.id, error: (err as Error).message })
    }
  }

  return NextResponse.json({
    message: 'Done',
    now: nowISO,
    scheduler: {
      max_late_minutes: maxLateMinutes,
      stale_group_paused: staleGroupResults,
      stale_personal_paused: stalePersonalResults,
    },
    recurring_generated: { count: generatedInstances.length, results: generatedInstances },
    group: { count: groupResults.length, results: groupResults },
    personal: { count: personalResults.length, results: personalResults },
  })
}
