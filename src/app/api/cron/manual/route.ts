import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveServerWorkspace } from '@/lib/workspace-context-server'
import { canManuallyRunCron } from '@/lib/manual-cron-authorization'
import { processGroupCampaign } from '@/lib/group-campaign-sender'

export async function POST() {
  const userClient = await createClient()
  const { data: { user } } = await userClient.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: profile }, { currentWorkspace }] = await Promise.all([
    userClient
      .from('profiles')
      .select('is_super_admin')
      .eq('id', user.id)
      .maybeSingle(),
    getActiveServerWorkspace(userClient, user.id),
  ])

  if (!currentWorkspace || !canManuallyRunCron(
    currentWorkspace.role,
    Boolean(profile?.is_super_admin),
  )) {
    return NextResponse.json({ error: 'Bạn không có quyền chạy cron thủ công' }, { status: 403 })
  }

  const supabase = createAdminClient()
  const workspaceId = currentWorkspace.id
  const now = new Date()
  const nowISO = now.toISOString()
  const configuredGraceMinutes = Number(process.env.CRON_MAX_LATE_MINUTES ?? 60)
  const maxLateMinutes = Number.isFinite(configuredGraceMinutes) && configuredGraceMinutes >= 5
    ? configuredGraceMinutes
    : 60
  const oldestAllowedScheduleISO = new Date(
    now.getTime() - maxLateMinutes * 60 * 1000,
  ).toISOString()

  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, scheduled_at, projects!inner(workspace_id)')
    .eq('status', 'scheduled')
    .gte('scheduled_at', oldestAllowedScheduleISO)
    .lte('scheduled_at', nowISO)
    .eq('projects.workspace_id', workspaceId)

  const { data: staleCampaigns } = await supabase
    .from('campaigns')
    .select('id, name, scheduled_at, projects!inner(workspace_id)')
    .eq('status', 'scheduled')
    .lt('scheduled_at', oldestAllowedScheduleISO)
    .eq('projects.workspace_id', workspaceId)

  const staleResults: unknown[] = []
  if (staleCampaigns?.length) {
    const { data, error } = await supabase
      .from('campaigns')
      .update({ status: 'paused' })
      .in('id', staleCampaigns.map(campaign => campaign.id))
      .eq('status', 'scheduled')
      .lt('scheduled_at', oldestAllowedScheduleISO)
      .select('id, name, scheduled_at')

    if (error) {
      staleResults.push({ error: error.message })
    } else {
      staleResults.push(...(data || []))
    }
  }

  if (!campaigns || campaigns.length === 0) {
    return NextResponse.json({
      message: 'Không có đợt gửi nào đến hạn',
      count: 0,
      stale_paused: staleResults,
    })
  }

  const results = []

  for (const campaign of campaigns) {
    try {
      // Quyền đã được kiểm ở trên và danh sách campaign đã lọc theo workspace
      // đang thao tác, nên ở đây gọi thẳng logic gửi thay vì tự fetch lại chính
      // mình bằng một secret bypass RLS.
      const outcome = await processGroupCampaign(supabase, campaign.id)
      results.push({
        campaignId: campaign.id,
        name: campaign.name,
        httpStatus: outcome.status,
        ...outcome.data,
      })
    } catch (err) {
      results.push({ campaignId: campaign.id, name: campaign.name, error: (err as Error).message })
    }
  }

  return NextResponse.json({
    message: `Đã xử lý ${results.length} đợt gửi`,
    count: results.length,
    results,
    stale_paused: staleResults,
  })
}
