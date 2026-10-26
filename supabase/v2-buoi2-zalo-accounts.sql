-- =============================================
-- BUỔI 2: Multi Zalo Accounts
-- ⚠️ CHẠY FILE NÀY SAU v2-hotfix-3-member-mgmt.sql
-- =============================================

-- 1. Thêm cột phone_number cho zalo_accounts
ALTER TABLE zalo_accounts
  ADD COLUMN IF NOT EXISTS phone_number TEXT;

-- 2. Bổ sung key_type 'user_send_images'
ALTER TABLE api_keys DROP CONSTRAINT IF EXISTS api_keys_key_type_check;
ALTER TABLE api_keys ADD CONSTRAINT api_keys_key_type_check
  CHECK (key_type IN (
    'group_send_images',
    'group_send_message',
    'get_group_info',
    'user_send_message',
    'user_send_images',
    'get_user_info'
  ));

-- 3. RPC: Tạo Zalo Account mới (admin/owner/super_admin)
CREATE OR REPLACE FUNCTION public.create_zalo_account(
  p_workspace_id UUID,
  p_name TEXT,
  p_phone_number TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  new_id UUID;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();

  IF NOT public.is_workspace_admin(p_workspace_id, current_user_id) THEN
    RAISE EXCEPTION 'Chỉ Admin/Owner workspace được tạo Zalo Account';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Tên Zalo Account không được trống';
  END IF;

  INSERT INTO zalo_accounts (workspace_id, name, phone_number, description, is_active)
  VALUES (p_workspace_id, trim(p_name), NULLIF(trim(coalesce(p_phone_number, '')), ''), p_description, TRUE)
  RETURNING id INTO new_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_zalo_account(UUID, TEXT, TEXT, TEXT) TO authenticated;

-- 4. RPC: Update Zalo Account
CREATE OR REPLACE FUNCTION public.update_zalo_account(
  p_zalo_account_id UUID,
  p_name TEXT,
  p_phone_number TEXT DEFAULT NULL,
  p_description TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  ws_id UUID;
BEGIN
  SELECT workspace_id INTO ws_id FROM zalo_accounts WHERE id = p_zalo_account_id;
  IF ws_id IS NULL THEN RAISE EXCEPTION 'Zalo Account không tồn tại'; END IF;

  IF NOT public.is_workspace_admin(ws_id, auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Admin/Owner workspace được sửa Zalo Account';
  END IF;

  UPDATE zalo_accounts
  SET name = COALESCE(NULLIF(trim(p_name), ''), name),
      phone_number = NULLIF(trim(coalesce(p_phone_number, '')), ''),
      description = p_description,
      is_active = COALESCE(p_is_active, is_active)
  WHERE id = p_zalo_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_zalo_account(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- 5. RPC: Xóa Zalo Account (chỉ owner/super_admin, có safety check)
CREATE OR REPLACE FUNCTION public.delete_zalo_account(p_zalo_account_id UUID)
RETURNS VOID AS $$
DECLARE
  ws_id UUID;
  project_count INT;
BEGIN
  SELECT workspace_id INTO ws_id FROM zalo_accounts WHERE id = p_zalo_account_id;
  IF ws_id IS NULL THEN RAISE EXCEPTION 'Zalo Account không tồn tại'; END IF;

  IF NOT public.is_super_admin(auth.uid()) AND NOT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = ws_id AND user_id = auth.uid() AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Chỉ Owner hoặc Super Admin được xóa Zalo Account';
  END IF;

  -- Kiểm tra có project nào đang dùng không
  SELECT COUNT(*) INTO project_count FROM projects WHERE zalo_account_id = p_zalo_account_id;
  IF project_count > 0 THEN
    RAISE EXCEPTION 'Có % dự án đang dùng Zalo Account này. Hãy đổi Zalo Account của các dự án trước, hoặc xóa các dự án.', project_count;
  END IF;

  DELETE FROM zalo_accounts WHERE id = p_zalo_account_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.delete_zalo_account(UUID) TO authenticated;

-- 6. RPC: Lấy danh sách Zalo Accounts trong workspace + thống kê API keys đã cấu hình
CREATE OR REPLACE FUNCTION public.get_zalo_accounts_with_stats(p_workspace_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  phone_number TEXT,
  description TEXT,
  is_active BOOLEAN,
  configured_keys INT,
  total_keys INT,
  project_count BIGINT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Không có quyền xem';
  END IF;

  RETURN QUERY
  SELECT
    za.id,
    za.name::TEXT,
    za.phone_number::TEXT,
    za.description::TEXT,
    za.is_active,
    (SELECT COUNT(*)::INT FROM api_keys WHERE zalo_account_id = za.id) AS configured_keys,
    6 AS total_keys,
    (SELECT COUNT(*) FROM projects WHERE zalo_account_id = za.id) AS project_count,
    za.created_at
  FROM zalo_accounts za
  WHERE za.workspace_id = p_workspace_id
  ORDER BY za.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_zalo_accounts_with_stats(UUID) TO authenticated;
