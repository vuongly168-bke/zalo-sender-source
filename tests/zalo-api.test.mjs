import assert from 'node:assert/strict'
import test from 'node:test'
import {
  callZaloApi,
  assertAllowedZaloApiUrl,
  extractZaloError,
  extractZaloErrorCode,
  normalizeZaloGroupLink,
  parseJsonObject,
} from '../src/lib/zalo-api.ts'

test('normalizes supported Zalo group links', () => {
  assert.equal(normalizeZaloGroupLink(' zalo.me/g/Abc_123?utm_source=test '), 'https://zalo.me/g/Abc_123')
  assert.equal(normalizeZaloGroupLink('https://www.zalo.me/g/xyz-789/'), 'https://zalo.me/g/xyz-789')
})

test('rejects non-Zalo and malformed group links', () => {
  assert.equal(normalizeZaloGroupLink('https://example.com/g/abc'), null)
  assert.equal(normalizeZaloGroupLink('https://zalo.me/abc'), null)
  assert.equal(normalizeZaloGroupLink('https://zalo.me/g/a/b'), null)
})

test('only sends func.vn credentials to the approved HTTPS host', () => {
  assert.equal(
    assertAllowedZaloApiUrl('https://public-api.func.vn/functions/v1/send'),
    'https://public-api.func.vn/functions/v1/send',
  )
  assert.throws(() => assertAllowedZaloApiUrl('http://public-api.func.vn/functions/v1/send'))
  assert.throws(() => assertAllowedZaloApiUrl('https://public-api.func.vn.evil.example/steal'))
  assert.throws(() => assertAllowedZaloApiUrl('https://127.0.0.1/steal'))
})

test('extracts nested upstream error details', () => {
  const data = {
    status: 403,
    data: { error_code: 403, error_message: 'Rate limit exceeded' },
  }
  assert.equal(extractZaloError(data), 'Rate limit exceeded')
  assert.equal(extractZaloErrorCode(data), 403)
})

test('parses JSON objects without accepting invalid or array responses', () => {
  assert.deepEqual(parseJsonObject('{"ok":true}'), { ok: true })
  assert.equal(parseJsonObject('<html>error</html>'), null)
  assert.equal(parseJsonObject('[1,2,3]'), null)
})

test('queues 12 simultaneous calls instead of bursting upstream', async () => {
  const originalFetch = globalThis.fetch
  const callTimes = []
  let nextSlot = Date.now()
  const intervalMs = 20

  const supabase = {
    rpc: async () => {
      const now = Date.now()
      const scheduledAt = Math.max(now, nextSlot)
      nextSlot = scheduledAt + intervalMs
      return { data: new Date(scheduledAt).toISOString(), error: null }
    },
  }

  globalThis.fetch = async () => {
    callTimes.push(performance.now())
    return new Response('{"data":{"groupId":"123","name":"Test"}}', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  try {
    await Promise.all(Array.from({ length: 12 }, () => callZaloApi({
      supabase,
      zaloAccountId: 'concurrency-test-account',
      apiUrl: 'https://public-api.func.vn/functions/v1/group-info',
      bearerToken: 'test-token',
      body: { group_link: 'https://zalo.me/g/test' },
      maxAttempts: 1,
      intervalMs,
      maxQueueWaitMs: 1_000,
    })))
  } finally {
    globalThis.fetch = originalFetch
  }

  assert.equal(callTimes.length, 12)
  assert.ok(callTimes.at(-1) - callTimes[0] >= 180, `calls spanned only ${callTimes.at(-1) - callTimes[0]}ms`)
})
