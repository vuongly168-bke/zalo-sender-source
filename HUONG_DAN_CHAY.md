# Hướng dẫn chạy Zalo Sender

Ứng dụng web gửi tin nhắn Zalo tự động tới nhóm và cá nhân, qua API của func.vn.
**Next.js 16** (App Router) · **Supabase** (Postgres + Auth Google) · **Cloudflare R2** (lưu ảnh).

Đọc `TONG_KET_DU_AN.md` để hiểu kiến trúc, phân quyền và các quyết định đã chốt.
Lưu ý: tài liệu đó viết từ thời chạy trên Vercel + Cloudinary; hiện tại ảnh lưu trên Cloudflare R2.

## 1. Cần chuẩn bị

- Node.js 22 trở lên
- Một project Supabase (supabase.com, gói free là đủ để thử)
- Một Google OAuth Client (Google Cloud Console) để đăng nhập
- Một bucket Cloudflare R2 nếu muốn đính kèm ảnh
- Tài khoản func.vn để gửi Zalo thật (không có vẫn chạy được giao diện)

## 2. Cài đặt

```bash
npm ci
cp .env.example .env.local   # rồi điền giá trị
npm run dev                  # mở http://localhost:3000
```

## 3. Dựng database

Chạy các file trong thư mục `supabase/` bằng **Supabase → SQL Editor**, đúng thứ tự:

> ⚠️ **Trước khi chạy:** tìm `ADMIN_EMAIL_HERE` trong `schema-v2.sql` và
> `v2-hotfix-2-pending-users.sql` (mỗi file có thể xuất hiện 1–2 lần), thay bằng **email Google của bạn**. Email này được
> tự động làm Super Admin, người duy nhất tạo được workspace.

1. `schema-v2.sql`
2. `v2-hotfix-invite-only.sql`
3. `v2-hotfix-2-pending-users.sql`
4. `v2-hotfix-3-member-mgmt.sql`
5. `v2-buoi2-zalo-accounts.sql`
6. `v2-buoi2-fix-account-token.sql`
7. `v2-buoi3-prep.sql`
8. `v2-buoi4-system-settings.sql`
9. `v2-buoi5-audit-log.sql`
10. `v2-buoi5-super-admin-stats.sql`
11. `v2-recurring-campaigns.sql`
12. `v2-multi-images.sql`
13. `v2-message-delay.sql`
14. `v2-perf-stats.sql`
15. `v2-zalo-api-concurrency.sql`
16. `v2-super-admin-operations.sql`
17. `v2-hotfix-delete-workspace-audit.sql`
18. `v2-security-hardening.sql` — **bắt buộc**: thu hồi quyền đọc token func.vn từ trình duyệt

Bỏ qua `schema.sql`, `fix-rls.sql`, `fix-rls-v2.sql` (bản v1 cũ).

## 4. Đăng nhập Google

1. Google Cloud Console → Credentials → OAuth Client ID (Web application).
   Authorized redirect URI: `https://<project-ref>.supabase.co/auth/v1/callback`
2. Supabase → Authentication → Providers → Google: dán Client ID và Secret.
3. Supabase → Authentication → URL Configuration:
   - Site URL: địa chỉ web của bạn (khi chạy thử: `http://localhost:3000`)
   - Redirect URLs: thêm `http://localhost:3000/auth/callback` (và domain thật khi deploy)

Đăng nhập lần đầu bằng email Super Admin, vào **Super Admin** để tạo workspace,
rồi vào **Cài đặt API** nhập token func.vn cho từng tài khoản Zalo.

## 5. Bộ lập lịch gửi tin

Campaign hẹn giờ chỉ được gửi khi có ai đó gọi `/api/cron` định kỳ:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron
```

Khi deploy, cấu hình cron-job.org, systemd timer, cron của máy chủ,... gọi URL này mỗi 1–5 phút.
Trong giao diện cũng có nút "Chạy cron thủ công" cho admin.

## 6. Kiểm tra trước khi đẩy code

```bash
npm run lint
npm test
npm run build
```

Workflow `.github/workflows/verify.yml` chạy đủ các bước này cùng quét bảo mật
(gitleaks, semgrep, npm audit, trivy) mỗi khi push hoặc mở Pull Request.

## 7. Deploy

`Dockerfile` build ra image Next.js standalone, chạy được trên mọi máy có Docker:

```bash
docker build \
  --build-arg NEXT_PUBLIC_SUPABASE_URL=... \
  --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... \
  -t zalo-sender .
docker run -p 3000:3000 --env-file .env.local zalo-sender
```

Cũng deploy được lên Vercel (khi đó dùng cron-job.org để gọi `/api/cron`).

## Lưu ý khi đặt sau Cloudflare

Cloudflare (gói free) thay nội dung mọi response 502/504 bằng trang HTML của nó.
Vì vậy code cố ý không trả 502/504 từ API, để thông báo lỗi thật đến được người dùng.
