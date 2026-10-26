# TỔNG KẾT DỰ ÁN — ZALO SENDER SaaS

> Tài liệu tổng hợp toàn bộ dự án để bàn giao / tiếp tục phát triển.
> Cập nhật: 2026-08-05 · Production: **https://<your-domain>**

---

## 1. MỤC TIÊU DỰ ÁN

### Tên
**Zalo Sender** — nền tảng web SaaS gửi tin nhắn Zalo tự động (cho team BKE — công ty đào tạo tâm thức của thầy Trần Việt Quân, và mở rộng cho khách SaaS).

### Mục đích chính
Thay thế hệ thống Google Apps Script (GAS) cũ bằng một web app đa người dùng, cho phép:
- Nhiều team (workspace) tự quản lý, mỗi team có nhiều tài khoản Zalo riêng (Chăm sóc / Chốt đơn / Nội bộ...).
- **Gửi tin tới NHÓM Zalo**: paste link nhóm → tự lấy group_id + tên → tạo "đợt gửi" (campaign) với nội dung + ảnh + lịch hẹn giờ → cron tự gửi.
- **Gửi tin CÁ NHÂN hàng loạt theo SĐT**: import khách hàng (Excel/paste), auto-lookup tên Zalo, gửi theo batch (chống spam) với placeholder cá nhân hóa `{ten}`, `{sdt}`.
- **Lặp lại định kỳ** (recurring): họp hàng tuần, nhắc báo cáo...
- Phân quyền: Super Admin → Owner → Admin → Member.
- Tự cấu hình API func.vn cho từng Zalo account.

### Hạ tầng
- **func.vn**: proxy API Zalo (GET_GROUP_INFO_BY_LINK, GROUP_SEND_MESSAGE/IMAGES, GET_USER_INFO, USER_SEND_MESSAGE/IMAGES).
- **Cloudinary**: lưu ảnh (folder `ZALO_AUTO_SEND`, free 25GB).
- **cron-job.org**: ping `/api/cron` mỗi phút (vì Vercel Hobby chỉ chạy cron 1 lần/ngày).

---

## 2. TIẾN ĐỘ ĐÃ HOÀN THÀNH

Dự án đã hoàn thành **100% theo roadmap 5 buổi + nhiều bổ sung**. Tất cả đã deploy production và đang chạy thật.

| Giai đoạn | Tính năng | Trạng thái |
|-----------|-----------|------------|
| Buổi 1 | Google OAuth + Schema v2 + Workspace | ✅ |
| Buổi 1.5 | Invite-only + Super Admin | ✅ |
| Buổi 1.6 | Member management + UX | ✅ |
| Buổi 2 | Multi Zalo Accounts + 6 API keys + Account Token | ✅ |
| Buổi 3 | Contacts + Excel import + Bulk lookup tên | ✅ |
| Bonus | Import group links hàng loạt | ✅ |
| Buổi 4 | Personal Campaigns (batch + delay + placeholder) | ✅ |
| Buổi 4b | Edit campaign + Global Help URL | ✅ |
| Buổi 5 | Dashboard nâng cấp + Audit Log + Super Admin overview | ✅ |
| Sau buổi 5 | Recurring campaigns (lặp lại) | ✅ |
| Sau buổi 5 | Multi-image (5 ảnh/đợt) + paste clipboard | ✅ |
| Sau buổi 5 | Rate-limit config (chống spam Zalo) | ✅ |
| Tối ưu | Fix N+1 queries + Direct Cloudinary upload | ✅ |
| Tối ưu | Mobile responsive (Safari + Chrome iOS) | ✅ |
| Vận hành | Điều phối API Zalo khi nhiều người dùng đồng thời | ✅ |
| Vận hành | Super Admin: audit đầy đủ, đa workspace, theo dõi workspace không hoạt động | ✅ |

### Stack & dependencies (`package.json`)
```
Next.js 16.2.6 (App Router, Turbopack)
React 19.2.4
@supabase/ssr ^0.10.3  +  @supabase/supabase-js ^2.105.3
lucide-react ^1.14.0   (icons)
date-fns ^4.1.0
xlsx ^0.18.5           (Excel import/export)
Tailwind CSS v4
TypeScript 5
```

### Cấu trúc thư mục (toàn bộ file `.ts`/`.tsx`)
```
src/
├── proxy.ts                         # Next.js 16 proxy (thay middleware) - auth guard
├── app/
│   ├── layout.tsx, page.tsx         # Root layout + redirect /→/login
│   ├── login/page.tsx               # Đăng nhập Google OAuth (chỉ Google)
│   ├── register/page.tsx            # Redirect → /login (không dùng nữa)
│   ├── setup-workspace/page.tsx     # Super admin tạo workspace / user thường thấy "chờ duyệt"
│   ├── auth/callback/route.ts       # OAuth callback (exchangeCodeForSession)
│   ├── api/
│   │   ├── upload/route.ts          # GET → trả Cloudinary signature (client upload trực tiếp)
│   │   ├── cron/route.ts            # GET → cron chính (recurring gen + group send + personal batch)
│   │   ├── cron/manual/route.ts     # POST → nút "chạy cron thủ công"
│   │   ├── workspace/select/route.ts # POST → chọn workspace đang thao tác (đã kiểm tra membership)
│   │   └── zalo/
│   │       ├── group-info/route.ts  # POST → lookup group từ link (func.vn)
│   │       ├── user-info/route.ts   # POST → lookup user từ SĐT (func.vn + Account-Token)
│   │       ├── send/route.ts        # POST → gửi 1 campaign nhóm
│   │       └── personal-send/route.ts # POST → gửi 1 batch personal campaign
│   └── dashboard/
│       ├── layout.tsx               # Layout + sidebar + fetch workspace/profile/projects/globalHelpUrl
│       ├── page.tsx                 # Tổng quan: stats cards + 2 panel gửi nhóm/cá nhân + upcoming
│       ├── projects/page.tsx        # List dự án + tạo mới (chọn Zalo Account)
│       ├── projects/[id]/page.tsx   # Chi tiết dự án: nhóm Zalo + đợt gửi + import + edit/xóa
│       ├── projects/[id]/campaigns/new/page.tsx        # → CampaignForm mode=create
│       ├── projects/[id]/campaigns/[campaignId]/page.tsx       # Chi tiết đợt gửi nhóm
│       ├── projects/[id]/campaigns/[campaignId]/edit/page.tsx  # → CampaignForm mode=edit
│       ├── contacts/page.tsx        # Khách hàng: CRUD + import + bulk lookup tên
│       ├── personal-campaigns/page.tsx              # List đợt gửi cá nhân
│       ├── personal-campaigns/new/page.tsx          # → PersonalCampaignForm create (+copy)
│       ├── personal-campaigns/[id]/page.tsx         # Chi tiết: progress + recipients + pause/export
│       ├── personal-campaigns/[id]/edit/page.tsx    # → PersonalCampaignForm edit
│       ├── settings/page.tsx        # Cài đặt API: CRUD Zalo Accounts + 6 API keys/account
│       ├── members/page.tsx         # Quản lý thành viên workspace (đổi role, kick)
│       ├── audit-log/page.tsx       # Lịch sử hoạt động
│       ├── admin/page.tsx           # Super Admin: overview/users/workspaces/cleanup/create/settings
│       └── admin/workspaces/[id]/page.tsx  # Super admin xem/sửa/xóa 1 workspace
├── components/
│   ├── sidebar.tsx                  # Sidebar responsive + chọn workspace (hamburger mobile, logout)
│   ├── campaign-form.tsx            # Form tạo/sửa/copy đợt gửi NHÓM (+ recurring + multi-image)
│   ├── personal-campaign-form.tsx   # Form tạo/sửa/copy đợt gửi CÁ NHÂN (+ batch + multi-image)
│   ├── run-cron-button.tsx          # Nút chạy cron thủ công
│   ├── image-gallery.tsx            # (component hiển thị ảnh)
│   ├── contacts/add-contact-modal.tsx     # Modal thêm/sửa khách + auto lookup tên
│   ├── contacts/import-contacts-modal.tsx # Import Excel/CSV/paste khách hàng
│   └── groups/import-groups-modal.tsx     # Import link nhóm Zalo hàng loạt
└── lib/
    ├── types.ts                     # TypeScript types + labels + helpers (describeRecurrence)
    ├── upload-image.ts              # Helper upload trực tiếp client→Cloudinary
    ├── audit-log.ts                 # Helper logAction()
    ├── zalo-api.ts                  # Hàng đợi/rate limit/retry phân tán theo Zalo account
    ├── workspace-context-client.ts  # Lấy workspace đang chọn ở client
    ├── workspace-context-server.ts  # Lấy workspace đang chọn ở server/layout
    ├── hooks/use-user-role.ts       # Hook lấy role + quyền của user
    └── supabase/{client,server,admin,middleware}.ts  # Supabase clients
```

### SQL migrations (chạy theo thứ tự — `supabase/`)
1. `schema-v2.sql` — schema chính (drop cũ + tạo 15 bảng + RLS + triggers)
2. `v2-hotfix-invite-only.sql` — chuyển sang invite-only, RPC super admin
3. `v2-hotfix-2-pending-users.sql` — backfill profile + get_pending_users
4. `v2-hotfix-3-member-mgmt.sql` — RPC quản lý member
5. `v2-buoi2-zalo-accounts.sql` — phone_number + RPC zalo accounts
6. `v2-buoi2-fix-account-token.sql` — thêm cột `account_token`
7. `v2-buoi3-prep.sql` — `help_url` workspace
8. `v2-buoi4-system-settings.sql` — bảng system_settings (global help url)
9. `v2-buoi5-audit-log.sql` — bảng audit_logs + RPC
10. `v2-buoi5-super-admin-stats.sql` — RPC stats toàn hệ thống
11. `v2-recurring-campaigns.sql` — cột recurring + RPC generate_recurring_instance
12. `v2-multi-images.sql` — cột `image_urls` (mảng) cho campaigns + personal_campaigns
13. `v2-message-delay.sql` — cột `message_delay_seconds`
14. `v2-perf-stats.sql` — RPC aggregate (fix N+1)
15. `v2-zalo-api-concurrency.sql` — bảng/rpc điều phối API Zalo giữa nhiều request và nhiều instance Vercel
16. `v2-super-admin-operations.sql` — audit trigger/backfill, RPC Super Admin users/health, sửa top workspace stats
17. `v2-hotfix-delete-workspace-audit.sql` — xóa workspace an toàn khi audit trigger đang bật
- (Cũ, không dùng cho v2: `schema.sql`, `fix-rls.sql`, `fix-rls-v2.sql`)

---

## 3. TRẠNG THÁI HIỆN TẠI

- **Hoàn thiện, đang chạy production ổn định.** Đã gửi tin thật thành công (cả nhóm và cá nhân).
- 2 vấn đề cuối cùng đã được fix:
  1. **Upload ảnh stuck** (spinner quay mãi) → đã fix bằng upload trực tiếp client→Cloudinary (bypass giới hạn 4.5MB của Vercel).
  2. **Website chậm** (N+1 query — 27 đợt gửi = 81 query) → đã fix bằng RPC aggregate + limit.
- **Không có lỗi nghiêm trọng tồn đọng.** Các migration vận hành mới đã chạy trên Supabase.
- Mỗi khi sửa code: `git push` → Vercel tự deploy. Git identity đã set: `vuongly168-bke` / `282901117+vuongly168-bke@users.noreply.github.com`.

### Lưu ý vận hành
- **Rate limit Zalo**: error 216 = spam, 312 = rate limit. Khuyến nghị gửi cá nhân: 5 người/batch · 10 phút/batch · 3s/tin.
- **Dùng đồng thời**: mọi request lookup API Zalo dùng hàng đợi phân tán theo Zalo account (giãn tối thiểu 1,25 giây, retry lỗi tạm thời với backoff). Gửi tin không tự retry để tránh gửi trùng; batch campaign được claim nguyên tử.
- **Nhiều workspace**: một Gmail có thể là thành viên của nhiều workspace. Chọn workspace ở sidebar; API/RLS luôn kiểm tra membership trước khi lưu lựa chọn.
- **Audit & dọn dẹp**: audit logs được ghi tự động khi dữ liệu nghiệp vụ thay đổi và đã backfill lịch sử cơ bản. Super Admin có tab “Dọn dẹp” để lọc workspace im lặng từ 14 ngày, sau đó mở chi tiết workspace để xóa theo xác nhận tên (không tự xóa hàng loạt).
- **Xóa workspace**: RPC xóa dữ liệu con có audit trigger trước, xóa audit log của workspace rồi mới xóa workspace cha; tránh lỗi khóa ngoại khi xóa theo cascade.
- **Token func.vn** có hạn (exp ~2026-10) → khi hết phải cập nhật trong Cài đặt API.
- Khi tạo migration mới: code có **graceful fallback** (vd image_urls, message_delay_seconds) — app vẫn chạy nếu chưa chạy SQL.

---

## 4. CODE CỐT LÕI (BACKEND ĐẦY ĐỦ)

> Backend logic (API routes + lib) là phần cốt lõi nhất, paste đầy đủ dưới đây.
> UI (~7000 dòng) được mô tả chi tiết ở mục riêng — xem file thực tế trong repo.

### 4.1 `src/proxy.ts` (Auth guard — Next.js 16 dùng `proxy` thay `middleware`)
```typescript
import { type NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return await updateSession(request)
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|api/cron|auth/callback).*)'],
}
```

### 4.2 `src/lib/supabase/middleware.ts` (Session + redirect logic)
```typescript
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll() },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options))
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname
  const isAuthPage = path === '/login' || path === '/register'
  const isProtected = path.startsWith('/dashboard') || path === '/setup-workspace'

  if (!user && isProtected) {
    const url = request.nextUrl.clone(); url.pathname = '/login'
    return NextResponse.redirect(url)
  }
  if (user && (isAuthPage || path === '/')) {
    const { data: members } = await supabase.from('workspace_members')
      .select('workspace_id').eq('user_id', user.id).limit(1)
    const url = request.nextUrl.clone()
    url.pathname = (members && members.length > 0) ? '/dashboard' : '/setup-workspace'
    return NextResponse.redirect(url)
  }
  if (user && path.startsWith('/dashboard')) {
    const { data: members } = await supabase.from('workspace_members')
      .select('workspace_id').eq('user_id', user.id).limit(1)
    if (!members || members.length === 0) {
      const url = request.nextUrl.clone(); url.pathname = '/setup-workspace'
      return NextResponse.redirect(url)
    }
  }
  return supabaseResponse
}
```

### 4.3 `src/lib/supabase/{client,server,admin}.ts`
```typescript
// client.ts — browser
import { createBrowserClient } from '@supabase/ssr'
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
}

// server.ts — server component (đọc cookie)
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          try { cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)) } catch {}
        },
    }})
}

// admin.ts — service role (bypass RLS, dùng trong cron/send)
import { createClient } from '@supabase/supabase-js'
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } })
}
```

### 4.4 `src/app/auth/callback/route.ts` (Google OAuth callback)
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'
  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(`${origin}${next}`)
    console.error('[auth/callback] exchange error:', error.message)
  }
  return NextResponse.redirect(`${origin}/login?error=auth_failed`)
}
```

### 4.5 `src/app/api/upload/route.ts` (Cloudinary signature — bypass Vercel 4.5MB)
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME
  const apiKey = process.env.CLOUDINARY_API_KEY
  const apiSecret = process.env.CLOUDINARY_API_SECRET
  if (!cloudName || !apiKey || !apiSecret)
    return NextResponse.json({ error: 'Cloudinary not configured' }, { status: 500 })

  const timestamp = Math.floor(Date.now() / 1000)
  const folder = 'ZALO_AUTO_SEND'
  const { createHash } = await import('crypto')
  const signature = createHash('sha1')
    .update(`folder=${folder}&timestamp=${timestamp}${apiSecret}`)
    .digest('hex')

  return NextResponse.json({
    cloudName, apiKey, timestamp, folder, signature,
    uploadUrl: `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
  })
}
```

### 4.6 `src/lib/upload-image.ts` (Client upload trực tiếp lên Cloudinary)
```typescript
const UPLOAD_TIMEOUT_MS = 60_000

export async function uploadImageToCloudinary(file: File): Promise<{ url: string }> {
  const sigRes = await fetch('/api/upload', { method: 'GET' })
  if (!sigRes.ok) throw new Error(`Không lấy được chữ ký upload (HTTP ${sigRes.status})`)
  const sig = await sigRes.json()
  if (sig.error) throw new Error(sig.error)

  const form = new FormData()
  form.append('file', file)
  form.append('api_key', sig.apiKey)
  form.append('timestamp', String(sig.timestamp))
  form.append('signature', sig.signature)
  form.append('folder', sig.folder)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), UPLOAD_TIMEOUT_MS)
  let data: { secure_url?: string; error?: { message?: string } }
  try {
    const res = await fetch(sig.uploadUrl, { method: 'POST', body: form, signal: controller.signal })
    data = await res.json()
    if (!res.ok || data.error)
      throw new Error(data.error?.message || `Cloudinary lỗi (HTTP ${res.status})`)
  } catch (err) {
    if ((err as Error).name === 'AbortError')
      throw new Error('Upload quá lâu (>60s). Ảnh có thể quá nặng hoặc mạng chậm.')
    throw err
  } finally { clearTimeout(timer) }

  if (!data.secure_url) throw new Error('Cloudinary không trả về URL ảnh')
  const optimizedUrl = data.secure_url.replace(
    '/image/upload/', '/image/upload/c_limit,w_1600,q_auto,f_auto/')
  return { url: optimizedUrl }
}
```

### 4.7 `src/app/api/cron/route.ts` (Cron chính — recurring + group + personal batch)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export async function GET(request: NextRequest) {
  const cronSecret = request.headers.get('authorization')?.replace('Bearer ', '')
  if (cronSecret !== process.env.CRON_SECRET)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const supabase = createAdminClient()
  const now = new Date()
  const nowISO = now.toISOString()

  // 0. RECURRING PARENTS → tạo child instance (gen trước 1h)
  const generatedInstances: unknown[] = []
  const oneHourFromNow = new Date(now.getTime() + 60 * 60 * 1000).toISOString()
  const { data: dueRecurringParents } = await supabase.from('campaigns')
    .select('id, name, next_run_at')
    .eq('is_recurring', true).eq('status', 'active')
    .lte('next_run_at', oneHourFromNow)
  for (const p of dueRecurringParents || []) {
    try {
      const { data: newId, error } = await supabase.rpc('generate_recurring_instance', { p_parent_id: p.id })
      generatedInstances.push(error ? { parentId: p.id, error: error.message }
        : { parentId: p.id, parentName: p.name, newChildId: newId })
    } catch (err) { generatedInstances.push({ parentId: p.id, error: (err as Error).message }) }
  }

  // 1. GROUP CAMPAIGNS đến hạn
  const { data: groupCampaigns } = await supabase.from('campaigns')
    .select('id, name, scheduled_at').eq('status', 'scheduled').lte('scheduled_at', nowISO)
  const groupResults: unknown[] = []
  for (const c of groupCampaigns || []) {
    try {
      const res = await fetch(`${request.nextUrl.origin}/api/zalo/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET! },
        body: JSON.stringify({ campaignId: c.id }),
      })
      groupResults.push({ campaignId: c.id, name: c.name, ...(await res.json()) })
    } catch (err) { groupResults.push({ campaignId: c.id, error: (err as Error).message }) }
  }

  // 2. PERSONAL CAMPAIGNS — batch processing
  const { data: pendingPersonal } = await supabase.from('personal_campaigns')
    .select('id, name, batch_size, batch_delay_minutes')
    .eq('status', 'scheduled').lte('scheduled_at', nowISO)
  const { data: sendingPersonal } = await supabase.from('personal_campaigns')
    .select('id, name, current_batch, batch_size, batch_delay_minutes, last_batch_sent_at')
    .eq('status', 'sending')
  const dueNextBatch = (sendingPersonal || []).filter(c => {
    if (!c.last_batch_sent_at) return true
    return now.getTime() >= new Date(c.last_batch_sent_at).getTime() + c.batch_delay_minutes * 60 * 1000
  })
  const personalResults: unknown[] = []
  for (const c of [...(pendingPersonal || []), ...dueNextBatch]) {
    try {
      const res = await fetch(`${request.nextUrl.origin}/api/zalo/personal-send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-cron-secret': process.env.CRON_SECRET! },
        body: JSON.stringify({ campaignId: c.id }),
      })
      personalResults.push({ campaignId: c.id, name: c.name, ...(await res.json()) })
    } catch (err) { personalResults.push({ campaignId: c.id, error: (err as Error).message }) }
  }

  return NextResponse.json({
    message: 'Done', now: nowISO,
    recurring_generated: { count: generatedInstances.length, results: generatedInstances },
    group: { count: groupResults.length, results: groupResults },
    personal: { count: personalResults.length, results: personalResults },
  })
}
```

### 4.8 `src/app/api/zalo/group-info/route.ts` (Lookup nhóm từ link)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { groupLink, projectId } = await request.json()
  const { data: project } = await supabase.from('projects')
    .select('zalo_account_id').eq('id', projectId).single()
  if (!project?.zalo_account_id)
    return NextResponse.json({ error: 'Project chưa được gắn Zalo Account.' }, { status: 400 })

  const { data: apiKey } = await supabase.from('api_keys')
    .select('api_url, bearer_token')
    .eq('zalo_account_id', project.zalo_account_id)
    .eq('key_type', 'get_group_info').single()
  if (!apiKey)
    return NextResponse.json({ error: 'Zalo Account chưa cấu hình API "Lấy thông tin Group".' }, { status: 400 })

  try {
    const res = await fetch(apiKey.api_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey.bearer_token}` },
      body: JSON.stringify({ group_link: String(groupLink).trim() }),
    })
    const responseText = await res.text()
    let data: Record<string, unknown>
    try { data = JSON.parse(responseText) }
    catch { return NextResponse.json({ error: 'API trả về dữ liệu không phải JSON' }, { status: 400 }) }

    if (res.status !== 200)
      return NextResponse.json({ error: `API code ${res.status}: ${(data.error_message as string) || (data.message as string) || 'Unknown error'}` }, { status: 400 })

    // Parse nhiều cấu trúc response func.vn (data.data / data / data.data.data)
    let groupId: string | null = null, groupName: string | null = null, memberCount = 0
    const dataField = data.data as Record<string, unknown> | undefined
    const innerData = dataField?.data as Record<string, unknown> | undefined
    if (dataField?.groupId) {
      groupId = String(dataField.groupId)
      groupName = (dataField.name as string) || (dataField.groupName as string) || null
      memberCount = (dataField.totalMember as number) || (dataField.memberCount as number) || 0
    } else if (data.groupId) {
      groupId = String(data.groupId)
      groupName = (data.name as string) || (data.groupName as string) || null
      memberCount = (data.totalMember as number) || (data.memberCount as number) || 0
    } else if (innerData?.groupId) {
      groupId = String(innerData.groupId)
      groupName = (innerData.name as string) || (innerData.groupName as string) || null
      memberCount = (innerData.totalMember as number) || (innerData.memberCount as number) || 0
    }
    if (!groupId) return NextResponse.json({ error: 'API không trả về groupId.' }, { status: 400 })
    return NextResponse.json({ name: groupName || 'Unknown', groupId, memberCount })
  } catch (err) {
    return NextResponse.json({ error: 'Không thể kết nối API: ' + (err as Error).message }, { status: 500 })
  }
}
```

### 4.9 `src/app/api/zalo/user-info/route.ts` (Lookup user từ SĐT — dùng Account-Token)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

function normalizePhone(phone: string): string {
  let p = String(phone).trim().replace(/[\s\-\(\)]/g, '')
  if (p.startsWith('+84')) p = '0' + p.substring(3)
  else if (p.startsWith('84')) p = '0' + p.substring(2)
  if (!p.startsWith('0') && !p.startsWith('+')) p = '0' + p
  return p
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { phone, userId, zaloAccountId } = await request.json()
  if (!phone && !userId) return NextResponse.json({ error: 'Cần phone hoặc userId' }, { status: 400 })
  if (!zaloAccountId) return NextResponse.json({ error: 'Cần chọn Zalo Account' }, { status: 400 })

  const { data: apiKey } = await supabase.from('api_keys')
    .select('api_url, bearer_token, account_token')
    .eq('zalo_account_id', zaloAccountId).eq('key_type', 'get_user_info').single()
  if (!apiKey) return NextResponse.json({ error: 'Zalo Account chưa cấu hình API "Lấy thông tin User".' }, { status: 400 })
  if (!apiKey.account_token) return NextResponse.json({ error: 'API "Lấy thông tin User" thiếu Account Token.' }, { status: 400 })

  const payload: Record<string, string> = {}
  if (userId) payload.user_id = String(userId).trim()
  else payload.phone_number = normalizePhone(String(phone))

  try {
    const res = await fetch(apiKey.api_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey.bearer_token}`,
        'Account-Token': apiKey.account_token,
      },
      body: JSON.stringify(payload),
    })
    const responseText = await res.text()
    let data: Record<string, unknown>
    try { data = JSON.parse(responseText) }
    catch { return NextResponse.json({ error: 'API trả về không phải JSON' }, { status: 400 }) }

    const dataField = data.data as Record<string, unknown> | undefined
    const safeStr = (v: unknown): string => {
      if (v == null) return ''
      if (typeof v === 'string') return v
      if (typeof v === 'number' || typeof v === 'boolean') return String(v)
      try { return JSON.stringify(v) } catch { return '[unknown]' }
    }
    const errorMsg = safeStr(dataField?.error_message ?? data.message ?? data.error)
    const errorCode = (dataField?.error_code as number) ?? (data.status as number)
    const apiHasError = res.status !== 200
      || (data.status !== undefined && data.status !== 200)
      || (dataField?.error_code !== undefined && dataField.error_code !== 0)

    if (apiHasError) {
      let friendlyMsg = errorMsg || `API code ${errorCode || res.status}`
      const lower = String(friendlyMsg).toLowerCase()
      if (lower.includes('not found') || (lower.includes('user') && lower.includes('not')))
        friendlyMsg = 'Số này chưa đăng ký Zalo (hoặc đã đổi số)'
      else if (lower.includes('private') || lower.includes('privacy'))
        friendlyMsg = 'Người dùng đặt thông tin riêng tư, không lookup được'
      else if (lower.includes('rate') || lower.includes('limit'))
        friendlyMsg = 'API bị rate limit. Thử lại sau ít phút.'
      else if (lower.includes('token') || lower.includes('unauthorized'))
        friendlyMsg = 'Token hết hạn hoặc sai. Vào Cài đặt API để cập nhật.'
      else if (!errorMsg)
        friendlyMsg = `API code ${errorCode || res.status} (không chi tiết). Số có thể chưa có Zalo.`
      return NextResponse.json({ error: friendlyMsg }, { status: 400 })
    }

    // Parse user (3 cấu trúc): data.data.userId | data.data[key]={...} | data.userId
    let foundUserId: string | null = null, foundUserName: string | null = null, foundAvatar: string | null = null
    const innerData = dataField?.data as Record<string, unknown> | undefined
    if (innerData) {
      if (innerData.userId) {
        foundUserId = String(innerData.userId)
        foundUserName = (innerData.zaloName as string) || (innerData.displayName as string) || null
        foundAvatar = (innerData.avatar as string) || null
      } else {
        const keys = Object.keys(innerData)
        if (keys.length > 0) {
          const obj = innerData[keys[0]] as Record<string, unknown>
          if (obj && typeof obj === 'object') {
            foundUserId = (obj.userId as string) || keys[0]
            foundUserName = (obj.zaloName as string) || (obj.displayName as string) || null
            foundAvatar = (obj.avatar as string) || null
          }
        }
      }
    }
    if (!foundUserId && dataField?.userId) {
      foundUserId = String(dataField.userId)
      foundUserName = (dataField.zaloName as string) || null
      foundAvatar = (dataField.avatar as string) || null
    }
    if (!foundUserId && !foundUserName)
      return NextResponse.json({ error: 'Không tìm thấy user (chưa có Zalo hoặc riêng tư)' }, { status: 404 })

    return NextResponse.json({
      userId: foundUserId, userName: foundUserName, avatar: foundAvatar,
      normalizedPhone: phone ? normalizePhone(String(phone)) : null,
    })
  } catch (err) {
    return NextResponse.json({ error: 'Không thể kết nối API: ' + (err as Error).message }, { status: 500 })
  }
}
```

### 4.10 `src/app/api/zalo/send/route.ts` (Gửi 1 campaign NHÓM)
```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function callApi(apiUrl: string, bearerToken: string, body: Record<string, unknown>) {
  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${bearerToken}` },
    body: JSON.stringify(body),
  })
  const text = await res.text()
  console.log('[zalo-send] URL:', apiUrl, '| Status:', res.status, '| Body:', text.substring(0, 500))
  return { status: res.status, text }
}

export async function POST(request: NextRequest) {
  const isCron = request.headers.get('x-cron-secret') === process.env.CRON_SECRET
  const supabase = isCron ? createAdminClient() : await createClient()
  if (!isCron) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { campaignId } = await request.json()
  const { data: campaign } = await supabase.from('campaigns')
    .select('*, projects(zalo_account_id)').eq('id', campaignId).single()
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })

  const zaloAccountId = (campaign.projects as { zalo_account_id: string | null }).zalo_account_id
  if (!zaloAccountId) return NextResponse.json({ error: 'Project chưa được gắn Zalo Account' }, { status: 400 })

  const { data: imageApiKey } = await supabase.from('api_keys')
    .select('api_url, bearer_token').eq('zalo_account_id', zaloAccountId)
    .eq('key_type', 'group_send_images').single()
  const { data: messageApiKey } = await supabase.from('api_keys')
    .select('api_url, bearer_token').eq('zalo_account_id', zaloAccountId)
    .eq('key_type', 'group_send_message').single()

  const { data: campaignGroups } = await supabase.from('campaign_groups')
    .select('*, zalo_groups(group_id)').eq('campaign_id', campaignId)
    .in('status', ['pending', 'failed'])
  if (!campaignGroups || campaignGroups.length === 0)
    return NextResponse.json({ error: 'Không có nhóm nào cần gửi' }, { status: 400 })

  await supabase.from('campaigns').update({ status: 'sending' }).eq('id', campaignId)
  let successCount = 0, failedCount = 0
  const allImageUrls: string[] = Array.isArray(campaign.image_urls) && campaign.image_urls.length > 0
    ? campaign.image_urls : (campaign.image_url ? [campaign.image_url] : [])

  for (const cg of campaignGroups) {
    const zaloGroupId = (cg.zalo_groups as { group_id: string }).group_id
    const errors: string[] = []
    try {
      if (allImageUrls.length > 0 && imageApiKey) {
        const r = await callApi(imageApiKey.api_url, imageApiKey.bearer_token,
          { urls: allImageUrls, group_id: zaloGroupId })
        if (r.status !== 200) errors.push(`Image fail (${r.status})`)
      }
      if (campaign.message && messageApiKey) {
        const r = await callApi(messageApiKey.api_url, messageApiKey.bearer_token,
          { group_id: zaloGroupId, message: campaign.message })
        if (r.status !== 200) errors.push(`Message fail (${r.status})`)
      }
      if (!campaign.message && allImageUrls.length === 0) errors.push('No content')
      const hasError = errors.length > 0
      await supabase.from('campaign_groups').update({
        status: hasError ? 'failed' : 'sent',
        sent_at: new Date().toISOString(),
        error_message: hasError ? errors.join('; ') : null,
      }).eq('id', cg.id)
      if (hasError) failedCount++; else successCount++
    } catch (err) {
      await supabase.from('campaign_groups').update({
        status: 'failed', error_message: (err as Error).message }).eq('id', cg.id)
      failedCount++
    }
    await new Promise(resolve => setTimeout(resolve, 1000))  // delay 1s/nhóm
  }

  const finalStatus = failedCount === 0 ? 'sent' : successCount === 0 ? 'failed' : 'partial'
  await supabase.from('campaigns').update({ status: finalStatus }).eq('id', campaignId)
  return NextResponse.json({ successCount, failedCount, totalGroups: campaignGroups.length })
}
```

### 4.11 `src/app/api/zalo/personal-send/route.ts` (Gửi 1 BATCH cá nhân)
Logic chính:
- Auth (cron secret hoặc user). Load campaign + Zalo account.
- Load API keys `user_send_message` + `user_send_images`.
- `allImageUrls` = image_urls[] (fallback image_url).
- `nextBatch = batchNumber || campaign.current_batch + 1`.
- Load recipients `batch_number = nextBatch AND status='pending'` (kèm contacts).
- Với mỗi recipient: render placeholder `{ten}/{name}/{sdt}/{phone}`; body ưu tiên `user_id` (zalo_user_id) fallback `phone_number`; gọi gửi ảnh (urls[]) rồi gửi message (đều kèm `Account-Token` header); update status từng recipient.
- **Delay giữa mỗi tin** = `message_delay_seconds * 1000` (default 3s) **+ jitter ±500ms**, min 500ms.
- Update `current_batch` + `last_batch_sent_at`. Khi hết pending → set final status (sent/partial/failed).
- Trả `{ batch, successCount, failedCount, totalInBatch, hasMore }`.

```typescript
// (Trích phần gửi từng recipient — xem file đầy đủ trong repo)
const baseBody: Record<string, string> = {}
if (contact.zalo_user_id) baseBody.user_id = contact.zalo_user_id
else baseBody.phone_number = contact.phone

if (allImageUrls.length > 0 && imgKey) {
  await fetch(imgKey.api_url, { method: 'POST', headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${imgKey.bearer_token}`,
    ...(imgKey.account_token ? { 'Account-Token': imgKey.account_token } : {}),
  }, body: JSON.stringify({ ...baseBody, urls: allImageUrls }) })
}
if (msg && msgKey) {
  await fetch(msgKey.api_url, { method: 'POST', headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${msgKey.bearer_token}`,
    ...(msgKey.account_token ? { 'Account-Token': msgKey.account_token } : {}),
  }, body: JSON.stringify({ ...baseBody, message: msg }) })
}
const delayMs = (campaign.message_delay_seconds || 3) * 1000
const jitter = Math.floor(Math.random() * 1000) - 500
await new Promise(r => setTimeout(r, Math.max(500, delayMs + jitter)))
```

### 4.12 `src/lib/audit-log.ts` + `src/lib/hooks/use-user-role.ts`
```typescript
// audit-log.ts — ghi log không block flow chính
export async function logAction(supabase, workspaceId, action, options?) {
  try {
    await supabase.rpc('log_action', {
      p_workspace_id: workspaceId, p_action: action,
      p_resource_type: options?.resourceType || null,
      p_resource_id: options?.resourceId || null,
      p_resource_name: options?.resourceName || null,
      p_metadata: (options?.metadata || {}) as object,
    })
  } catch (err) { console.warn('logAction failed:', err) }
}

// use-user-role.ts — trả { role, isSuperAdmin, isOwner, isAdmin, isMember,
//   canManageWorkspace, canManageProjects, canDeleteWorkspace, loading }
// Logic: super_admin > owner > admin > member. canManageProjects = admin|owner|super.
```

### 4.13 `src/lib/types.ts` — Types + constants quan trọng
- Interfaces: `Profile, Workspace, WorkspaceMember, ZaloAccount, ApiKey, Project, ZaloGroup, Campaign, CampaignGroup, Contact, ContactList, PersonalCampaign, PersonalCampaignRecipient, ImportBatch`.
- `ApiKey.key_type`: 6 loại — `get_group_info, group_send_message, group_send_images, get_user_info, user_send_message, user_send_images`.
- `KEYS_NEED_ACCOUNT_TOKEN = [user_send_message, user_send_images, get_user_info]`.
- `API_KEY_LABELS` (HOA theo func.vn), `API_KEY_DESCRIPTIONS`, `HIGHLIGHTED_KEYS = [get_group_info, get_user_info]`.
- `API_KEY_GROUPS`: 2 nhóm (Gửi nhóm / Gửi cá nhân), mỗi nhóm 3 key, GET đứng đầu.
- `CAMPAIGN_STATUS_LABELS` (9 status gồm active/completed/paused cho recurring), `PERSONAL_CAMPAIGN_STATUS_LABELS`.
- `describeRecurrence(campaign)`: tạo chuỗi mô tả lịch lặp ("Mỗi tuần vào T2, T5 · 3/10 lần").

---

## 4bis. SCHEMA DATABASE (cấu trúc bảng cuối cùng sau mọi migration)

```
profiles(id PK→auth.users, email, full_name, avatar_url,
         is_super_admin bool, is_banned bool, timestamps)
workspaces(id PK, name, description, help_url, created_by, timestamps)
workspace_members(id PK, workspace_id FK, user_id FK,
                  role['owner'|'admin'|'member'], UNIQUE(workspace_id,user_id))
zalo_accounts(id PK, workspace_id FK, name, phone_number, description,
              is_active, timestamps)
api_keys(id PK, zalo_account_id FK, key_type[6 loại], api_url, bearer_token,
         account_token, UNIQUE(zalo_account_id,key_type))
projects(id PK, workspace_id FK, zalo_account_id FK, name, description, created_by, timestamps)
zalo_groups(id PK, project_id FK, group_name, group_id, group_link,
            member_count, is_active, import_batch_id, created_at)
campaigns(id PK, project_id FK, name, message, image_url, image_urls TEXT[],
          scheduled_at, status[9 loại], created_by, timestamps,
          -- recurring: is_recurring, recurrence_unit(day/week/month),
          -- recurrence_interval, recurrence_days_of_week INT[],
          -- recurrence_end_type(never/date/count), recurrence_end_date,
          -- recurrence_end_count, recurrence_count_done,
          -- recurring_parent_id FK→campaigns, next_run_at)
campaign_groups(id PK, campaign_id FK, zalo_group_id FK,
                status[pending/sent/failed], sent_at, error_message)
contacts(id PK, workspace_id FK, phone, name, zalo_user_id, avatar_url,
         tags TEXT[], notes, last_synced_at, import_batch_id, created_by,
         timestamps, UNIQUE(workspace_id,phone))  -- + GIN index trên tags
contact_lists(id PK, workspace_id FK, name, description, created_by, timestamps)
contact_list_members(list_id FK, contact_id FK, added_at, PK kép)
personal_campaigns(id PK, workspace_id FK, zalo_account_id FK, name, message,
                   image_url, image_urls TEXT[], scheduled_at,
                   batch_size, batch_delay_minutes, message_delay_seconds,
                   current_batch, last_batch_sent_at, status[8 loại],
                   created_by, timestamps)
personal_campaign_recipients(id PK, campaign_id FK, contact_id FK,
                   batch_number, status[pending/sent/failed], sent_at, error_message,
                   UNIQUE(campaign_id,contact_id))
import_batches(id PK, workspace_id FK, user_id, type[contacts/groups/campaigns],
               file_name, total_rows, success_rows, failed_rows, error_log JSONB, created_at)
system_settings(key PK, value, description, updated_at, updated_by)  -- global_help_url
audit_logs(id PK, workspace_id FK, user_id, user_email, action, resource_type,
           resource_id, resource_name, metadata JSONB, ip_address, created_at)
```

### RLS — pattern chống đệ quy (QUAN TRỌNG)
Dùng **SECURITY DEFINER functions** để check quyền (tránh lỗi "infinite recursion" khi policy của `workspace_members` query chính nó):
- `is_super_admin(uid)`, `is_workspace_member(ws,uid)`, `is_workspace_admin(ws,uid)`.
- Mọi policy dùng các function này thay vì subquery trực tiếp.

### RPC functions chính (SECURITY DEFINER)
```
create_workspace_with_owner(name, desc, owner_email)  -- chỉ super admin
invite_member / assign_user_to_workspace / change_member_role / remove_workspace_member
get_pending_users / get_all_workspaces_admin / get_workspace_members
update_workspace_info(id, name, desc, help_url) / delete_workspace
set_user_banned / is_super_admin
create_zalo_account / update_zalo_account / delete_zalo_account / get_zalo_accounts_with_stats
set_system_setting / get_system_overview / get_top_workspaces_by_activity
log_action / get_workspace_audit_logs / get_all_audit_logs
calculate_next_run / generate_recurring_instance / get_recurring_instances
get_personal_campaigns_with_stats / get_personal_campaign_progress  -- fix N+1
get_all_users_admin / get_workspace_health_overview                 -- Super Admin vận hành
```
- Trigger `handle_new_user`: tự tạo profile khi user đăng ký; auto set `is_super_admin=TRUE` cho `ADMIN_EMAIL_HERE`.

---

## 4ter. MÔ TẢ CÁC FILE UI (không paste full — xem repo)

| File | Vai trò chính |
|------|---------------|
| `components/campaign-form.tsx` (724d) | Form tạo/sửa/copy đợt gửi NHÓM. Có: chọn nhóm (checkbox + chọn tất cả), nội dung, **multi-image (5 ảnh) + paste clipboard**, thời gian (validate quá khứ), **block recurring** (toggle + chọn ngày tuần + end condition). Fallback graceful nếu DB thiếu cột image_urls. |
| `components/personal-campaign-form.tsx` (750d) | Form đợt gửi CÁ NHÂN. Chọn Zalo account, nội dung + placeholder `{ten}/{sdt}` + preview, multi-image, **chọn contacts** (search/tag filter/chỉ-có-Zalo/chọn-tất-cả), **batch config** (5 người·10 phút·3s + cảnh báo spam + ước tính thời gian). |
| `components/sidebar.tsx` (385d+) | Sidebar responsive. Mobile: hamburger + slide-in + backdrop + `[height:100svh]`. Nếu user thuộc nhiều workspace thì có bộ chọn workspace, chuyển xong quay về dashboard. 2 nhóm menu (Gửi nhóm/Gửi cá nhân). Logout vừa là nav item vừa là icon footer. |
| `dashboard/settings/page.tsx` (624d) | Cài đặt API. List Zalo Accounts (CRUD) → click vào → form **6 API keys** chia 2 nhóm collapsible. Field thứ tự: API URL → ACCOUNT TOKEN (nếu cần) → API TOKEN. GET_* highlight xanh. |
| `dashboard/admin/page.tsx` | Super Admin: Tổng quan (stats, health, top workspace), User chờ duyệt, **Gán user** (một Gmail vào nhiều workspace), Tất cả workspaces, **Dọn dẹp** (lọc im lặng ≥14 ngày), Tạo workspace, Cài đặt hệ thống. |
| `dashboard/contacts/page.tsx` (418d) | Khách hàng: list + search + filter tag + sort + bulk lookup tên Zalo. Modals: add/edit + import. |
| `dashboard/page.tsx` (287d) | Tổng quan: 4 stat cards, 2 panel (gửi nhóm/cá nhân), banner tổng tin đã gửi, 2 list upcoming. Có nút "Chạy cron thủ công". |
| `components/contacts/import-contacts-modal.tsx` | Import khách: tab paste / upload Excel. Smart-detect cột (phone/SĐT/sdt). Preview + validate. Auto-lookup tên (default ON). Ghi import_batches. |
| `components/groups/import-groups-modal.tsx` | Import link nhóm hàng loạt: paste/Excel → lookup từng link (1s delay) → insert zalo_groups. |
| `dashboard/personal-campaigns/[id]/page.tsx` (365d) | Chi tiết đợt cá nhân: stats + progress bar + actions (gửi batch ngay/gửi lại lỗi/pause/export Excel/sao chép & sửa) + recipients list (filter status). Auto-refresh 15s khi sending. |
| `dashboard/projects/[id]/page.tsx` (547d) | Chi tiết dự án: tab Nhóm Zalo + Đợt gửi. Badge Zalo account (đổi được). Edit/xóa dự án. Import nhóm. Campaign list hiện badge recurring. |
| Còn lại | members, audit-log, admin/workspaces/[id], các trang `new`/`edit` (wrapper gọi form component). |

---

## 5. BƯỚC TIẾP THEO (nice-to-have, chưa làm)

Hệ thống đã đủ dùng. Các ý tưởng mở rộng nếu cần:
1. **Contact Lists UI**: bảng `contact_lists` + `contact_list_members` đã có schema nhưng chưa làm UI gom nhóm khách (hiện chọn contact trực tiếp khi tạo campaign).
2. **Recurring cho personal campaigns**: hiện recurring chỉ áp dụng gửi NHÓM (cố ý — tránh spam cá nhân).
3. **Notifications / Webhook**: báo khi campaign xong/lỗi hoặc workspace bị im lặng lâu.
4. **Báo cáo nâng cao**: xuất PDF, thống kê theo tháng/quý.
5. **Pause/Resume recurring UI**: hiện set status='paused' trong DB; chưa có nút UI riêng cho parent recurring.
6. **Client-side image compression** trước khi upload (giảm nữa dung lượng).

### Yêu cầu kỹ thuật khi tiếp tục
- Mọi thay đổi: `git push` → Vercel auto-deploy (~2 phút).
- Migration mới: thêm file `supabase/*.sql`, chạy thủ công trong Supabase SQL Editor. Luôn viết code có **graceful fallback** để app không crash khi chưa chạy SQL.
- Next.js 16: dùng `proxy.ts` (không phải `middleware.ts`); đọc docs trong `node_modules/next/dist/docs/` trước khi dùng API mới.

---

## 6. QUYẾT ĐỊNH ĐÃ THỐNG NHẤT

### Stack đã chốt
| Hạng mục | Lựa chọn | Lý do |
|----------|----------|-------|
| Framework | Next.js 16 App Router | Full-stack, deploy Vercel free |
| DB + Auth | Supabase (PostgreSQL + RLS) | Free tier, RLS bảo mật multi-tenant |
| Auth method | **Google OAuth ONLY** | Bảo mật cao, bớt code (không password/verify email); team đều có Google |
| Hosting | Vercel free + custom domain riêng | Auto-deploy từ GitHub |
| Cron | **cron-job.org** ping mỗi phút | Vercel Hobby chỉ chạy cron 1 lần/ngày |
| Ảnh | Cloudinary + **upload trực tiếp client→Cloudinary** | Bypass giới hạn 4.5MB body của Vercel |
| Zalo API | func.vn proxy | Đã có sẵn từ hệ thống GAS cũ |
| Excel | xlsx (npm) | Import/export, smart-detect cột |

### Kiến trúc đã chốt
- **Multi-tenant**: Workspace → nhiều Zalo Account → Project (gắn 1 Zalo Account) → Group/Campaign. Contacts + Personal Campaigns ở cấp workspace.
- **TÁCH BIỆT gửi nhóm vs gửi cá nhân** (yêu cầu rõ của user — KHÔNG MIX): sidebar 2 nhóm riêng, 2 bảng campaign riêng, 2 API route riêng.
- **Invite-only**: chỉ Super Admin (`ADMIN_EMAIL_HERE`) tạo workspace + gán user. User mới thấy màn "chờ duyệt".
- **Một user, nhiều workspace**: bảng membership cho phép một Gmail ở nhiều workspace; workspace đang thao tác được chọn rõ ràng ở sidebar và xác thực lại tại server.
- **Phân quyền**: Super Admin > Owner > Admin > Member. Member không thấy Cài đặt API / Quản lý thành viên.
- **Account Token**: 3 API user (get_user_info, user_send_*) cần thêm header `Account-Token` (khác Bearer/API Token) — đặc thù func.vn.
- **Chống spam Zalo**: personal campaign gửi theo batch (mặc định 5 người) + delay giữa batch (10 phút) + delay giữa tin (3s + jitter).
- **Chống quá tải khi training**: lookup group/user dùng hàng đợi phân tán theo Zalo account, có timeout và chỉ retry các lỗi an toàn; mỗi lần gửi không retry tự động để không tạo tin nhắn trùng.

### Đã thử và LOẠI BỎ
- ❌ **Email/password auth** → bỏ, chuyển hẳn Google OAuth (reset toàn bộ DB + user test).
- ❌ **API keys ở cấp workspace** → chuyển xuống cấp **zalo_account** (1 workspace nhiều Zalo).
- ❌ **Proxy upload ảnh qua Vercel** (`POST /api/upload` + base64) → bỏ vì base64 tăng 33% vượt 4.5MB → stuck. Chuyển sang **signature + upload trực tiếp**.
- ❌ **RLS policy subquery trực tiếp trên workspace_members** → gây "infinite recursion". Thay bằng SECURITY DEFINER functions.
- ❌ **Vercel Cron** → bỏ (Hobby chỉ 1 lần/ngày), dùng cron-job.org.
- ❌ **N+1 query lấy stats** (3 query/campaign) → thay bằng RPC aggregate LATERAL join.
- ❌ **`100dvh`** cho sidebar mobile → đổi `100svh` (Chrome iOS bottom toolbar che footer).
- ❌ **1 ảnh/campaign** → mở rộng multi-image (tối đa 5 ảnh, cột `image_urls TEXT[]`).
- ❌ **`middleware.ts`** → đổi `proxy.ts` (Next.js 16 đổi tên convention).

---

## PHỤ LỤC — Biến môi trường (Vercel + .env.local)
```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...          # cho cron/admin client (bypass RLS)
CLOUDINARY_CLOUD_NAME=dau6zhdv1
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=dau6zhdv1
CRON_SECRET=<set-in-secret-store> # Never commit a real value
```

## PHỤ LỤC — Bộ lập lịch
`/api/cron` phải được gọi định kỳ (khuyến nghị 1–5 phút/lần) với header `Authorization: Bearer $CRON_SECRET`.
Có thể dùng cron-job.org, systemd timer, cron của máy chủ, hoặc bất kỳ bộ lập lịch nào gọi được HTTP.
Xem `HUONG_DAN_CHAY.md`.

## PHỤ LỤC — Setup Google OAuth
- Google Cloud Console → OAuth Client ID (Web) → Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
- Supabase → Authentication → Providers → Google (Client ID + Secret) → Site URL `https://<your-domain>` + redirect URLs `.../auth/callback`
```
