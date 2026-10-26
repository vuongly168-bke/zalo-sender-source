import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { compactAuthReason, explainAuthFailure } from '../src/lib/auth-error.ts'

test('the callback forwards the real failure reason instead of discarding it', async () => {
  const source = await readFile(new URL('../src/app/auth/callback/route.ts', import.meta.url), 'utf8')
  assert.match(source, /searchParams\.get\('error_description'\)/)
  assert.match(source, /reason = compactAuthReason\(error\.message\)/)
  assert.match(source, /target\.searchParams\.set\('reason', reason\)/)
})

test('reasons are trimmed to a bounded single line', () => {
  assert.equal(compactAuthReason('  a\n  b  '), 'a b')
  assert.equal(compactAuthReason(''), null)
  assert.equal(compactAuthReason('x'.repeat(500)).length, 200)
})

test('common failures map to actionable Vietnamese guidance', () => {
  assert.match(explainAuthFailure('invalid flow state, no valid flow state found'), /cùng một tab/)
  assert.match(explainAuthFailure('access_denied'), /Cho phép/)
  assert.match(explainAuthFailure('Signups not allowed for this instance'), /chưa được cấp quyền/)
  assert.match(explainAuthFailure('Unable to exchange external code: abc'), /Google OAuth/)
  assert.equal(explainAuthFailure(null), 'Đăng nhập thất bại. Vui lòng thử lại.')
})
