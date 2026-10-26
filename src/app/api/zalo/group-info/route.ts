import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  callZaloApi,
  extractZaloError,
  extractZaloErrorCode,
  normalizeZaloGroupLink,
  ZaloQueueBusyError,
  type ZaloApiResult,
} from '@/lib/zalo-api'

export const maxDuration = 60

type GroupInfo = {
  name: string
  groupId: string
  memberCount: number
}

type CachedGroupInfo = GroupInfo & { expiresAt: number }

const successfulLookups = new Map<string, CachedGroupInfo>()
const inFlightLookups = new Map<string, Promise<{ result: ZaloApiResult; group: GroupInfo }>>()
const CACHE_TTL_MS = 10 * 60 * 1000

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function firstString(record: Record<string, unknown>, fields: string[]): string | null {
  for (const field of fields) {
    const value = record[field]
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number') return String(value)
  }
  return null
}

function firstNumber(record: Record<string, unknown>, fields: string[]): number {
  for (const field of fields) {
    const value = Number(record[field])
    if (Number.isFinite(value) && value >= 0) return value
  }
  return 0
}

function parseGroupInfo(data: Record<string, unknown>): GroupInfo | null {
  const dataField = asRecord(data.data)
  const candidates = [asRecord(dataField?.data), dataField, data].filter(Boolean) as Record<string, unknown>[]

  for (const candidate of candidates) {
    const groupId = firstString(candidate, ['groupId', 'group_id', 'id'])
    if (!groupId) continue

    return {
      groupId,
      name: firstString(candidate, ['name', 'groupName', 'group_name']) || 'Không rõ tên',
      memberCount: firstNumber(candidate, ['totalMember', 'memberCount', 'member_count', 'total_member']),
    }
  }

  return null
}

function friendlyUpstreamError(result: ZaloApiResult): string {
  const detail = extractZaloError(result.data)
  const code = extractZaloErrorCode(result.data) || result.status
  const lower = detail.toLowerCase()

  if (code === 401 || lower.includes('token') || lower.includes('unauthorized')) {
    return 'Token API đã hết hạn hoặc không hợp lệ. Vào Cài đặt API để cập nhật token.'
  }
  if (code === 429 || lower.includes('rate') || lower.includes('too many')) {
    return 'API Zalo đang giới hạn tần suất. Hệ thống đã tự thử lại; vui lòng chờ khoảng 30 giây rồi thử lại.'
  }
  if (lower.includes('not found') || lower.includes('không tìm thấy')) {
    return 'Không tìm thấy nhóm. Kiểm tra lại link hoặc quyền truy cập nhóm của tài khoản Zalo này.'
  }
  if (code === 403 || code === 404) {
    return `API Zalo từ chối tạm thời (mã ${code}) sau ${result.attempts} lần thử. Vui lòng chờ 30 giây; nếu vẫn lỗi, kiểm tra token/API func.vn.`
  }
  if (detail) {
    return `API Zalo báo lỗi (mã ${code}): ${detail.substring(0, 300)}`
  }
  return `API Zalo không phản hồi đúng (mã ${code}) sau ${result.attempts} lần thử.`
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' }, { status: 401 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Dữ liệu gửi lên không hợp lệ.' }, { status: 400 })
  }

  const projectId = typeof body.projectId === 'string' ? body.projectId : ''
  const groupLink = normalizeZaloGroupLink(body.groupLink)
  if (!projectId) return NextResponse.json({ error: 'Thiếu mã dự án.' }, { status: 400 })
  if (!groupLink) {
    return NextResponse.json({ error: 'Link nhóm không hợp lệ. Dùng đúng dạng https://zalo.me/g/...' }, { status: 400 })
  }

  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('zalo_account_id, workspace_id')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    return NextResponse.json({ error: 'Không tìm thấy dự án hoặc bạn không có quyền truy cập.' }, { status: 404 })
  }
  if (!project.zalo_account_id) {
    return NextResponse.json({ error: 'Project chưa được gắn Zalo Account. Vào Cài đặt > Zalo Accounts để cấu hình.' }, { status: 400 })
  }

  const admin = createAdminClient()
  const { data: authorizedAccount } = await admin
    .from('zalo_accounts')
    .select('id')
    .eq('id', project.zalo_account_id)
    .eq('workspace_id', project.workspace_id)
    .maybeSingle()
  if (!authorizedAccount) {
    return NextResponse.json({ error: 'Tài khoản Zalo không thuộc workspace của dự án.' }, { status: 400 })
  }

  const { data: apiKey, error: apiKeyError } = await admin
    .from('api_keys')
    .select('api_url, bearer_token')
    .eq('zalo_account_id', project.zalo_account_id)
    .eq('key_type', 'get_group_info')
    .single()

  if (apiKeyError || !apiKey) {
    return NextResponse.json({ error: 'Zalo Account chưa cấu hình API "Lấy thông tin Group".' }, { status: 400 })
  }

  const lookupKey = `${project.zalo_account_id}:${groupLink}`
  const cached = successfulLookups.get(lookupKey)
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({
      name: cached.name,
      groupId: cached.groupId,
      memberCount: cached.memberCount,
      cached: true,
    })
  }
  if (cached) successfulLookups.delete(lookupKey)

  try {
    let lookupPromise = inFlightLookups.get(lookupKey)
    if (!lookupPromise) {
      lookupPromise = (async () => {
        const result = await callZaloApi({
          supabase,
          zaloAccountId: project.zalo_account_id,
          apiUrl: apiKey.api_url,
          bearerToken: apiKey.bearer_token,
          body: { group_link: groupLink },
        })

        const apiErrorCode = extractZaloErrorCode(result.data)
        if (result.status < 200 || result.status >= 300 || apiErrorCode !== null) {
          throw Object.assign(new Error(friendlyUpstreamError(result)), { upstreamResult: result })
        }
        if (!result.data) {
          throw new Error('API Zalo trả về dữ liệu không phải JSON. Vui lòng kiểm tra lại URL API trong Cài đặt.')
        }

        const group = parseGroupInfo(result.data)
        if (!group) {
          throw new Error('API không trả về groupId. Kiểm tra link nhóm, token và quyền của tài khoản Zalo.')
        }
        return { result, group }
      })()
      inFlightLookups.set(lookupKey, lookupPromise)
    }

    const { result, group } = await lookupPromise
    successfulLookups.set(lookupKey, { ...group, expiresAt: Date.now() + CACHE_TTL_MS })
    console.info(`[group-info:${requestId}] success attempts=${result.attempts}`)
    return NextResponse.json(group)
  } catch (error) {
    if (error instanceof ZaloQueueBusyError) {
      const retryAfterSeconds = Math.max(5, Math.ceil(error.retryAfterMs / 1000))
      console.warn(`[group-info:${requestId}] queue-full retry-after=${retryAfterSeconds}s`)
      return NextResponse.json({
        error: `Có nhiều người đang thao tác cùng lúc. Yêu cầu đã được bảo vệ; vui lòng thử lại sau ${retryAfterSeconds} giây.`,
        retryAfterSeconds,
      }, {
        status: 429,
        headers: { 'Retry-After': String(retryAfterSeconds) },
      })
    }

    const message = error instanceof Error ? error.message : 'Lỗi không xác định'
    const isTimeout = error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError')
    console.error(`[group-info:${requestId}] failed:`, message)
    return NextResponse.json({
      error: isTimeout
        ? 'API Zalo phản hồi quá chậm sau nhiều lần thử. Vui lòng chờ 30 giây rồi thử lại.'
        : message,
      requestId,
    }, { status: 502 })
  } finally {
    // Chỉ xóa promise đã hoàn tất. Request khác đang await cùng promise vẫn nhận
    // cùng kết quả trước khi microtask finally này chạy.
    inFlightLookups.delete(lookupKey)
  }
}
