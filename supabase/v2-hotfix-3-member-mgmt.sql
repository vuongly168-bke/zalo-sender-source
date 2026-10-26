-- =============================================
-- HOTFIX 3: Quản lý thành viên workspace
-- ⚠️ CHẠY FILE NÀY SAU v2-hotfix-2-pending-users.sql
-- =============================================

-- 1. RPC: Lấy danh sách members của 1 workspace (owner/admin/super_admin xem được)
CREATE OR REPLACE FUNCTION public.get_workspace_members(p_workspace_id UUID)
RETURNS TABLE (
  member_id UUID,
  user_id UUID,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  role TEXT,
  joined_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Không có quyền xem';
  END IF;

  RETURN QUERY
  SELECT
    wm.id AS member_id,
    wm.user_id,
    p.email::TEXT,
    COALESCE(p.full_name, p.email)::TEXT AS full_name,
    p.avatar_url::TEXT,
    wm.role::TEXT,
    wm.created_at AS joined_at
  FROM workspace_members wm
  JOIN profiles p ON p.id = wm.user_id
  WHERE wm.workspace_id = p_workspace_id
  ORDER BY
    CASE wm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
    wm.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_workspace_members(UUID) TO authenticated;

-- 2. RPC: Đổi role của 1 member (owner/super_admin)
CREATE OR REPLACE FUNCTION public.change_member_role(
  p_workspace_id UUID,
  p_target_user_id UUID,
  p_new_role TEXT
)
RETURNS VOID AS $$
DECLARE
  current_user_id UUID;
  is_super BOOLEAN;
  target_role TEXT;
BEGIN
  current_user_id := auth.uid();
  is_super := public.is_super_admin(current_user_id);

  -- Chỉ owner hoặc super admin được đổi role
  IF NOT is_super AND NOT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id = current_user_id
      AND role = 'owner'
  ) THEN
    RAISE EXCEPTION 'Chỉ Owner hoặc Super Admin được đổi role';
  END IF;

  IF p_new_role NOT IN ('owner', 'admin', 'member') THEN
    RAISE EXCEPTION 'Role không hợp lệ';
  END IF;

  -- Lấy role hiện tại của target
  SELECT role INTO target_role FROM workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id;

  IF target_role IS NULL THEN
    RAISE EXCEPTION 'User không phải thành viên workspace này';
  END IF;

  -- Không được đổi role của owner cuối cùng thành non-owner
  IF target_role = 'owner' AND p_new_role != 'owner' THEN
    IF (SELECT COUNT(*) FROM workspace_members
        WHERE workspace_id = p_workspace_id AND role = 'owner') <= 1 THEN
      RAISE EXCEPTION 'Workspace cần ít nhất 1 Owner. Hãy promote người khác làm Owner trước.';
    END IF;
  END IF;

  UPDATE workspace_members
  SET role = p_new_role
  WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.change_member_role(UUID, UUID, TEXT) TO authenticated;

-- 3. RPC: Kick member (owner/admin/super_admin)
CREATE OR REPLACE FUNCTION public.remove_workspace_member(
  p_workspace_id UUID,
  p_target_user_id UUID
)
RETURNS VOID AS $$
DECLARE
  current_user_id UUID;
  is_super BOOLEAN;
  target_role TEXT;
  current_role TEXT;
BEGIN
  current_user_id := auth.uid();
  is_super := public.is_super_admin(current_user_id);

  IF current_user_id = p_target_user_id THEN
    RAISE EXCEPTION 'Không thể tự kick bản thân. Hãy nhờ owner khác.';
  END IF;

  -- Kiểm tra quyền: owner / admin / super_admin
  IF NOT is_super THEN
    SELECT role INTO current_role FROM workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = current_user_id;
    IF current_role NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'Chỉ Owner hoặc Admin được kick member';
    END IF;
  END IF;

  -- Không được kick owner
  SELECT role INTO target_role FROM workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id;

  IF target_role = 'owner' THEN
    IF (SELECT COUNT(*) FROM workspace_members
        WHERE workspace_id = p_workspace_id AND role = 'owner') <= 1 THEN
      RAISE EXCEPTION 'Không thể kick Owner cuối cùng. Hãy chuyển quyền Owner cho người khác trước.';
    END IF;
    -- Chỉ owner khác hoặc super_admin được kick owner
    IF NOT is_super AND current_role != 'owner' THEN
      RAISE EXCEPTION 'Chỉ Owner khác hoặc Super Admin được kick một Owner';
    END IF;
  END IF;

  DELETE FROM workspace_members
  WHERE workspace_id = p_workspace_id AND user_id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.remove_workspace_member(UUID, UUID) TO authenticated;

-- 4. RPC: Update workspace (đổi tên, mô tả - owner/super_admin)
CREATE OR REPLACE FUNCTION public.update_workspace_info(
  p_workspace_id UUID,
  p_name TEXT,
  p_description TEXT DEFAULT NULL
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
      description = p_description
  WHERE id = p_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.update_workspace_info(UUID, TEXT, TEXT) TO authenticated;

-- 5. RPC: Xóa workspace (owner/super_admin)
CREATE OR REPLACE FUNCTION public.delete_workspace(p_workspace_id UUID)
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
    RAISE EXCEPTION 'Chỉ Owner hoặc Super Admin được xóa workspace';
  END IF;

  DELETE FROM workspaces WHERE id = p_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.delete_workspace(UUID) TO authenticated;
