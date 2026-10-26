import type { SupabaseClient } from '@supabase/supabase-js'

const DEFAULT_INTERVAL_MS = 1_250
const DEFAULT_MAX_QUEUE_WAIT_MS = 25_000
const DEFAULT_TIMEOUT_MS = 15_000
const RETRYABLE_STATUS_CODES = new Set([403, 404, 408, 425, 429, 500, 502, 503, 504])

const localNextSlot = new Map<string, number>()

export function assertAllowedZaloApiUrl(rawUrl: string): string {
  let url: URL
  try {
    url = new URL(rawUrl)
  } catch {
    throw new Error('URL API không hợp lệ')
  }

  if (
    url.protocol !== 'https:' ||
    url.hostname.toLowerCase() !== 'public-api.func.vn' ||
    (url.port && url.port !== '443') ||
    url.username ||
    url.password
  ) {
    throw new Error('URL API phải dùng HTTPS và đúng máy chủ public-api.func.vn')
  }
  return url.toString()
}

export class ZaloQueueBusyError extends Error {
  retryAfterMs: number

  constructor(retryAfterMs: number) {
    super('Zalo API queue is full')
    this.name = 'ZaloQueueBusyError'
    this.retryAfterMs = retryAfterMs
  }
}

export type ZaloApiResult = {
  status: number
  text: string
  data: Record<string, unknown> | null
  attempts: number
}

type CallZaloApiOptions = {
  supabase: SupabaseClient
  zaloAccountId: string
  apiUrl: string
  bearerToken: string
  body: Record<string, unknown>
  accountToken?: string | null
  maxAttempts?: number
  intervalMs?: number
  maxQueueWaitMs?: number
  timeoutMs?: number
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function safeString(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value.trim()
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  if (!text.trim()) return null
  try {
    return asRecord(JSON.parse(text))
  } catch {
    return null
  }
}

export function extractZaloError(data: Record<string, unknown> | null): string {
  if (!data) return ''

  const records = [data, asRecord(data.data), asRecord(asRecord(data.data)?.data)].filter(Boolean) as Record<string, unknown>[]
  const fields = ['error_message', 'errorMessage', 'message', 'msg', 'detail', 'description', 'error']

  for (const record of records) {
    for (const field of fields) {
      const message = safeString(record[field])
      if (message && message !== '{}' && message !== '[]') return message
    }
  }

  return ''
}

export function extractZaloErrorCode(data: Record<string, unknown> | null): number | null {
  if (!data) return null

  const records = [asRecord(data.data)?.data, asRecord(data.data), data]
  const fields = ['error_code', 'errorCode', 'code', 'status']

  for (const value of records) {
    const record = asRecord(value)
    if (!record) continue
    for (const field of fields) {
      const raw = record[field]
      const code = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : NaN
      if (Number.isFinite(code) && code !== 0 && code !== 200) return code
    }
  }

  return null
}

export function normalizeZaloGroupLink(value: unknown): string | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw.replace(/^\/+/, '')}`

  try {
    const url = new URL(withProtocol)
    const host = url.hostname.toLowerCase()
    const match = url.pathname.match(/^\/g\/([^/]+)\/?$/i)
    if ((host !== 'zalo.me' && host !== 'www.zalo.me') || !match) return null
    if (!/^[a-z0-9_-]+$/i.test(match[1])) return null
    return `https://zalo.me/g/${match[1]}`
  } catch {
    return null
  }
}

function shouldRetry(status: number, data: Record<string, unknown> | null): boolean {
  const apiCode = extractZaloErrorCode(data)
  const effectiveStatus = apiCode && RETRYABLE_STATUS_CODES.has(apiCode) ? apiCode : status
  if (!RETRYABLE_STATUS_CODES.has(effectiveStatus)) return false

  const message = extractZaloError(data).toLowerCase()
  if (message.includes('token') || message.includes('unauthorized') || message.includes('forbidden')) return false
  if (message.includes('not found') && !message.includes('rate')) return false
  return true
}

function reserveLocalSlot(zaloAccountId: string, intervalMs: number, maxQueueWaitMs: number): number {
  const now = Date.now()
  const scheduledAt = Math.max(localNextSlot.get(zaloAccountId) || now, now)
  const waitMs = scheduledAt - now
  if (waitMs > maxQueueWaitMs) throw new ZaloQueueBusyError(waitMs)
  localNextSlot.set(zaloAccountId, scheduledAt + intervalMs)
  return waitMs
}

async function reserveZaloApiSlot(
  supabase: SupabaseClient,
  zaloAccountId: string,
  intervalMs: number,
  maxQueueWaitMs: number,
) {
  const { data, error } = await supabase.rpc('reserve_zalo_api_slot', {
    p_zalo_account_id: zaloAccountId,
    p_interval_ms: intervalMs,
    p_max_wait_ms: maxQueueWaitMs,
  })

  if (error) {
    if (error.message.includes('ZALO_QUEUE_FULL')) {
      throw new ZaloQueueBusyError(maxQueueWaitMs)
    }

    // Cho phép code mới chạy trước migration. Đây chỉ là fallback theo từng
    // Vercel instance; migration vẫn cần được áp dụng để điều phối toàn hệ thống.
    console.warn('[zalo-api] Distributed limiter unavailable; using local fallback:', error.code || error.message)
    const localWaitMs = reserveLocalSlot(zaloAccountId, intervalMs, maxQueueWaitMs)
    if (localWaitMs > 0) await sleep(localWaitMs)
    return
  }

  const rawScheduledAt = Array.isArray(data) ? data[0] : data
  const scheduledAt = new Date(String(rawScheduledAt)).getTime()
  const waitMs = Number.isFinite(scheduledAt) ? Math.max(0, scheduledAt - Date.now()) : 0
  if (waitMs > 0) await sleep(waitMs)
}

export async function callZaloApi(options: CallZaloApiOptions): Promise<ZaloApiResult> {
  const {
    supabase,
    zaloAccountId,
    apiUrl,
    bearerToken,
    body,
    accountToken,
    maxAttempts = 3,
    intervalMs = DEFAULT_INTERVAL_MS,
    maxQueueWaitMs = DEFAULT_MAX_QUEUE_WAIT_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
  } = options
  const safeApiUrl = assertAllowedZaloApiUrl(apiUrl)

  let lastResult: ZaloApiResult | null = null
  let lastError: unknown = null

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await reserveZaloApiSlot(supabase, zaloAccountId, intervalMs, maxQueueWaitMs)

    try {
      const response = await fetch(safeApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bearerToken}`,
          ...(accountToken ? { 'Account-Token': accountToken } : {}),
        },
        body: JSON.stringify(body),
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
      })
      const text = await response.text()
      const data = parseJsonObject(text)
      lastResult = { status: response.status, text, data, attempts: attempt }

      const apiCode = extractZaloErrorCode(data)
      const hasError = !response.ok || apiCode !== null
      if (!hasError || !shouldRetry(response.status, data) || attempt === maxAttempts) {
        return lastResult
      }
    } catch (error) {
      lastError = error
      if (attempt === maxAttempts) throw error
    }

    // Jitter nhỏ để nhiều request không cùng thức dậy đúng một thời điểm;
    // slot phân tán ở vòng kế tiếp vẫn là lớp bảo vệ chính.
    await sleep(150 + Math.floor(Math.random() * 200))
  }

  if (lastResult) return lastResult
  throw lastError instanceof Error ? lastError : new Error('Không thể gọi Zalo API')
}
