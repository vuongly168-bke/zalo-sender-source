import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { callZaloApi, extractZaloError, extractZaloErrorCode, ZaloQueueBusyError } from '@/lib/zalo-api'

export const maxDuration = 60

/**
 * Chuẩn hóa số điện thoại VN (thành dạng 0xxx)
 */
function normalizePhone(phone: string): string {
  let p = String(phone).trim().replace(/[\s\-\(\)]/g, '')
  if (p.startsWith('+84')) p = '0' + p.substring(3)
  else if (p.startsWith('84')) p = '0' + p.substring(2)
  if (!p.startsWith('0') && !p.startsWith('+')) p = '0' + p
  return p
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { phone, userId, zaloAccountId } = await request.json()

  if (!phone && !userId) {
    return NextResponse.json({ error: 'Cần phone hoặc userId' }, { status: 400 })
  }
  if (!zaloAccountId) {
    return NextResponse.json({ error: 'Cần chọn Zalo Account' }, { status: 400 })
  }

  const { data: account } = await supabase
    .from('zalo_accounts')
    .select('id')
    .eq('id', zaloAccountId)
    .maybeSingle()
  if (!account) {
    return NextResponse.json({ error: 'Zalo Account không tồn tại hoặc bạn không có quyền truy cập' }, { status: 404 })
  }

  // Lấy API key get_user_info của Zalo Account này
  const admin = createAdminClient()
  const { data: apiKey } = await admin
    .from('api_keys')
    .select('api_url, bearer_token, account_token')
    .eq('zalo_account_id', zaloAccountId)
    .eq('key_type', 'get_user_info')
    .single()

  if (!apiKey) {
    return NextResponse.json({
      error: 'Zalo Account chưa cấu hình API "Lấy thông tin User". Vào Cài đặt API để bổ sung.',
    }, { status: 400 })
  }

  if (!apiKey.account_token) {
    return NextResponse.json({
      error: 'API "Lấy thông tin User" thiếu Account Token. Vào Cài đặt API để bổ sung.',
    }, { status: 400 })
  }

  // Build payload
  const payload: Record<string, string> = {}
  if (userId) {
    payload.user_id = String(userId).trim()
  } else {
    payload.phone_number = normalizePhone(String(phone))
  }

  try {
    const result = await callZaloApi({
      supabase,
      zaloAccountId,
      apiUrl: apiKey.api_url,
      bearerToken: apiKey.bearer_token,
      accountToken: apiKey.account_token,
      body: payload,
    })
    console.info('[user-info] status=', result.status, 'attempts=', result.attempts)

    if (!result.data) {
      return NextResponse.json({ error: 'API trả về không phải JSON' }, { status: 400 })
    }
    const data = result.data

    const dataField = data.data as Record<string, unknown> | undefined
    // Helper: stringify an toàn (object → JSON, string → giữ nguyên, number → toString)
    const safeStr = (v: unknown): string => {
      if (v == null) return ''
      if (typeof v === 'string') return v
      if (typeof v === 'number' || typeof v === 'boolean') return String(v)
      try { return JSON.stringify(v) } catch { return '[unknown]' }
    }
    const errorMsg = extractZaloError(data) || safeStr(
      dataField?.error_message ?? data.message ?? data.error
    )
    const errorCode = extractZaloErrorCode(data) ?? (dataField?.error_code as number) ?? (data.status as number)

    // Trường hợp lỗi (HTTP non-200 hoặc data.status !== 200 hoặc data.data.error_code !== 0)
    const apiHasError =
      result.status < 200 || result.status >= 300
      || (data.status !== undefined && data.status !== 200)
      || (dataField?.error_code !== undefined && dataField.error_code !== 0)

    if (apiHasError) {
      // Map các error message Zalo phổ biến sang tiếng Việt thân thiện
      let friendlyMsg = errorMsg || `API code ${errorCode || result.status}`
      const lowerMsg = String(friendlyMsg).toLowerCase()
      if (lowerMsg.includes('not found') || lowerMsg.includes('user') && lowerMsg.includes('not')) {
        friendlyMsg = 'Số này chưa đăng ký Zalo (hoặc đã đổi số)'
      } else if (lowerMsg.includes('private') || lowerMsg.includes('privacy')) {
        friendlyMsg = 'Người dùng đặt thông tin riêng tư, không lookup được'
      } else if (lowerMsg.includes('rate') || lowerMsg.includes('limit')) {
        friendlyMsg = 'API bị rate limit. Thử lại sau ít phút.'
      } else if (lowerMsg.includes('token') || lowerMsg.includes('unauthorized')) {
        friendlyMsg = 'Token hết hạn hoặc sai. Vào Cài đặt API để cập nhật.'
      } else if (!errorMsg) {
        friendlyMsg = `API code ${errorCode || result.status} (không có chi tiết). Kiểm tra log server hoặc số này có thể chưa có Zalo.`
      }

      return NextResponse.json({ error: friendlyMsg }, { status: 400 })
    }

    // Parse response: thử nhiều cấu trúc theo code GAS
    let foundUserId: string | null = null
    let foundUserName: string | null = null
    let foundAvatar: string | null = null

    const innerData = dataField?.data as Record<string, unknown> | undefined

    if (innerData) {
      // Cấu trúc 1: data.data.userId, data.data.zaloName
      if (innerData.userId) {
        foundUserId = String(innerData.userId)
        foundUserName = (innerData.zaloName as string) || (innerData.displayName as string) || null
        foundAvatar = (innerData.avatar as string) || null
      } else {
        // Cấu trúc 2: data.data["someUserId"] = { userId, zaloName, ... }
        const userKeys = Object.keys(innerData)
        if (userKeys.length > 0) {
          const firstKey = userKeys[0]
          const userObj = innerData[firstKey] as Record<string, unknown>
          if (userObj && typeof userObj === 'object') {
            foundUserId = (userObj.userId as string) || firstKey
            foundUserName = (userObj.zaloName as string) || (userObj.displayName as string) || null
            foundAvatar = (userObj.avatar as string) || null
          }
        }
      }
    }
    // Cấu trúc 3: data.userId trực tiếp
    if (!foundUserId && dataField?.userId) {
      foundUserId = String(dataField.userId)
      foundUserName = (dataField.zaloName as string) || null
      foundAvatar = (dataField.avatar as string) || null
    }

    if (!foundUserId && !foundUserName) {
      return NextResponse.json({
        error: 'Không tìm thấy user (số có thể chưa đăng ký Zalo hoặc bị riêng tư)',
      }, { status: 404 })
    }

    return NextResponse.json({
      userId: foundUserId,
      userName: foundUserName,
      avatar: foundAvatar,
      normalizedPhone: phone ? normalizePhone(String(phone)) : null,
    })
  } catch (err) {
    if (err instanceof ZaloQueueBusyError) {
      const retryAfterSeconds = Math.max(5, Math.ceil(err.retryAfterMs / 1000))
      return NextResponse.json({
        error: `Có nhiều người đang thao tác cùng lúc. Vui lòng thử lại sau ${retryAfterSeconds} giây.`,
        retryAfterSeconds,
      }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } })
    }
    return NextResponse.json({
      error: 'Không thể kết nối API: ' + (err as Error).message,
    }, { status: 500 })
  }
}
