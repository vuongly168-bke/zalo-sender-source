import { timingSafeEqual } from 'node:crypto'

export function extractBearerToken(value: string | null): string | null {
  const match = value?.match(/^Bearer\s+(.+)$/i)
  return match?.[1] ?? null
}

export function hasValidCronSecret(
  providedSecret: string | null,
  expectedSecret: string | undefined = process.env.CRON_SECRET,
): boolean {
  if (!providedSecret || !expectedSecret) return false

  const provided = Buffer.from(providedSecret)
  const expected = Buffer.from(expectedSecret)
  return provided.length === expected.length && timingSafeEqual(provided, expected)
}

const LOOPBACK_ADDRESSES = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1'])

/**
 * Lớp phòng thủ thứ hai cho `/api/cron`, bổ sung cho việc chặn ở reverse proxy.
 *
 * Runner trên VPS gọi `http://127.0.0.1:3000/api/cron` từ *bên trong* container,
 * nên chặng đầu của `x-forwarded-for` là loopback. Request đi từ Internet qua
 * nginx/Cloudflare sẽ mang IP thật của client ở chặng đầu.
 *
 * Mặc định TẮT vì kết quả phụ thuộc vào topology reverse proxy của từng máy:
 * bật nhầm sẽ làm cron chết im lặng. Chỉ đặt `CRON_REQUIRE_LOOPBACK=1` sau khi
 * đã xác nhận `journalctl -u zalo-autosend.service` vẫn chạy bình thường.
 */
export function isTrustedCronCaller(
  forwardedFor: string | null,
  requireLoopback: string | undefined = process.env.CRON_REQUIRE_LOOPBACK,
): boolean {
  if (requireLoopback !== '1') return true

  const firstHop = forwardedFor?.split(',')[0]?.trim()
  if (!firstHop) return false
  return LOOPBACK_ADDRESSES.has(firstHop.toLowerCase())
}
