import assert from 'node:assert/strict'
import test from 'node:test'

import { canManuallyRunCron } from '../src/lib/manual-cron-authorization.ts'

test('manual cron rejects members and users without an active workspace role', () => {
  assert.equal(canManuallyRunCron('member', false), false)
  assert.equal(canManuallyRunCron(null, false), false)
  assert.equal(canManuallyRunCron(undefined, false), false)
})

test('manual cron permits only workspace admins, owners, or super admins', () => {
  assert.equal(canManuallyRunCron('admin', false), true)
  assert.equal(canManuallyRunCron('owner', false), true)
  assert.equal(canManuallyRunCron('member', true), true)
})
