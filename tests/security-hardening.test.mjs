import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const migrationUrl = new URL('../supabase/v2-security-hardening.sql', import.meta.url)
const settingsRouteUrl = new URL('../src/app/api/settings/api-keys/route.ts', import.meta.url)

test('security migration removes direct membership insertion and browser access to API tokens', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /revoke insert on table public\.workspace_members from authenticated, anon/i)
  assert.match(sql, /revoke all on table public\.api_keys from authenticated, anon/i)
  assert.doesNotMatch(sql, /with check\s*\(true\)/i)
})

test('settings API never selects or returns raw token columns on GET', async () => {
  const source = await readFile(settingsRouteUrl, 'utf8')
  const getHandler = source.slice(source.indexOf('export async function GET'), source.indexOf('export async function POST'))
  assert.doesNotMatch(getHandler, /select\(['"`][^'"`]*(bearer_token|account_token)/)
  assert.doesNotMatch(getHandler, /bearerToken\s*:/)
  assert.doesNotMatch(getHandler, /accountToken\s*:/)
  assert.match(getHandler, /hasBearerToken/)
  assert.match(getHandler, /hasAccountToken/)
})

test('security migration rejects cross-workspace Zalo account references', async () => {
  const sql = await readFile(migrationUrl, 'utf8')
  assert.match(sql, /create or replace function public\.enforce_zalo_account_workspace\(\)/i)
  assert.match(sql, /where id = new\.zalo_account_id and workspace_id = new\.workspace_id/i)
  assert.match(sql, /trg_projects_zalo_account_workspace/i)
  assert.match(sql, /trg_personal_campaigns_zalo_account_workspace/i)
  assert.match(sql, /trg_prevent_zalo_account_workspace_move/i)
})

test('settings API preserves an existing bearer token when only the URL changes', async () => {
  const source = await readFile(settingsRouteUrl, 'utf8')
  const postHandler = source.slice(source.indexOf('export async function POST'))
  assert.match(postHandler, /key\.bearerToken\?\.trim\(\) \|\| existing\?\.bearer_token/)
  assert.match(postHandler, /key\.apiUrl \?\? existing\?\.api_url/)
})

test('send paths bind Zalo accounts to the campaign or project workspace', async () => {
  const urls = [
    // Việc gửi nhóm đã chuyển vào lib dùng chung để cron không cần một secret
    // bypass RLS; ràng buộc workspace theo đó cũng chuyển sang cùng file.
    new URL('../src/lib/group-campaign-sender.ts', import.meta.url),
    new URL('../src/app/api/zalo/group-info/route.ts', import.meta.url),
    new URL('../src/lib/personal-campaign-sender.ts', import.meta.url),
  ]
  for (const url of urls) {
    const source = await readFile(url, 'utf8')
    assert.match(source, /\.from\('zalo_accounts'\)/)
    assert.match(source, /\.eq\('workspace_id', (project|campaign)\.workspace_id\)/)
  }
})
