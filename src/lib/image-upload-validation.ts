export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

type UploadCandidate = {
  name: string
  type: string
  size: number
  bytes: Uint8Array
}

type ValidationResult =
  | { ok: true; extension: 'jpg' | 'png' | 'webp' | 'gif' }
  | { ok: false; error: string }

const startsWith = (bytes: Uint8Array, signature: number[]) =>
  signature.every((value, index) => bytes[index] === value)

const hasValidMagicBytes = (type: string, bytes: Uint8Array) => {
  if (type === 'image/jpeg') return startsWith(bytes, [0xff, 0xd8, 0xff])
  if (type === 'image/png') return startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  if (type === 'image/webp') {
    return startsWith(bytes, [0x52, 0x49, 0x46, 0x46])
      && startsWith(bytes.slice(8), [0x57, 0x45, 0x42, 0x50])
  }
  if (type === 'image/gif') {
    const header = new TextDecoder().decode(bytes.slice(0, 6))
    return header === 'GIF87a' || header === 'GIF89a'
  }
  return false
}

export function validateImageUpload(candidate: UploadCandidate): ValidationResult {
  if (!Number.isFinite(candidate.size) || candidate.size <= 0) {
    return { ok: false, error: 'Ảnh rỗng hoặc kích thước không hợp lệ' }
  }
  if (candidate.size > MAX_IMAGE_BYTES) {
    return { ok: false, error: 'Ảnh vượt quá giới hạn 10MB' }
  }

  const extension = candidate.name.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1]
  const allowedExtensions: Record<string, string[]> = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'image/gif': ['gif'],
  }
  if (!extension || !allowedExtensions[candidate.type]?.includes(extension)) {
    return { ok: false, error: 'Chỉ chấp nhận ảnh JPG, PNG, WEBP hoặc GIF đúng định dạng' }
  }
  if (!hasValidMagicBytes(candidate.type, candidate.bytes)) {
    return { ok: false, error: 'Nội dung tệp không khớp định dạng ảnh' }
  }

  return {
    ok: true,
    extension: candidate.type === 'image/jpeg' ? 'jpg' : extension as 'png' | 'webp' | 'gif',
  }
}
