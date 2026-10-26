-- ================================================================
-- HOTFIX: Xóa workspace khi audit trigger đang bật
-- Chạy file này trên Supabase SQL Editor sau
-- v2-super-admin-operations.sql.
-- ================================================================
--
-- Nguyên nhân lỗi cũ:
-- DELETE workspace kích hoạt ON DELETE CASCADE cho workspace_members,
-- projects và zalo_accounts. Các AFTER DELETE audit trigger của các bảng
-- đó cố INSERT audit_logs với workspace_id đã bị xóa, nên PostgreSQL báo
-- lỗi audit_logs_workspace_id_fkey và rollback toàn bộ thao tác.
--
-- Cách sửa: xóa các bảng có audit trigger khi workspace cha còn tồn tại,
-- sau đó xóa audit logs của chính workspace rồi mới xóa workspace cha.

CREATE OR REPLACE FUNCTION public.delete_workspace(p_workspace_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  current_user_id UUID := auth.uid();
BEGIN
  IF NOT public.is_super_admin(current_user_id) AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_members wm
    WHERE wm.workspace_id = p_workspace_id
      AND wm.user_id = current_user_id
      AND wm.role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Chỉ Owner hoặc Super Admin được xóa workspace';
  END IF;

  -- Các bảng con sâu hơn (campaigns, recipients, api_keys...) sẽ tự xóa
  -- theo FK cascade trong lúc workspace vẫn còn tồn tại.
  DELETE FROM public.personal_campaigns WHERE workspace_id = p_workspace_id;
  DELETE FROM public.projects WHERE workspace_id = p_workspace_id;
  DELETE FROM public.zalo_accounts WHERE workspace_id = p_workspace_id;
  DELETE FROM public.contacts WHERE workspace_id = p_workspace_id;
  DELETE FROM public.workspace_members WHERE workspace_id = p_workspace_id;

  -- Audit logs không còn ý nghĩa sau khi workspace đã bị xóa và phải được
  -- xóa trước workspace để trigger không ghi một bản ghi mồ côi.
  DELETE FROM public.audit_logs WHERE workspace_id = p_workspace_id;
  DELETE FROM public.workspaces WHERE id = p_workspace_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.delete_workspace(UUID) TO authenticated;
