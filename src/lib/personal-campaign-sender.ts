import type { SupabaseClient } from '@supabase/supabase-js'
import { callZaloApi, extractZaloError, extractZaloErrorCode } from '@/lib/zalo-api'
import { createAdminClient } from '@/lib/supabase/admin'

type PersonalCampaignRow = {
  id: string
  workspace_id: string
  status: string
  zalo_account_id: string | null
  message: string | null
  image_url: string | null
  image_urls?: string[] | null
  current_batch: number | null
  last_batch_sent_at: string | null
  message_delay_seconds?: number | null
}

type PersonalSendResponse = Record<string, unknown>

export type PersonalSendResult = {
  status: number
  data: PersonalSendResponse
}

function result(data: PersonalSendResponse, status = 200): PersonalSendResult {
  return { status, data }
}

async function stopCampaign(
  supabase: SupabaseClient,
  campaignId: string,
  message: string,
  status = 400,
): Promise<PersonalSendResult> {
  const { error } = await supabase
    .from('personal_campaigns')
    .update({ status: 'failed' })
    .eq('id', campaignId)
    .in('status', ['scheduled', 'sending'])

  if (error) {
    return result({
      error: message,
      campaignStopError: error.message,
    }, 500)
  }

  return result({ error: message, campaignStopped: true }, status)
}

async function finishCampaign(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<PersonalSendResult> {
  const [sentResult, failedResult] = await Promise.all([
    supabase
      .from('personal_campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'sent'),
    supabase
      .from('personal_campaign_recipients')
      .select('id', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'failed'),
  ])

  if (sentResult.error || failedResult.error) {
    return result({
      error: 'Không thể tổng kết trạng thái campaign',
      details: sentResult.error?.message || failedResult.error?.message,
    }, 500)
  }

  const totalSent = sentResult.count || 0
  const totalFailed = failedResult.count || 0
  const finalStatus = totalSent === 0
    ? 'failed'
    : totalFailed > 0
      ? 'partial'
      : 'sent'

  const { error } = await supabase
    .from('personal_campaigns')
    .update({ status: finalStatus })
    .eq('id', campaignId)
    .in('status', ['scheduled', 'sending'])

  if (error) {
    return result({
      error: 'Không thể chốt trạng thái campaign',
      details: error.message,
    }, 500)
  }

  return result({
    message: 'Campaign không còn người nhận đang chờ',
    completed: true,
    campaignStatus: finalStatus,
    totalSent,
    totalFailed,
  })
}

async function claimCampaign(
  supabase: SupabaseClient,
  campaign: PersonalCampaignRow,
  batchNumber: number,
): Promise<boolean> {
  const claimedAt = new Date().toISOString()
  let query = supabase
    .from('personal_campaigns')
    .update({
      status: 'sending',
      current_batch: Math.max(campaign.current_batch || 0, batchNumber),
      // Ghi ngay lúc nhận việc để cron kế tiếp không chạy trùng batch đang xử lý.
      last_batch_sent_at: claimedAt,
    })
    .eq('id', campaign.id)
    .in('status', ['scheduled', 'sending'])

  // Optimistic lock bằng giá trị đã đọc. Hai request đồng thời chỉ một request
  // được đổi last_batch_sent_at từ giá trị cũ sang claimedAt.
  query = campaign.last_batch_sent_at
    ? query.eq('last_batch_sent_at', campaign.last_batch_sent_at)
    : query.is('last_batch_sent_at', null)

  const { data, error } = await query.select('id').maybeSingle()
  if (error) throw new Error(`Không thể khóa campaign: ${error.message}`)
  return Boolean(data)
}

/**
 * Xử lý một batch gửi cá nhân.
 *
 * Dùng chung cho route do người dùng bấm và cron để cron không phải gọi HTTP
 * ngược vào chính deployment Vercel.
 */
export async function processPersonalCampaignBatch(
  supabase: SupabaseClient,
  campaignId: string,
): Promise<PersonalSendResult> {
  const { data: rawCampaign, error: campaignError } = await supabase
    .from('personal_campaigns')
    .select('*')
    .eq('id', campaignId)
    .single()

  if (campaignError || !rawCampaign) {
    return result({ error: 'Campaign not found' }, 404)
  }

  const campaign = rawCampaign as PersonalCampaignRow
  if (!campaign.zalo_account_id) {
    return stopCampaign(supabase, campaignId, 'Campaign chưa gắn Zalo Account')
  }

  const keyStore = createAdminClient()
  const { data: authorizedAccount } = await keyStore
    .from('zalo_accounts')
    .select('id')
    .eq('id', campaign.zalo_account_id)
    .eq('workspace_id', campaign.workspace_id)
    .maybeSingle()
  if (!authorizedAccount) {
    return stopCampaign(supabase, campaignId, 'Tài khoản Zalo không thuộc workspace của campaign')
  }

  // Luôn lấy batch pending nhỏ nhất thay vì current_batch + 1. Cách này xử lý
  // đúng cả trường hợp "Gửi lại lỗi" đưa recipient của batch cũ về pending.
  const { data: firstPending, error: pendingError } = await supabase
    .from('personal_campaign_recipients')
    .select('batch_number')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .not('batch_number', 'is', null)
    .order('batch_number', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (pendingError) {
    return result({
      error: 'Không thể kiểm tra người nhận đang chờ',
      details: pendingError.message,
    }, 500)
  }

  if (!firstPending?.batch_number) {
    return finishCampaign(supabase, campaignId)
  }

  const nextBatch = firstPending.batch_number as number

  let claimed: boolean
  try {
    claimed = await claimCampaign(supabase, campaign, nextBatch)
  } catch (error) {
    return result({ error: (error as Error).message }, 500)
  }

  if (!claimed) {
    return result({
      error: 'Campaign đang được một tiến trình khác xử lý',
      skipped: true,
      batch: nextBatch,
    }, 409)
  }

  const [{ data: keys, error: keysError }, { data: recipients, error: recipientsError }] = await Promise.all([
    keyStore
      .from('api_keys')
      .select('key_type, api_url, bearer_token, account_token')
      .eq('zalo_account_id', campaign.zalo_account_id)
      .in('key_type', ['user_send_message', 'user_send_images']),
    supabase
      .from('personal_campaign_recipients')
      .select('id, contacts(phone, name, zalo_user_id)')
      .eq('campaign_id', campaignId)
      .eq('batch_number', nextBatch)
      .eq('status', 'pending'),
  ])

  if (keysError || recipientsError) {
    return result({
      error: 'Không thể tải dữ liệu gửi',
      details: keysError?.message || recipientsError?.message,
    }, 500)
  }

  if (!recipients || recipients.length === 0) {
    // Recipient có thể vừa được request khác xử lý xong sau bước claim.
    return finishCampaign(supabase, campaignId)
  }

  const msgKey = keys?.find(key => key.key_type === 'user_send_message')
  const imgKey = keys?.find(key => key.key_type === 'user_send_images')
  const allImageUrls: string[] = Array.isArray(campaign.image_urls) && campaign.image_urls.length > 0
    ? campaign.image_urls
    : campaign.image_url
      ? [campaign.image_url]
      : []

  if (campaign.message && !msgKey) {
    return stopCampaign(supabase, campaignId, 'Thiếu API user_send_message của Zalo Account')
  }
  if (allImageUrls.length > 0 && !imgKey) {
    return stopCampaign(supabase, campaignId, 'Thiếu API user_send_images của Zalo Account')
  }

  let successCount = 0
  let failedCount = 0

  for (let index = 0; index < recipients.length; index++) {
    const recipient = recipients[index]
    const contact = recipient.contacts as unknown as {
      phone: string
      name: string | null
      zalo_user_id: string | null
    } | null

    if (!contact) {
      await supabase
        .from('personal_campaign_recipients')
        .update({
          status: 'failed',
          error_message: 'Contact bị xóa',
          sent_at: new Date().toISOString(),
        })
        .eq('id', recipient.id)
      failedCount++
      continue
    }

    const errors: string[] = []

    try {
      const message = (campaign.message || '')
        .replace(/\{ten\}/gi, contact.name || 'Anh/chị')
        .replace(/\{name\}/gi, contact.name || 'Anh/chị')
        .replace(/\{sdt\}/gi, contact.phone)
        .replace(/\{phone\}/gi, contact.phone)

      const baseBody: Record<string, string> = contact.zalo_user_id
        ? { user_id: contact.zalo_user_id }
        : { phone_number: contact.phone }

      if (allImageUrls.length > 0 && imgKey) {
        const response = await callZaloApi({
          supabase,
          zaloAccountId: campaign.zalo_account_id,
          apiUrl: imgKey.api_url,
          bearerToken: imgKey.bearer_token,
          accountToken: imgKey.account_token,
          body: { ...baseBody, urls: allImageUrls },
          maxAttempts: 1,
        })
        if (response.status < 200 || response.status >= 300 || extractZaloErrorCode(response.data) !== null) {
          errors.push(`Image fail (${response.status}): ${(extractZaloError(response.data) || response.text).substring(0, 100)}`)
        }
      }

      if (message && msgKey) {
        const response = await callZaloApi({
          supabase,
          zaloAccountId: campaign.zalo_account_id,
          apiUrl: msgKey.api_url,
          bearerToken: msgKey.bearer_token,
          accountToken: msgKey.account_token,
          body: { ...baseBody, message },
          maxAttempts: 1,
        })
        if (response.status < 200 || response.status >= 300 || extractZaloErrorCode(response.data) !== null) {
          errors.push(`Message fail (${response.status}): ${(extractZaloError(response.data) || response.text).substring(0, 100)}`)
        }
      }

      const hasError = errors.length > 0
      await supabase
        .from('personal_campaign_recipients')
        .update({
          status: hasError ? 'failed' : 'sent',
          sent_at: new Date().toISOString(),
          error_message: hasError ? errors.join('; ').substring(0, 500) : null,
        })
        .eq('id', recipient.id)

      if (hasError) failedCount++
      else successCount++
    } catch (error) {
      await supabase
        .from('personal_campaign_recipients')
        .update({
          status: 'failed',
          sent_at: new Date().toISOString(),
          error_message: (error as Error).message.substring(0, 500),
        })
        .eq('id', recipient.id)
      failedCount++
    }

    // Giữ nguyên delay nghiệp vụ đã cấu hình; hàng đợi phân tán chỉ bổ sung
    // bảo vệ khi campaign khác dùng cùng Zalo Account trong khoảng nghỉ này.
    if (index < recipients.length - 1) {
      const delayMs = (campaign.message_delay_seconds || 3) * 1000
      const jitter = Math.floor(Math.random() * 1000) - 500
      await new Promise(resolve => setTimeout(resolve, Math.max(500, delayMs + jitter)))
    }
  }

  // last_batch_sent_at tính từ lúc batch hoàn tất để delay giữa hai batch đúng nghĩa.
  const { error: progressError } = await supabase
    .from('personal_campaigns')
    .update({
      current_batch: Math.max(campaign.current_batch || 0, nextBatch),
      last_batch_sent_at: new Date().toISOString(),
    })
    .eq('id', campaignId)

  if (progressError) {
    return result({
      error: 'Đã gửi xong nhưng không thể cập nhật tiến độ campaign',
      details: progressError.message,
      batch: nextBatch,
      successCount,
      failedCount,
    }, 500)
  }

  const { data: nextPending, error: nextPendingError } = await supabase
    .from('personal_campaign_recipients')
    .select('id')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .limit(1)
    .maybeSingle()

  if (nextPendingError) {
    return result({
      error: 'Đã gửi xong nhưng không thể kiểm tra batch tiếp theo',
      details: nextPendingError.message,
      batch: nextBatch,
      successCount,
      failedCount,
    }, 500)
  }

  if (!nextPending) {
    const finished = await finishCampaign(supabase, campaignId)
    if (finished.status !== 200) return finished
  }

  return result({
    batch: nextBatch,
    successCount,
    failedCount,
    totalInBatch: recipients.length,
    hasMore: Boolean(nextPending),
  })
}
