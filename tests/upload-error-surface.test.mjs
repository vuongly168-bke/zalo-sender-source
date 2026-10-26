import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const route = await readFile(new URL('../src/app/api/upload/route.ts', import.meta.url), 'utf8')
  + await readFile(new URL('../src/lib/image-storage.ts', import.meta.url), 'utf8')
const client = await readFile(new URL('../src/lib/upload-image.ts', import.meta.url), 'utf8')

test('the upload route never answers 502 or 504, which Cloudflare replaces with HTML', () => {
  assert.doesNotMatch(route, /status:\s*50[24]/)
})

test('a storage failure tells the user why, without exposing secret values', () => {
  assert.match(route, /describeStorageError/)
  assert.match(route, /thiếu biến \$\{missing\[1\]\}/)
  assert.doesNotMatch(route, /error: .*secretAccessKey/)
})

test('the browser survives a non-JSON error page from the proxy', () => {
  assert.match(client, /await response\.text\(\)/)
  assert.doesNotMatch(client, /await response\.json\(\)/)
  assert.match(client, /không phải JSON/)
})
