import assert from 'node:assert/strict'
import test from 'node:test'

import { MAX_IMAGE_BYTES, validateImageUpload } from '../src/lib/image-upload-validation.ts'

test('accepts matching PNG metadata and magic bytes', () => {
  const result = validateImageUpload({
    name: 'ảnh.png',
    type: 'image/png',
    size: 8,
    bytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  })
  assert.deepEqual(result, { ok: true, extension: 'png' })
})

test('rejects oversized, mismatched and disguised files', () => {
  assert.equal(validateImageUpload({
    name: 'large.jpg', type: 'image/jpeg', size: MAX_IMAGE_BYTES + 1, bytes: Uint8Array.from([0xff, 0xd8, 0xff]),
  }).ok, false)
  assert.equal(validateImageUpload({
    name: 'wrong.png', type: 'image/jpeg', size: 3, bytes: Uint8Array.from([0xff, 0xd8, 0xff]),
  }).ok, false)
  assert.equal(validateImageUpload({
    name: 'script.png', type: 'image/png', size: 8, bytes: new TextEncoder().encode('<script>'),
  }).ok, false)
})
