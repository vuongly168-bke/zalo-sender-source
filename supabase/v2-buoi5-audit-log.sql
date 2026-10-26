-- =============================================
-- BUỔI 5: Audit Log
-- ⚠️ CHẠY FILE NÀY SAU v2-buoi4-system-settings.sql
-- =============================================

-- Bảng audit_logs: ghi lại mọi action quan trọng trong workspace
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email TEXT,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id UUID,
  resource_name TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_workspace_time ON audit_logs(workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_time ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Workspace admin xem được log của workspace mình
DROP POLICY IF EXISTS "Admins view workspace audit_logs" ON audit_logs;
CREATE POLICY "Admins view workspace audit_logs" ON audit_logs FOR SELECT
  USING (
    public.is_super_admin(auth.uid())
    OR public.is_workspace_admin(workspace_id, auth.uid())
  );

-- Mọi authenticated user insert được log của workspace mình tham gia
DROP POLICY IF EXISTS "Members can insert audit_logs" ON audit_logs;
CREATE POLICY "Members can insert audit_logs" ON audit_logs FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      workspace_id IS NULL
      OR public.is_workspace_member(workspace_id, auth.uid())
    )
  );

-- RPC: log một action
CREATE OR REPLACE FUNCTION public.log_action(
  p_workspace_id UUID,
  p_action TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id UUID DEFAULT NULL,
  p_resource_name TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID AS $$
DECLARE
  current_user_id UUID;
  current_email TEXT;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN RETURN; END IF;

  SELECT email INTO current_email FROM auth.users WHERE id = current_user_id;

  INSERT INTO audit_logs (workspace_id, user_id, user_email, action, resource_type, resource_id, resource_name, metadata)
  VALUES (p_workspace_id, current_user_id, current_email, p_action, p_resource_type, p_resource_id, p_resource_name, p_metadata);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'log_action error: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.log_action(UUID, TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;

-- RPC: lấy log của workspace (cho admin xem)
CREATE OR REPLACE FUNCTION public.get_workspace_audit_logs(
  p_workspace_id UUID,
  p_limit INT DEFAULT 100
)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  action TEXT,
  resource_type TEXT,
  resource_id UUID,
  resource_name TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) AND NOT public.is_workspace_admin(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Admin/Owner workspace mới xem được audit log';
  END IF;

  RETURN QUERY
  SELECT
    al.id,
    al.user_id,
    al.user_email,
    p.full_name::TEXT AS user_name,
    al.action,
    al.resource_type,
    al.resource_id,
    al.resource_name,
    al.metadata,
    al.created_at
  FROM audit_logs al
  LEFT JOIN profiles p ON p.id = al.user_id
  WHERE al.workspace_id = p_workspace_id
  ORDER BY al.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_workspace_audit_logs(UUID, INT) TO authenticated;

-- RPC: lấy log toàn hệ thống (cho super admin)
CREATE OR REPLACE FUNCTION public.get_all_audit_logs(p_limit INT DEFAULT 200)
RETURNS TABLE (
  id UUID,
  workspace_id UUID,
  workspace_name TEXT,
  user_id UUID,
  user_email TEXT,
  user_name TEXT,
  action TEXT,
  resource_type TEXT,
  resource_id UUID,
  resource_name TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Super Admin mới xem được toàn hệ thống';
  END IF;

  RETURN QUERY
  SELECT
    al.id,
    al.workspace_id,
    w.name::TEXT AS workspace_name,
    al.user_id,
    al.user_email,
    p.full_name::TEXT AS user_name,
    al.action,
    al.resource_type,
    al.resource_id,
    al.resource_name,
    al.metadata,
    al.created_at
  FROM audit_logs al
  LEFT JOIN workspaces w ON w.id = al.workspace_id
  LEFT JOIN profiles p ON p.id = al.user_id
  ORDER BY al.created_at DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_all_audit_logs(INT) TO authenticated;
