import { Agent } from 'node:https'
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { NodeHttpHandler } from '@smithy/node-http-handler'

/**
 * Lưu ảnh campaign lên Cloudflare R2 và trả về URL công khai để func.vn tải về.
 *
 * Supabase của production là bản tự host không có dịch vụ Storage, nên không có
 * kho dự phòng; lỗi R2 được báo rõ lý do để người có quyền Cloudflare sửa token.
 */

export class StorageError extends Error {
  network: boolean

  constructor(message: string, network: boolean) {
    super(message)
    this.name = 'StorageError'
    this.network = network
  }
}

export type StoredImage = {
  url: string
}

type ImageObject = {
  key: string
  body: Buffer
  contentType: string
  metadata: Record<string, string>
}

/**
 * Rút gọn lỗi lưu trữ thành một nhãn an toàn để hiện cho người dùng: tên biến
 * môi trường còn thiếu, mã lỗi S3 (InvalidAccessKeyId, AccessDenied...) hoặc mã
 * lỗi mạng (ENOTFOUND, ETIMEDOUT...). Không bao giờ chứa giá trị bí mật.
 */
const NETWORK_ERROR_CODES = new Set([
  'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH',
  'EAI_AGAIN', 'ENOTFOUND', 'EPIPE',
])

type NetworkishError = Error & {
  code?: string
  address?: string
  errors?: Array<{ code?: string; address?: string }>
  $metadata?: { httpStatusCode?: number }
}

/** Lỗi do mạng giữa VPS và R2, khác với lỗi cấu hình như token hay bucket. */
export function isNetworkStorageError(error: unknown): boolean {
  const e = error as NetworkishError | undefined
  if (!e) return false
  if (e.code && NETWORK_ERROR_CODES.has(e.code)) return true
  return Boolean(e.errors?.some(item => item.code && NETWORK_ERROR_CODES.has(item.code)))
}

/**
 * Rút gọn lỗi lưu trữ thành một nhãn an toàn để hiện cho người dùng: tên biến
 * môi trường còn thiếu, mã lỗi S3 (InvalidAccessKeyId, AccessDenied...) hoặc mã
 * lỗi mạng kèm từng địa chỉ IP đã thử (là IP công khai của Cloudflare). Không
 * bao giờ chứa giá trị bí mật.
 */
export function describeStorageError(error: unknown): string {
  if (!(error instanceof Error)) return 'lỗi không xác định'
  const e = error as NetworkishError
  const missing = e.message.match(/^Missing ([A-Z0-9_]+)$/)
  if (missing) return `thiếu biến ${missing[1]}`
  if (e.$metadata?.httpStatusCode) return `${e.name}, HTTP ${e.$metadata.httpStatusCode}`
  // Node gộp lỗi của từng địa chỉ IP khi thử kết nối lần lượt (happy eyeballs).
  if (e.errors?.length) {
    const attempts = [...new Set(e.errors.map(item => `${item.code ?? '?'}@${item.address ?? '?'}`))]
    return `${e.code ?? e.name}: ${attempts.join(', ')}`.slice(0, 240)
  }
  if (e.code) return e.address ? `${e.code}@${e.address}` : e.code
  return e.name || 'lỗi không xác định'
}

const requiredEnv = (name: string) => {
  const value = process.env[name]
  if (!value) throw new Error(`Missing ${name}`)
  return value
}

const encodeKey = (key: string) => key.split('/').map(encodeURIComponent).join('/')

// Dùng chung một client và giữ kết nối sống: mỗi lần upload không phải bắt tay
// TCP/TLS lại từ đầu tới R2, vốn là đoạn dễ hỏng nhất trên đường truyền quốc tế.
let r2Client: S3Client | null = null

function getR2Client(): S3Client {
  r2Client ??= new S3Client({
    region: 'auto',
    endpoint: requiredEnv('R2_ENDPOINT'),
    requestChecksumCalculation: 'WHEN_REQUIRED',
    maxAttempts: 3,
    credentials: {
      accessKeyId: requiredEnv('R2_ACCESS_KEY_ID'),
      secretAccessKey: requiredEnv('R2_SECRET_ACCESS_KEY'),
    },
    requestHandler: new NodeHttpHandler({
      connectionTimeout: 10_000,
      requestTimeout: 30_000,
      throwOnRequestTimeout: true,
      httpsAgent: new Agent({
        keepAlive: true,
        maxSockets: 16,
        // Mặc định Node chỉ chờ 250ms cho mỗi địa chỉ trước khi thử địa chỉ kế;
        // quá ngắn khi đường từ VPS ra Cloudflare bị chậm.
        autoSelectFamily: true,
        autoSelectFamilyAttemptTimeout: 2_000,
      }),
    }),
  })
  return r2Client
}

async function storeInR2(object: ImageObject): Promise<string> {
  const publicUrl = requiredEnv('R2_PUBLIC_URL')
  const client = getR2Client()

  await client.send(new PutObjectCommand({
    Bucket: requiredEnv('R2_BUCKET_NAME'),
    Key: object.key,
    Body: object.body,
    ContentType: object.contentType,
    CacheControl: 'public, max-age=31536000, immutable',
    Metadata: object.metadata,
  }))

  return `${publicUrl.replace(/\/$/, '')}/${encodeKey(object.key)}`
}

export async function storeCampaignImage(object: ImageObject): Promise<StoredImage> {
  try {
    return { url: await storeInR2(object) }
  } catch (error) {
    const reason = describeStorageError(error)
    console.error('R2 upload failed:', reason, error instanceof Error ? error.message : error)
    throw new StorageError(`R2: ${reason}`, isNetworkStorageError(error))
  }
}
