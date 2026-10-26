import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const read = (relativePath) => readFile(new URL(relativePath, import.meta.url), 'utf8')

const SEND_ROUTES = [
  '../src/app/api/zalo/send/route.ts',
  '../src/app/api/zalo/personal-send/route.ts',
]

test('no send route accepts a header that swaps in the service-role client', async () => {
  for (const relativePath of SEND_ROUTES) {
    const source = await read(relativePath)
    assert.doesNotMatch(source, /x-cron-secret/i, `${relativePath} still reads the cron header`)
    assert.doesNotMatch(source, /createAdminClient/, `${relativePath} still builds a service-role client`)
    assert.match(source, /auth\.getUser\(\)/, `${relativePath} must require a real session`)
  }
})

test('cron never calls itself back over HTTP to reach the send logic', async () => {
  for (const relativePath of ['../src/app/api/cron/route.ts', '../src/app/api/cron/manual/route.ts']) {
    const source = await read(relativePath)
    assert.doesNotMatch(source, /nextUrl\.origin/, `${relativePath} still self-fetches`)
    assert.doesNotMatch(source, /fetch\(`\$\{/, `${relativePath} still builds a self URL`)
    assert.match(source, /processGroupCampaign/, `${relativePath} must call the sender directly`)
  }
})

test('the shared group sender still binds the Zalo account to the project workspace', async () => {
  const source = await read('../src/lib/group-campaign-sender.ts')
  assert.match(source, /\.from\('zalo_accounts'\)/)
  assert.match(source, /\.eq\('workspace_id', project\.workspace_id\)/)
  // Việc claim vẫn phải nguyên tử, nếu không hai tiến trình sẽ gửi trùng.
  assert.match(source, /\.in\('status', \['draft', 'scheduled', 'failed', 'partial'\]\)/)
})

test('CRON_SECRET is the only credential the cron entrypoint checks', async () => {
  const source = await read('../src/app/api/cron/route.ts')
  assert.match(source, /hasValidCronSecret/)
  assert.match(source, /isTrustedCronCaller/)
})

test('the loopback guard stays off unless explicitly enabled', async () => {
  const { isTrustedCronCaller } = await import('../src/lib/cron-authorization.ts')

  // Mặc định tắt: không được làm chết cron của máy chưa cấu hình.
  assert.equal(isTrustedCronCaller('203.0.113.9', undefined), true)
  assert.equal(isTrustedCronCaller(null, undefined), true)

  // Khi bật thì chỉ chấp nhận chặng đầu là loopback.
  assert.equal(isTrustedCronCaller('127.0.0.1', '1'), true)
  assert.equal(isTrustedCronCaller('::1', '1'), true)
  assert.equal(isTrustedCronCaller('::ffff:127.0.0.1', '1'), true)
  assert.equal(isTrustedCronCaller('203.0.113.9', '1'), false)
  assert.equal(isTrustedCronCaller('203.0.113.9, 127.0.0.1', '1'), false)
  assert.equal(isTrustedCronCaller(null, '1'), false)
})

test('the application sends its own security headers now that Vercel does not', async () => {
  const source = await read('../next.config.ts')
  for (const header of [
    'X-Frame-Options',
    'X-Content-Type-Options',
    'Referrer-Policy',
    'Strict-Transport-Security',
    'Content-Security-Policy',
  ]) {
    assert.match(source, new RegExp(header), `missing ${header}`)
  }
  assert.match(source, /frame-ancestors 'none'/)
  assert.match(source, /poweredByHeader: false/)
})


test('CSP lets the browser reach the configured Supabase origin, not only *.supabase.co', async () => {
  const source = await read('../next.config.ts')
  assert.match(source, /process\.env\.NEXT_PUBLIC_SUPABASE_URL/)
  assert.match(source, /`connect-src \$\{connectSources\}`/)
})
