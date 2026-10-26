-- =============================================
-- BUỔI 2 FIX: Thêm cột account_token cho user_* APIs
-- ⚠️ CHẠY FILE NÀY SAU v2-buoi2-zalo-accounts.sql
-- =============================================

-- Một số API user của func.vn cần thêm header "Account-Token" ngoài Bearer token
-- VD: get_user_info, user_send_message, user_send_images
ALTER TABLE api_keys
  ADD COLUMN IF NOT EXISTS account_token TEXT;

COMMENT ON COLUMN api_keys.account_token IS
  'Header Account-Token (chỉ áp dụng cho user_* APIs theo func.vn)';
