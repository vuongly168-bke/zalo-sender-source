import type { SupabaseClient } from '@supabase/supabase-js'
import { callZaloApi, extractZaloError, extractZaloErrorCode } from '@/lib/zalo-api'
import { createAdminClient } from '@/lib/supabase/admin'

type GroupSendResponse = Record<string, unknown>

export type GroupSendResult = {
  status: number
  data: GroupSendResponse
}

function result(data: GroupSendResponse, status = 200): GroupSendResult {
  return { status, data }
}

async function callApi(
  supabase: SupabaseClient,
  zaloAccountId: string,
  apiUrl: string,
  bearerToken: string,
  body: Record<string, unknown>,
) {
  // Không tự retry thao tác gửi vì upstream có thể đã gửi thành công nhưng trả
  // response lỗi; retry khi chưa có idempotency key sẽ làm người nhận bị trùng tin.
  const sendResult = await callZaloApi({
    supabase,
    zaloAccountId,
    apiUrl,
    bearerToken,
    body,
    maxAttempts: 1,
  })
  console.info('[zalo-send] status=', sendResult.status)
  return sendResult
}

/**
 * Gửi một đợt campaign NHÓM.
 *
 * Dùng chung cho route do người dùng bấm và cho cron, để cron không phải gọi
 * HTTP ngược vào chính deployment và không cần một secret bypass RLS.
 *
 * `supabase` quyết định phạm vi quyền: route người dùng truyền client theo RLS
 * của phiên đăng nhập, cron truyền admin client. Việc đọc api_keys luôn đi qua
 * admin client riêng vì bảng đó đã bị thu hồi quyền của `authenticated`.
 */
export async function processGroupCampaign(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<GroupSendResult> {
  const { data: campaign } = await supabase
    .from('campaigns')
    .select('*, projects(zalo_account_id, workspace_id)')
    .eq('id', campaignId)
    .single()

  if (!campaign) return result({ error: 'Campaign not found' }, 404)

  const project = campaign.projects as { zalo_account_id: string | null; workspace_id: string }
  const zaloAccountId = project.zalo_account_id
  if (!zaloAccountId) {
    return result({ error: 'Project chưa được gắn Zalo Account' }, 400)
  }

  const keyStore = createAdminClient()
  const { data: authorizedAccount } = await keyStore
    .from('zalo_accounts')
    .select('id')
    .eq('id', zaloAccountId)
    .eq('workspace_id', project.workspace_id)
    .maybeSingle()
  if (!authorizedAccount) {
    return result({ error: 'Tài khoản Zalo không thuộc workspace của dự án' }, 400)
  }

  const { data: imageApiKey } = await keyStore
    .from('api_keys')
    .select('api_url, bearer_token')
    .eq('zalo_account_id', zaloAccountId)
    .eq('key_type', 'group_send_images')
    .single()

  const { data: messageApiKey } = await keyStore
    .from('api_keys')
    .select('api_url, bearer_token')
    .eq('zalo_account_id', zaloAccountId)
    .eq('key_type', 'group_send_message')
    .single()

  const { data: campaignGroups } = await supabase
    .from('campaign_groups')
    .select('*, zalo_groups(group_id)')
    .eq('campaign_id', campaignId)
    .in('status', ['pending', 'failed'])

  if (!campaignGroups || campaignGroups.length === 0) {
    return result({ error: 'Không có nhóm nào cần gửi' }, 400)
  }

  if (campaign.status === 'sending') {
    return result({ error: 'Đợt gửi này đang được một tiến trình khác xử lý', skipped: true }, 409)
  }

  // Claim nguyên tử sau khi đã validate đủ dữ liệu. Hai request cùng bấm gửi
  // có thể cùng đọc campaign, nhưng chỉ một request đổi được status sang sending.
  const { data: claimedCampaign, error: claimError } = await supabase
    .from('campaigns')
    .update({ status: 'sending' })
    .eq('id', campaignId)
    .in('status', ['draft', 'scheduled', 'failed', 'partial'])
    .select('id')
    .maybeSingle()

  if (claimError) {
    return result({ error: 'Không thể khóa đợt gửi: ' + claimError.message }, 500)
  }
  if (!claimedCampaign) {
    return result({ error: 'Đợt gửi đã được xử lý hoặc đang chạy ở tiến trình khác', skipped: true }, 409)
  }

  let successCount = 0
  let failedCount = 0

  // Lấy mảng image_urls (mới) hoặc fallback image_url (cũ)
  const allImageUrls: string[] = Array.isArray(campaign.image_urls) && campaign.image_urls.length > 0
    ? campaign.image_urls
    : (campaign.image_url ? [campaign.image_url] : [])

  for (const cg of campaignGroups) {
    const zaloGroupId = (cg.zalo_groups as { group_id: string }).group_id
    const errors: string[] = []

    try {
      if (allImageUrls.length > 0 && !imageApiKey) errors.push('Thiếu API gửi ảnh nhóm')
      if (campaign.message && !messageApiKey) errors.push('Thiếu API gửi tin nhắn nhóm')

      // Gửi tất cả ảnh trong 1 request (API func.vn nhận urls[] array)
      if (allImageUrls.length > 0 && imageApiKey) {
        const r = await callApi(supabase, zaloAccountId, imageApiKey.api_url, imageApiKey.bearer_token, {
          urls: allImageUrls,
          group_id: zaloGroupId,
        })
        if (r.status < 200 || r.status >= 300 || extractZaloErrorCode(r.data) !== null) {
          errors.push(`Image fail (${r.status}): ${extractZaloError(r.data) || 'API không có chi tiết'}`)
        }
      }

      if (campaign.message && messageApiKey) {
        const r = await callApi(supabase, zaloAccountId, messageApiKey.api_url, messageApiKey.bearer_token, {
          group_id: zaloGroupId,
          message: campaign.message,
        })
        if (r.status < 200 || r.status >= 300 || extractZaloErrorCode(r.data) !== null) {
          errors.push(`Message fail (${r.status}): ${extractZaloError(r.data) || 'API không có chi tiết'}`)
        }
      }

      if (!campaign.message && allImageUrls.length === 0) {
        errors.push('No content')
      }

      const hasError = errors.length > 0
      await supabase.from('campaign_groups').update({
        status: hasError ? 'failed' : 'sent',
        sent_at: new Date().toISOString(),
        error_message: hasError ? errors.join('; ') : null,
      }).eq('id', cg.id)

      if (hasError) failedCount++
      else successCount++
    } catch (err) {
      await supabase.from('campaign_groups').update({
        status: 'failed',
        error_message: (err as Error).message,
      }).eq('id', cg.id)
      failedCount++
    }
  }

  const finalStatus = failedCount === 0 ? 'sent' : successCount === 0 ? 'failed' : 'partial'
  await supabase.from('campaigns').update({ status: finalStatus }).eq('id', campaignId)

  return result({ successCount, failedCount, totalGroups: campaignGroups.length })
}
