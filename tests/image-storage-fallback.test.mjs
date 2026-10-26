import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const storage = await readFile(new URL('../src/lib/image-storage.ts', import.meta.url), 'utf8')
const route = await readFile(new URL('../src/app/api/upload/route.ts', import.meta.url), 'utf8')

test('storage uses only R2: the self-hosted Supabase has no Storage service', () => {
  assert.doesNotMatch(storage, /\.storage\b|createBucket|createAdminClient/)
  assert.match(storage, /throw new StorageError\(`R2: \$\{reason\}`, isNetworkStorageError\(error\)\)/)
})

test('image URLs sent to Zalo recipients do not carry the uploader id', () => {
  const keyBlock = route.slice(route.indexOf('const key = ['), route.indexOf("].join('/')"))
  assert.doesNotMatch(keyBlock, /user\.id/)
})

test('the upload route never answers 502 or 504', () => {
  assert.doesNotMatch(route, /status:\s*50[24]/)
})

test('network failures are reported per address and not blamed on the token', async () => {
  const { describeStorageError, isNetworkStorageError } = await import('../src/lib/image-storage.ts')
  const aggregate = Object.assign(new AggregateError([
    Object.assign(new Error('a'), { code: 'ETIMEDOUT', address: '172.64.66.1' }),
    Object.assign(new Error('b'), { code: 'ENETUNREACH', address: '2606:4700::1' }),
  ]), { code: 'ETIMEDOUT' })
  assert.equal(describeStorageError(aggregate), 'ETIMEDOUT: ETIMEDOUT@172.64.66.1, ENETUNREACH@2606:4700::1')
  assert.equal(isNetworkStorageError(aggregate), true)
  const denied = Object.assign(new Error('x'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } })
  assert.equal(describeStorageError(denied), 'AccessDenied, HTTP 403')
  assert.equal(isNetworkStorageError(denied), false)
})

test('the R2 client is reused with explicit connect timeouts', async () => {
  const source = await readFile(new URL('../src/lib/image-storage.ts', import.meta.url), 'utf8')
  assert.match(source, /r2Client \?\?= new S3Client/)
  assert.match(source, /connectionTimeout: 10_000/)
  assert.match(source, /autoSelectFamilyAttemptTimeout: 2_000/)
  assert.match(route, /error\.network/)
})
