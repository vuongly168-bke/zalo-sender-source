import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import test from 'node:test'
import sharp from 'sharp'

import {
  MAX_ZALO_IMAGE_BYTES,
  optimizeImageForZalo,
} from '../src/lib/image-optimization.ts'

test('keeps an already-small image byte-for-byte unchanged', async () => {
  const small = await sharp({
    create: {
      width: 320,
      height: 180,
      channels: 3,
      background: '#2563eb',
    },
  }).jpeg({ quality: 82 }).toBuffer()

  const result = await optimizeImageForZalo(small, {
    contentType: 'image/jpeg',
    extension: 'jpg',
  })

  assert.equal(result.optimized, false)
  assert.strictEqual(result.body, small)
  assert.equal(result.contentType, 'image/jpeg')
  assert.equal(result.extension, 'jpg')
})

test('reduces a large 16:9 image without cropping or stretching it', async () => {
  const width = 2400
  const height = 1350
  const source = await sharp(randomBytes(width * height * 3), {
    raw: { width, height, channels: 3 },
  }).jpeg({ quality: 100 }).toBuffer()

  assert.ok(source.length > MAX_ZALO_IMAGE_BYTES)

  const result = await optimizeImageForZalo(source, {
    contentType: 'image/jpeg',
    extension: 'jpg',
  })
  const metadata = await sharp(result.body).metadata()

  assert.equal(result.optimized, true)
  assert.equal(result.contentType, 'image/jpeg')
  assert.equal(result.extension, 'jpg')
  assert.ok(result.body.length < source.length)
  assert.ok(result.body.length <= MAX_ZALO_IMAGE_BYTES)
  assert.ok(metadata.width && metadata.height)
  assert.ok(Math.abs(metadata.width / metadata.height - 16 / 9) < 0.002)
})
