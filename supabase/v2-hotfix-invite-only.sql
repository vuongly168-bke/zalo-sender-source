-- =============================================
-- HOTFIX: Chuyển sang Invite-Only Model
-- ⚠️ CHẠY FILE NÀY SAU schema-v2.sql
-- =============================================

-- 1. Cập nhật RPC create_workspace_with_owner: chỉ super admin được tạo
DROP FUNCTION IF EXISTS public.create_workspace_with_owner(TEXT, TEXT) CASCADE;

CREATE OR REPLACE FUNCTION public.create_workspace_with_owner(
  workspace_name TEXT,
  workspace_desc TEXT DEFAULT NULL,
  owner_email TEXT DEFAULT NULL  -- email của owner; nếu null = chính super admin làm owner
)
RETURNS UUID AS $$
DECLARE
  new_workspace_id UUID;
  current_user_id UUID;
  target_owner_id UUID;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập';
  END IF;

  -- Chỉ super admin mới được tạo workspace
  IF NOT public.is_super_admin(current_user_id) THEN
    RAISE EXCEPTION 'Chỉ Super Admin mới có quyền tạo workspace';
  END IF;

  IF workspace_name IS NULL OR length(trim(workspace_name)) = 0 THEN
    RAISE EXCEPTION 'Tên workspace không được để trống';
  END IF;

  -- Xác định owner
  IF owner_email IS NULL THEN
    target_owner_id := current_user_id;
  ELSE
    SELECT id INTO target_owner_id FROM auth.users WHERE email = lower(trim(owner_email));
    IF target_owner_id IS NULL THEN
      RAISE EXCEPTION 'Không tìm thấy user với email %. User cần đăng nhập Google ít nhất 1 lần trước.', owner_email;
    END IF;
  END IF;

  INSERT INTO workspaces (name, description, created_by)
  VALUES (trim(workspace_name), workspace_desc, current_user_id)
  RETURNING id INTO new_workspace_id;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, target_owner_id, 'owner');

  RETURN new_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_workspace_with_owner(TEXT, TEXT, TEXT) TO authenticated;

-- 2. RPC để Super Admin xem all pending users (đã đăng ký nhưng chưa có workspace)
CREATE OR REPLACE FUNCTION public.get_pending_users()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Super Admin mới được xem';
  END IF;

  RETURN QUERY
  SELECT p.id, p.email, p.full_name, p.avatar_url, p.created_at
  FROM profiles p
  WHERE NOT EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.user_id = p.id)
    AND p.is_super_admin = FALSE
    AND p.is_banned = FALSE
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_pending_users() TO authenticated;

-- 3. RPC để Super Admin xem tất cả workspaces
CREATE OR REPLACE FUNCTION public.get_all_workspaces_admin()
RETURNS TABLE (
  id UUID,
  name TEXT,
  description TEXT,
  created_at TIMESTAMPTZ,
  member_count BIGINT,
  owner_email TEXT
) AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Super Admin mới được xem';
  END IF;

  RETURN QUERY
  SELECT
    w.id,
    w.name,
    w.description,
    w.created_at,
    (SELECT COUNT(*) FROM workspace_members wm WHERE wm.workspace_id = w.id) AS member_count,
    (SELECT p.email FROM workspace_members wm JOIN profiles p ON p.id = wm.user_id
     WHERE wm.workspace_id = w.id AND wm.role = 'owner' LIMIT 1) AS owner_email
  FROM workspaces w
  ORDER BY w.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_all_workspaces_admin() TO authenticated;

-- 4. RPC để Super Admin ban/unban user
CREATE OR REPLACE FUNCTION public.set_user_banned(target_user_id UUID, banned BOOLEAN)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Super Admin mới được ban user';
  END IF;

  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Không thể ban chính mình';
  END IF;

  UPDATE profiles SET is_banned = banned WHERE id = target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.set_user_banned(UUID, BOOLEAN) TO authenticated;

-- 5. RPC: Super admin gán user vào workspace có sẵn
CREATE OR REPLACE FUNCTION public.assign_user_to_workspace(
  target_user_id UUID,
  target_workspace_id UUID,
  target_role TEXT DEFAULT 'member'
)
RETURNS VOID AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Super Admin mới được gán user';
  END IF;

  IF target_role NOT IN ('owner', 'admin', 'member') THEN
    RAISE EXCEPTION 'Role không hợp lệ';
  END IF;

  IF EXISTS (SELECT 1 FROM workspace_members WHERE user_id = target_user_id AND workspace_id = target_workspace_id) THEN
    -- Đã là member rồi, update role
    UPDATE workspace_members SET role = target_role
    WHERE user_id = target_user_id AND workspace_id = target_workspace_id;
  ELSE
    INSERT INTO workspace_members (workspace_id, user_id, role)
    VALUES (target_workspace_id, target_user_id, target_role);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.assign_user_to_workspace(UUID, UUID, TEXT) TO authenticated;
