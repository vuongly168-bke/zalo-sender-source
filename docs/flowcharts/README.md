# Lưu đồ hệ thống Zalo Sender

Bộ sơ đồ minh họa hoạt động của hệ thống `your-domain.example` — dùng để chia sẻ cho team.

## 📁 Danh sách file

| File | Đối tượng | Mục đích |
|------|-----------|----------|
| `01-user-flow.png/pdf` | 👤 **Người dùng cuối** | Quy trình thao tác: đăng ký → tạo dự án → gửi tin |
| `02-coder-architecture.png/pdf` | 💻 **Coder** | Kiến trúc tổng thể: Vercel + Supabase + Cloudinary + func.vn |
| `03-coder-cron-flow.png/pdf` | 💻 **Coder** | Luồng cron tự động gửi tin (sequence diagram chi tiết) |

## 🎯 Cách dùng

### Cho người dùng (chia sẻ cho team)
- Gửi file `01-user-flow.png` qua Zalo / email
- Hoặc in file `01-user-flow.pdf` để training nội bộ

### Cho coder (kaizen)
- Đọc `02-coder-architecture.png` để hiểu tổng thể
- Đọc `03-coder-cron-flow.png` để hiểu chi tiết flow gửi tự động
- File source `.mmd` (Mermaid) có thể chỉnh sửa và render lại

## 🔧 Render lại file

Nếu cần sửa nội dung lưu đồ:

1. Sửa file `.mmd` tương ứng
2. Render lại bằng lệnh:

```bash
cd docs/flowcharts

# Render PNG
npx -y -p @mermaid-js/mermaid-cli mmdc \
  -i 01-user-flow.mmd \
  -o 01-user-flow.png \
  -t default -b white \
  -w 1600 -H 2200 --scale 2 \
  -p puppeteer-config.json

# Render PDF
npx -y -p @mermaid-js/mermaid-cli mmdc \
  -i 01-user-flow.mmd \
  -o 01-user-flow.pdf \
  -t default -b white \
  -p puppeteer-config.json
```

## 📚 Tài liệu Mermaid

- Cú pháp flowchart: https://mermaid.js.org/syntax/flowchart.html
- Cú pháp sequence diagram: https://mermaid.js.org/syntax/sequenceDiagram.html
- Test online (xem preview trước khi render): https://mermaid.live
