import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import { authRedirectOrigin, safeInternalPath } from '../src/lib/auth-redirect.ts'

const loginPage = readFileSync(new URL('../src/app/login/page.tsx', import.meta.url), 'utf8')
const callbackRoute = readFileSync(new URL('../src/app/auth/callback/route.ts', import.meta.url), 'utf8')

test('configured public site overrides an internal container request origin', () => {
  assert.equal(
    authRedirectOrigin('https://0.0.0.0:3000/auth/callback', 'https://app.example.com'),
    'https://app.example.com',
  )
  assert.throws(() => authRedirectOrigin('https://0.0.0.0:3000/auth/callback', 'javascript:alert(1)'))
  assert.throws(() => authRedirectOrigin('https://0.0.0.0:3000/auth/callback', 'https://user:pass@example.com'))
})

test('auth redirects reject external and protocol-relative next destinations', () => {
  assert.equal(safeInternalPath('/dashboard?tab=campaigns', '/dashboard'), '/dashboard?tab=campaigns')
  assert.equal(safeInternalPath('//evil.example/steal', '/dashboard'), '/dashboard')
  assert.equal(safeInternalPath('https://evil.example/steal', '/dashboard'), '/dashboard')
})

test('Google login returns to this public site callback', () => {
  assert.match(
    loginPage,
    /provider:\s*['"]google['"][\s\S]*?redirectTo:\s*`\$\{window\.location\.origin\}\/auth\/callback`/,
  )
  assert.match(callbackRoute, /authRedirectOrigin\(request\.url, process\.env\.APP_SITE_URL\)/)
})
