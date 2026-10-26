import sharp from 'sharp'

export const MAX_ZALO_IMAGE_BYTES = 950 * 1024

type SupportedExtension = 'jpg' | 'png' | 'webp' | 'gif'

type OriginalImage = {
  contentType: string
  extension: SupportedExtension
}

type OptimizedImage = {
  body: Buffer
  contentType: string
  extension: SupportedExtension
  optimized: boolean
}

const attempts = [
  { quality: 82 },
  { quality: 74 },
  { quality: 66 },
  { maxDimension: 1920, quality: 78 },
  { maxDimension: 1600, quality: 78 },
  { maxDimension: 1280, quality: 74 },
  { maxDimension: 1080, quality: 68 },
]

/**
 * Reduces image weight before R2 storage. `fit: inside` never crops or
 * stretches: a 16:9 source remains 16:9 at every fallback resolution.
 */
export async function optimizeImageForZalo(
  input: Buffer,
  original: OriginalImage,
): Promise<OptimizedImage> {
  if (input.length <= MAX_ZALO_IMAGE_BYTES) {
    return {
      body: input,
      contentType: original.contentType,
      extension: original.extension,
      optimized: false,
    }
  }

  const metadata = await sharp(input, { animated: true }).metadata()
  if (metadata.format === 'gif' && (metadata.pages ?? 1) > 1) {
    throw new Error('Ảnh GIF động quá lớn để tối ưu an toàn')
  }

  for (const attempt of attempts) {
    let pipeline = sharp(input).rotate()
    if (attempt.maxDimension) {
      pipeline = pipeline.resize({
        width: attempt.maxDimension,
        height: attempt.maxDimension,
        fit: 'inside',
        withoutEnlargement: true,
      })
    }
    const candidate = await pipeline
      .flatten({ background: '#ffffff' })
      .jpeg({
        quality: attempt.quality,
        progressive: true,
        mozjpeg: true,
      })
      .toBuffer()

    if (candidate.length <= MAX_ZALO_IMAGE_BYTES) {
      return {
        body: candidate,
        contentType: 'image/jpeg',
        extension: 'jpg',
        optimized: true,
      }
    }
  }

  throw new Error('Không thể nén ảnh xuống mức dung lượng an toàn')
}
