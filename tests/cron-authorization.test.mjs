import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

import { extractBearerToken, hasValidCronSecret } from '../src/lib/cron-authorization.ts'

test('cron authorization fails closed when either secret is missing', () => {
  assert.equal(hasValidCronSecret(null, 'expected-secret'), false)
  assert.equal(hasValidCronSecret('provided-secret', undefined), false)
  assert.equal(hasValidCronSecret('', 'expected-secret'), false)
})

test('cron authorization accepts only an exact secret', () => {
  assert.equal(hasValidCronSecret('expected-secret', 'expected-secret'), true)
  assert.equal(hasValidCronSecret('expected-secret!', 'expected-secret'), false)
  assert.equal(hasValidCronSecret('expected-secret', 'expected-secret!'), false)
})

test('cron authorization requires a Bearer authorization scheme', () => {
  assert.equal(extractBearerToken('Bearer expected-secret'), 'expected-secret')
  assert.equal(extractBearerToken('bearer expected-secret'), 'expected-secret')
  assert.equal(extractBearerToken('expected-secret'), null)
  assert.equal(extractBearerToken('Basic expected-secret'), null)
  assert.equal(extractBearerToken(null), null)
})

test('the one remaining machine-to-machine entrypoint uses the fail-closed helper', async () => {
  // Việc gửi giờ chạy in-process, nên `/api/cron` là chặng duy nhất còn xác
  // thực một caller không phải người dùng.
  const source = await readFile(new URL('../src/app/api/cron/route.ts', import.meta.url), 'utf8')
  assert.match(source, /hasValidCronSecret/)
  assert.doesNotMatch(source, /=== process\.env\.CRON_SECRET/)
})

test('no route compares the cron secret with a leaky equality check', async () => {
  const routes = [
    '../src/app/api/cron/route.ts',
    '../src/app/api/cron/manual/route.ts',
    '../src/app/api/zalo/send/route.ts',
    '../src/app/api/zalo/personal-send/route.ts',
  ]

  for (const route of routes) {
    const source = await readFile(new URL(route, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /=== process\.env\.CRON_SECRET/, `${route} uses a non-constant-time compare`)
  }
})
