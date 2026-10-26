-- =============================================
-- THÊM delay giữa mỗi tin trong batch (chống spam Zalo)
-- ⚠️ CHẠY FILE NÀY SAU v2-multi-images.sql
-- =============================================

ALTER TABLE personal_campaigns
  ADD COLUMN IF NOT EXISTS message_delay_seconds INT DEFAULT 3
    CHECK (message_delay_seconds >= 1 AND message_delay_seconds <= 30);

COMMENT ON COLUMN personal_campaigns.message_delay_seconds IS
  'Delay giữa mỗi tin nhắn trong cùng 1 batch (giây). Mặc định 3s. Tăng nếu bị Zalo block (error 216).';
