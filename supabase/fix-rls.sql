-- =============================================
-- FIX: Infinite recursion in workspace_members RLS
-- Chạy file này trong Supabase SQL Editor
-- =============================================

-- Xóa các policy cũ bị lỗi đệ quy
DROP POLICY IF EXISTS "Members can view members" ON workspace_members;
DROP POLICY IF EXISTS "Anyone can insert member" ON workspace_members;
DROP POLICY IF EXISTS "Admins can delete members" ON workspace_members;
DROP POLICY IF EXISTS "Members can view workspace" ON workspaces;
DROP POLICY IF EXISTS "Admins can update workspace" ON workspaces;

-- Tạo SECURITY DEFINER function để bypass RLS khi check membership
CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id UUID, _user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(_workspace_id UUID, _user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = _user_id
      AND role IN ('owner', 'admin')
  );
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_workspaces(_user_id UUID)
RETURNS SETOF UUID AS $$
  SELECT workspace_id FROM workspace_members WHERE user_id = _user_id;
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Workspace Members: dùng function để tránh đệ quy
DROP POLICY IF EXISTS "Members can view own membership rows" ON workspace_members;
CREATE POLICY "Members can view own membership rows" ON workspace_members FOR SELECT
  USING (user_id = auth.uid() OR public.is_workspace_member(workspace_id, auth.uid()));

DROP POLICY IF EXISTS "Anyone can insert member" ON workspace_members;
REVOKE INSERT ON TABLE workspace_members FROM authenticated, anon;

DROP POLICY IF EXISTS "Admins can delete members" ON workspace_members;
CREATE POLICY "Admins can delete members" ON workspace_members FOR DELETE
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

-- Workspaces: dùng function
DROP POLICY IF EXISTS "Members can view workspace" ON workspaces;
CREATE POLICY "Members can view workspace" ON workspaces FOR SELECT
  USING (public.is_workspace_member(id, auth.uid()));

DROP POLICY IF EXISTS "Admins can update workspace" ON workspaces;
CREATE POLICY "Admins can update workspace" ON workspaces FOR UPDATE
  USING (public.is_workspace_admin(id, auth.uid()));

-- Cập nhật các policy khác dùng function thay vì subquery
DROP POLICY IF EXISTS "Members can view api_keys" ON api_keys;
DROP POLICY IF EXISTS "Admins can manage api_keys" ON api_keys;
DROP POLICY IF EXISTS "Admins can insert api_keys" ON api_keys;
DROP POLICY IF EXISTS "Admins can update api_keys" ON api_keys;
DROP POLICY IF EXISTS "Admins can delete api_keys" ON api_keys;

REVOKE ALL ON TABLE api_keys FROM authenticated, anon;

DROP POLICY IF EXISTS "Members can view projects" ON projects;
DROP POLICY IF EXISTS "Members can create projects" ON projects;
DROP POLICY IF EXISTS "Members can update projects" ON projects;
DROP POLICY IF EXISTS "Admins can delete projects" ON projects;

CREATE POLICY "Members can view projects" ON projects FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members can create projects" ON projects FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members can update projects" ON projects FOR UPDATE
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Admins can delete projects" ON projects FOR DELETE
  USING (public.is_workspace_admin(workspace_id, auth.uid()));
