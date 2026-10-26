-- =============================================
-- BUỔI 4 BONUS: System Settings (global config)
-- ⚠️ CHẠY FILE NÀY SAU v2-buoi3-prep.sql
-- =============================================

-- Bảng system_settings: key-value cho cài đặt toàn hệ thống
CREATE TABLE IF NOT EXISTS system_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES auth.users(id)
);

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

-- Mọi authenticated user đều đọc được (sidebar cần)
DROP POLICY IF EXISTS "Authenticated can read system_settings" ON system_settings;
CREATE POLICY "Authenticated can read system_settings" ON system_settings FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Chỉ super admin được update
DROP POLICY IF EXISTS "Super admin can update system_settings" ON system_settings;
CREATE POLICY "Super admin can update system_settings" ON system_settings FOR ALL
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- Insert default
INSERT INTO system_settings (key, value, description)
VALUES
  ('global_help_url', 'https://example.com/huong-dan', 'Link tài liệu hướng dẫn sử dụng (mặc định toàn hệ thống)')
ON CONFLICT (key) DO NOTHING;

-- RPC: set system setting (super admin only)
CREATE OR REPLACE FUNCTION public.set_system_setting(p_key TEXT, p_value TEXT)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Super Admin được sửa cài đặt hệ thống';
  END IF;

  INSERT INTO system_settings (key, value, updated_at, updated_by)
  VALUES (p_key, p_value, NOW(), auth.uid())
  ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = NOW(),
    updated_by = auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.set_system_setting(TEXT, TEXT) TO authenticated;
