-- =============================================
-- FIX V2: Tạo RPC function để đăng ký workspace
-- Chạy file này trong Supabase SQL Editor
-- =============================================

-- Đảm bảo policy INSERT của workspaces cho phép user đã đăng nhập
DROP POLICY IF EXISTS "Anyone can create workspace" ON workspaces;
CREATE POLICY "Authenticated users can create workspace" ON workspaces FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);

-- RPC function: tạo workspace + thêm user làm owner trong 1 transaction
-- SECURITY DEFINER bypass RLS, an toàn vì check auth.uid() bên trong
CREATE OR REPLACE FUNCTION public.create_workspace_with_owner(workspace_name TEXT)
RETURNS UUID AS $$
DECLARE
  new_workspace_id UUID;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();

  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Bạn cần đăng nhập';
  END IF;

  IF workspace_name IS NULL OR length(trim(workspace_name)) = 0 THEN
    RAISE EXCEPTION 'Tên workspace không được để trống';
  END IF;

  INSERT INTO workspaces (name)
  VALUES (workspace_name)
  RETURNING id INTO new_workspace_id;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, current_user_id, 'owner');

  RETURN new_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cho phép user đã đăng nhập gọi function
GRANT EXECUTE ON FUNCTION public.create_workspace_with_owner(TEXT) TO authenticated;
