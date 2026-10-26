import type { NextConfig } from "next";

// Trên Vercel một phần các header này do platform lo. Từ khi chuyển sang VPS
// tự quản reverse proxy thì ứng dụng phải tự phát chúng.
//
// CSP cho phép 'unsafe-inline' + 'unsafe-eval' ở script-src vì Next.js App
// Router nhúng payload hydrate dạng inline script. Siết tiếp bằng nonce là việc
// riêng, cần đụng vào proxy.ts nên để sang lần sau.
// Supabase chạy tự host, không phải *.supabase.co, nên lấy đúng origin từ biến
// build. Viết cứng domain từng làm trình duyệt bị chặn gọi Supabase.
function supabaseOrigins(): string[] {
  const raw = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!raw) return []
  try {
    const { protocol, host } = new URL(raw)
    return [`${protocol}//${host}`, `${protocol === "https:" ? "wss:" : "ws:"}//${host}`]
  } catch {
    return []
  }
}

const connectSources = [
  "'self'",
  ...supabaseOrigins(),
  "https://*.supabase.co",
  "wss://*.supabase.co",
  // Cloudflare Web Analytics do proxy tự chèn vào trang.
  "https://cloudflareinsights.com",
].join(" ");

const securityHeaders = [
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=31536000; includeSubDomains",
  },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://static.cloudflareinsights.com",
      "style-src 'self' 'unsafe-inline'",
      // Ảnh campaign nằm trên R2 và avatar Zalo trả về từ CDN của họ.
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      // Supabase REST/Realtime + upload lên chính server.
      `connect-src ${connectSources}`,
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
