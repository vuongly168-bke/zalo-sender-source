-- =============================================
-- BUỔI 3 PREP: Help URL cho workspace + chuẩn bị Contacts module
-- ⚠️ CHẠY FILE NÀY SAU v2-buoi2-fix-account-token.sql
-- =============================================

-- 1. Thêm cột help_url cho workspace (link Notion/Google Docs hướng dẫn)
ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS help_url TEXT;

COMMENT ON COLUMN workspaces.help_url IS
  'Link tài liệu hướng dẫn (Notion, Google Docs...) cho member của workspace';

-- 2. Update RPC update_workspace_info để hỗ trợ help_url
DROP FUNCTION IF EXISTS public.update_workspace_info(UUID, TEXT, TEXT) CASCADE;

CREATE OR REPLACE FUNCTION public.update_workspace_info(
  p_workspace_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL,
  p_help_url TEXT DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();

  IF NOT public.is_super_admin(current_user_id) AND NOT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = current_user_id
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Chỉ Owner hoặc Super Admin được sửa workspace';
  END IF;

  IF p_name IS NULL OR length(trim(p_name)) = 0 THEN
    RAISE EXCEPTION 'Tên workspace không được trống';
  END IF;

  UPDATE workspaces
  SET name = trim(p_name),
      description = p_description,
      help_url = NULLIF(trim(coalesce(p_help_url, '')), '')
  WHERE id = p_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_workspace_info(UUID, TEXT, TEXT, TEXT) TO authenticated;
