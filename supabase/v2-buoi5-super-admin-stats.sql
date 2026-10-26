-- =============================================
-- BUỔI 5: Super Admin Stats Overview
-- ⚠️ CHẠY FILE NÀY SAU v2-buoi5-audit-log.sql
-- =============================================

-- RPC: tổng quan hệ thống cho super admin
CREATE OR REPLACE FUNCTION public.get_system_overview()
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Super Admin mới được xem';
  END IF;

  SELECT json_build_object(
    'total_workspaces', (SELECT COUNT(*) FROM workspaces),
    'total_users', (SELECT COUNT(*) FROM profiles WHERE is_super_admin = FALSE AND is_banned = FALSE),
    'total_banned_users', (SELECT COUNT(*) FROM profiles WHERE is_banned = TRUE),
    'total_zalo_accounts', (SELECT COUNT(*) FROM zalo_accounts),
    'total_projects', (SELECT COUNT(*) FROM projects),
    'total_groups', (SELECT COUNT(*) FROM zalo_groups),
    'total_contacts', (SELECT COUNT(*) FROM contacts),

    'group_campaigns', json_build_object(
      'total', (SELECT COUNT(*) FROM campaigns),
      'scheduled', (SELECT COUNT(*) FROM campaigns WHERE status = 'scheduled'),
      'sent', (SELECT COUNT(*) FROM campaigns WHERE status = 'sent'),
      'partial', (SELECT COUNT(*) FROM campaigns WHERE status = 'partial'),
      'failed', (SELECT COUNT(*) FROM campaigns WHERE status = 'failed'),
      'draft', (SELECT COUNT(*) FROM campaigns WHERE status = 'draft')
    ),

    'personal_campaigns', json_build_object(
      'total', (SELECT COUNT(*) FROM personal_campaigns),
      'scheduled', (SELECT COUNT(*) FROM personal_campaigns WHERE status = 'scheduled'),
      'sending', (SELECT COUNT(*) FROM personal_campaigns WHERE status = 'sending'),
      'sent', (SELECT COUNT(*) FROM personal_campaigns WHERE status = 'sent'),
      'partial', (SELECT COUNT(*) FROM personal_campaigns WHERE status = 'partial'),
      'failed', (SELECT COUNT(*) FROM personal_campaigns WHERE status = 'failed'),
      'paused', (SELECT COUNT(*) FROM personal_campaigns WHERE status = 'paused'),
      'draft', (SELECT COUNT(*) FROM personal_campaigns WHERE status = 'draft')
    ),

    'messages_sent', json_build_object(
      'to_groups', (SELECT COUNT(*) FROM campaign_groups WHERE status = 'sent'),
      'to_users', (SELECT COUNT(*) FROM personal_campaign_recipients WHERE status = 'sent'),
      'failed_groups', (SELECT COUNT(*) FROM campaign_groups WHERE status = 'failed'),
      'failed_users', (SELECT COUNT(*) FROM personal_campaign_recipients WHERE status = 'failed')
    ),

    'activity_30d', (
      SELECT json_build_object(
        'new_workspaces', (SELECT COUNT(*) FROM workspaces WHERE created_at > NOW() - INTERVAL '30 days'),
        'new_users', (SELECT COUNT(*) FROM profiles WHERE created_at > NOW() - INTERVAL '30 days'),
        'campaigns_sent', (SELECT COUNT(*) FROM campaigns WHERE updated_at > NOW() - INTERVAL '30 days' AND status IN ('sent', 'partial')),
        'personal_campaigns_sent', (SELECT COUNT(*) FROM personal_campaigns WHERE updated_at > NOW() - INTERVAL '30 days' AND status IN ('sent', 'partial'))
      )
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_system_overview() TO authenticated;

-- RPC: top workspaces by activity
CREATE OR REPLACE FUNCTION public.get_top_workspaces_by_activity(p_limit INT DEFAULT 10)
RETURNS TABLE (
  workspace_id UUID,
  workspace_name TEXT,
  member_count BIGINT,
  zalo_account_count BIGINT,
  project_count BIGINT,
  contact_count BIGINT,
  total_messages_sent BIGINT,
  last_activity TIMESTAMPTZ
) AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Super Admin mới được xem';
  END IF;

  RETURN QUERY
  SELECT
    w.id,
    w.name::TEXT,
    (SELECT COUNT(*) FROM workspace_members WHERE workspace_id = w.id),
    (SELECT COUNT(*) FROM zalo_accounts WHERE workspace_id = w.id),
    (SELECT COUNT(*) FROM projects WHERE workspace_id = w.id),
    (SELECT COUNT(*) FROM contacts WHERE workspace_id = w.id),
    (
      COALESCE(
        (SELECT COUNT(*)::BIGINT FROM campaign_groups cg
          JOIN campaigns c ON c.id = cg.campaign_id
          JOIN projects p ON p.id = c.project_id
          WHERE p.workspace_id = w.id AND cg.status = 'sent'), 0
      )
      +
      COALESCE(
        (SELECT COUNT(*)::BIGINT FROM personal_campaign_recipients pcr
          JOIN personal_campaigns pc ON pc.id = pcr.campaign_id
          WHERE pc.workspace_id = w.id AND pcr.status = 'sent'), 0
      )
    ),
    GREATEST(
      w.updated_at,
      COALESCE((SELECT MAX(updated_at) FROM campaigns c JOIN projects p ON p.id = c.project_id WHERE p.workspace_id = w.id), w.created_at),
      COALESCE((SELECT MAX(updated_at) FROM personal_campaigns WHERE workspace_id = w.id), w.created_at)
    )
  FROM workspaces w
  ORDER BY last_activity DESC NULLS LAST
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_top_workspaces_by_activity(INT) TO authenticated;
