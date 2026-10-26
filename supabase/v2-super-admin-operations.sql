-- ================================================================
-- Super Admin Operations: audit tự động, đa-workspace và dọn workspace cũ
-- Chạy sau các migration v2-buoi5-*.
-- ================================================================

-- 1) Audit tự động bằng trigger. Không phụ thuộc từng màn hình frontend gọi logAction.
CREATE OR REPLACE FUNCTION public.audit_entity_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_workspace_id UUID;
  v_user_id UUID := auth.uid();
  v_user_email TEXT;
  v_action TEXT;
  v_resource_type TEXT;
  v_resource_id UUID;
  v_resource_name TEXT;
  v_metadata JSONB := '{}'::jsonb;
BEGIN
  CASE TG_TABLE_NAME
    WHEN 'workspace_members' THEN
      v_resource_type := 'workspace_member';
      IF TG_OP = 'INSERT' THEN
        v_workspace_id := NEW.workspace_id;
        v_resource_id := NEW.user_id;
        v_action := 'member_added';
        v_metadata := jsonb_build_object('role', NEW.role);
      ELSIF TG_OP = 'DELETE' THEN
        v_workspace_id := OLD.workspace_id;
        v_resource_id := OLD.user_id;
        v_action := 'member_removed';
        v_metadata := jsonb_build_object('role', OLD.role);
      ELSIF NEW.role IS DISTINCT FROM OLD.role THEN
        v_workspace_id := NEW.workspace_id;
        v_resource_id := NEW.user_id;
        v_action := 'role_changed';
        v_metadata := jsonb_build_object('from_role', OLD.role, 'to_role', NEW.role);
      ELSE
        RETURN NEW;
      END IF;
      SELECT p.email INTO v_resource_name FROM public.profiles p WHERE p.id = v_resource_id;

    WHEN 'zalo_accounts' THEN
      v_resource_type := 'zalo_account';
      IF TG_OP = 'DELETE' THEN
        v_workspace_id := OLD.workspace_id;
        v_resource_id := OLD.id;
        v_resource_name := OLD.name;
        v_action := 'zalo_account_deleted';
      ELSE
        v_workspace_id := NEW.workspace_id;
        v_resource_id := NEW.id;
        v_resource_name := NEW.name;
        v_action := CASE WHEN TG_OP = 'INSERT' THEN 'zalo_account_created' ELSE 'zalo_account_updated' END;
      END IF;

    WHEN 'projects' THEN
      v_resource_type := 'project';
      IF TG_OP = 'UPDATE' THEN RETURN NEW; END IF;
      IF TG_OP = 'DELETE' THEN
        v_workspace_id := OLD.workspace_id;
        v_resource_id := OLD.id;
        v_resource_name := OLD.name;
        v_action := 'project_deleted';
      ELSE
        v_workspace_id := NEW.workspace_id;
        v_resource_id := NEW.id;
        v_resource_name := NEW.name;
        v_action := 'project_created';
      END IF;

    WHEN 'campaigns' THEN
      SELECT p.workspace_id INTO v_workspace_id
      FROM public.projects p
      WHERE p.id = COALESCE(NEW.project_id, OLD.project_id);
      v_resource_type := 'campaign';
      v_resource_id := COALESCE(NEW.id, OLD.id);
      v_resource_name := COALESCE(NEW.name, OLD.name);
      IF TG_OP = 'INSERT' THEN
        v_action := CASE WHEN COALESCE(NEW.is_recurring, FALSE) THEN 'campaign_recurring_created' ELSE 'campaign_created' END;
      ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
            AND NEW.status IN ('sent', 'partial', 'failed') THEN
        v_action := 'campaign_sent';
        v_metadata := jsonb_build_object('from_status', OLD.status, 'to_status', NEW.status);
      ELSE
        RETURN NEW;
      END IF;

    WHEN 'personal_campaigns' THEN
      v_workspace_id := COALESCE(NEW.workspace_id, OLD.workspace_id);
      v_resource_type := 'personal_campaign';
      v_resource_id := COALESCE(NEW.id, OLD.id);
      v_resource_name := COALESCE(NEW.name, OLD.name);
      IF TG_OP = 'INSERT' THEN
        v_action := 'personal_campaign_created';
      ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status
            AND NEW.status IN ('sent', 'partial', 'failed') THEN
        v_action := 'personal_campaign_sent';
        v_metadata := jsonb_build_object('from_status', OLD.status, 'to_status', NEW.status);
      ELSE
        RETURN NEW;
      END IF;

    WHEN 'contacts' THEN
      v_workspace_id := COALESCE(NEW.workspace_id, OLD.workspace_id);
      v_resource_type := 'contact';
      v_resource_id := COALESCE(NEW.id, OLD.id);
      v_resource_name := COALESCE(NEW.name, OLD.name, NEW.phone, OLD.phone);
      IF TG_OP <> 'INSERT' THEN RETURN COALESCE(NEW, OLD); END IF;
      v_action := 'contact_created';

    ELSE
      RETURN COALESCE(NEW, OLD);
  END CASE;

  IF v_user_id IS NOT NULL THEN
    SELECT p.email INTO v_user_email FROM public.profiles p WHERE p.id = v_user_id;
  END IF;

  INSERT INTO public.audit_logs (
    workspace_id, user_id, user_email, action, resource_type, resource_id, resource_name, metadata
  ) VALUES (
    v_workspace_id, v_user_id, COALESCE(v_user_email, 'System / Cron'), v_action,
    v_resource_type, v_resource_id, v_resource_name, v_metadata
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_workspace_members_change ON public.workspace_members;
CREATE TRIGGER audit_workspace_members_change
AFTER INSERT OR UPDATE OR DELETE ON public.workspace_members
FOR EACH ROW EXECUTE FUNCTION public.audit_entity_change();

DROP TRIGGER IF EXISTS audit_zalo_accounts_change ON public.zalo_accounts;
CREATE TRIGGER audit_zalo_accounts_change
AFTER INSERT OR UPDATE OR DELETE ON public.zalo_accounts
FOR EACH ROW EXECUTE FUNCTION public.audit_entity_change();

DROP TRIGGER IF EXISTS audit_projects_change ON public.projects;
CREATE TRIGGER audit_projects_change
AFTER INSERT OR UPDATE OR DELETE ON public.projects
FOR EACH ROW EXECUTE FUNCTION public.audit_entity_change();

DROP TRIGGER IF EXISTS audit_campaigns_change ON public.campaigns;
CREATE TRIGGER audit_campaigns_change
AFTER INSERT OR UPDATE ON public.campaigns
FOR EACH ROW EXECUTE FUNCTION public.audit_entity_change();

DROP TRIGGER IF EXISTS audit_personal_campaigns_change ON public.personal_campaigns;
CREATE TRIGGER audit_personal_campaigns_change
AFTER INSERT OR UPDATE ON public.personal_campaigns
FOR EACH ROW EXECUTE FUNCTION public.audit_entity_change();

DROP TRIGGER IF EXISTS audit_contacts_change ON public.contacts;
CREATE TRIGGER audit_contacts_change
AFTER INSERT ON public.contacts
FOR EACH ROW EXECUTE FUNCTION public.audit_entity_change();

-- Helper logAction cũ gọi RPC trực tiếp; trả lỗi rõ ràng thay vì nuốt lỗi.
CREATE OR REPLACE FUNCTION public.log_action(
  p_workspace_id UUID,
  p_action TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id UUID DEFAULT NULL,
  p_resource_name TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT;
BEGIN
  IF v_user_id IS NULL THEN RETURN; END IF;
  SELECT email INTO v_email FROM public.profiles WHERE id = v_user_id;
  INSERT INTO public.audit_logs (
    workspace_id, user_id, user_email, action, resource_type, resource_id, resource_name, metadata
  ) VALUES (
    p_workspace_id, v_user_id, v_email, p_action, p_resource_type, p_resource_id,
    p_resource_name, COALESCE(p_metadata, '{}'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.log_action(UUID, TEXT, TEXT, UUID, TEXT, JSONB) TO authenticated;

-- 2) Sửa RPC overview bị lỗi "column reference ... is ambiguous" và thống nhất định nghĩa activity.
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
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Super Admin mới được xem';
  END IF;

  RETURN QUERY
  SELECT * FROM (
  SELECT
    w.id AS workspace_id,
    w.name::TEXT AS workspace_name,
    (SELECT COUNT(*) FROM public.workspace_members wm WHERE wm.workspace_id = w.id) AS member_count,
    (SELECT COUNT(*) FROM public.zalo_accounts za WHERE za.workspace_id = w.id) AS zalo_account_count,
    (SELECT COUNT(*) FROM public.projects pr WHERE pr.workspace_id = w.id) AS project_count,
    (SELECT COUNT(*) FROM public.contacts ct WHERE ct.workspace_id = w.id) AS contact_count,
    COALESCE((SELECT COUNT(*)::BIGINT
      FROM public.campaign_groups cg
      JOIN public.campaigns ca ON ca.id = cg.campaign_id
      JOIN public.projects pr ON pr.id = ca.project_id
      WHERE pr.workspace_id = w.id AND cg.status = 'sent'), 0)
    + COALESCE((SELECT COUNT(*)::BIGINT
      FROM public.personal_campaign_recipients pcr
      JOIN public.personal_campaigns pc ON pc.id = pcr.campaign_id
      WHERE pc.workspace_id = w.id AND pcr.status = 'sent'), 0) AS total_messages_sent,
    GREATEST(
      w.updated_at,
      COALESCE((SELECT MAX(pr.updated_at) FROM public.projects pr WHERE pr.workspace_id = w.id), w.created_at),
      COALESCE((SELECT MAX(ca.updated_at) FROM public.campaigns ca JOIN public.projects pr ON pr.id = ca.project_id WHERE pr.workspace_id = w.id), w.created_at),
      COALESCE((SELECT MAX(pc.updated_at) FROM public.personal_campaigns pc WHERE pc.workspace_id = w.id), w.created_at),
      COALESCE((SELECT MAX(al.created_at) FROM public.audit_logs al WHERE al.workspace_id = w.id), w.created_at)
    ) AS last_activity
  FROM public.workspaces w
  ) workspace_stats
  ORDER BY workspace_stats.last_activity DESC NULLS LAST
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_top_workspaces_by_activity(INT) TO authenticated;

-- 3) Danh sách toàn bộ user để Super Admin gán một Gmail vào nhiều workspace.
CREATE OR REPLACE FUNCTION public.get_all_users_admin()
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  is_banned BOOLEAN,
  created_at TIMESTAMPTZ,
  workspace_count BIGINT,
  workspace_names TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Super Admin mới được xem';
  END IF;

  RETURN QUERY
  SELECT
    p.id AS user_id,
    p.email::TEXT,
    COALESCE(p.full_name, p.email)::TEXT,
    p.is_banned,
    p.created_at,
    COUNT(wm.id) AS workspace_count,
    COALESCE(string_agg(w.name, ', ' ORDER BY w.name), '')::TEXT AS workspace_names
  FROM public.profiles p
  LEFT JOIN public.workspace_members wm ON wm.user_id = p.id
  LEFT JOIN public.workspaces w ON w.id = wm.workspace_id
  WHERE p.is_super_admin = FALSE
  GROUP BY p.id, p.email, p.full_name, p.is_banned, p.created_at
  ORDER BY p.created_at DESC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_all_users_admin() TO authenticated;

-- 4) Workspaces cần dọn dẹp: mặc định không hoạt động 14 ngày.
CREATE OR REPLACE FUNCTION public.get_workspace_health_overview(p_inactive_days INT DEFAULT 14)
RETURNS TABLE (
  workspace_id UUID,
  workspace_name TEXT,
  created_at TIMESTAMPTZ,
  member_count BIGINT,
  project_count BIGINT,
  contact_count BIGINT,
  last_activity TIMESTAMPTZ,
  inactive_days INT,
  health_status TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Chỉ Super Admin mới được xem';
  END IF;
  IF p_inactive_days < 1 OR p_inactive_days > 3650 THEN
    RAISE EXCEPTION 'Số ngày không hợp lệ';
  END IF;

  RETURN QUERY
  SELECT
    ws.workspace_id,
    ws.workspace_name,
    ws.created_at,
    ws.member_count,
    ws.project_count,
    ws.contact_count,
    ws.last_activity,
    GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - ws.last_activity)) / 86400)::INT) AS inactive_days,
    CASE
      WHEN ws.last_activity < clock_timestamp() - make_interval(days => p_inactive_days) THEN 'inactive'
      WHEN ws.last_activity < clock_timestamp() - make_interval(days => 7) THEN 'quiet'
      ELSE 'active'
    END::TEXT AS health_status
  FROM (
    SELECT
      w.id AS workspace_id,
      w.name::TEXT AS workspace_name,
      w.created_at,
      (SELECT COUNT(*) FROM public.workspace_members wm WHERE wm.workspace_id = w.id) AS member_count,
      (SELECT COUNT(*) FROM public.projects pr WHERE pr.workspace_id = w.id) AS project_count,
      (SELECT COUNT(*) FROM public.contacts ct WHERE ct.workspace_id = w.id) AS contact_count,
      GREATEST(
        w.updated_at,
        COALESCE((SELECT MAX(pr.updated_at) FROM public.projects pr WHERE pr.workspace_id = w.id), w.created_at),
        COALESCE((SELECT MAX(ca.updated_at) FROM public.campaigns ca JOIN public.projects pr ON pr.id = ca.project_id WHERE pr.workspace_id = w.id), w.created_at),
        COALESCE((SELECT MAX(pc.updated_at) FROM public.personal_campaigns pc WHERE pc.workspace_id = w.id), w.created_at),
        COALESCE((SELECT MAX(al.created_at) FROM public.audit_logs al WHERE al.workspace_id = w.id), w.created_at)
      ) AS last_activity
    FROM public.workspaces w
  ) ws
  ORDER BY ws.last_activity ASC, ws.workspace_name ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_workspace_health_overview(INT) TO authenticated;

-- Best-effort lịch sử cũ: tạo event nguồn cho dự án/campaign đã tồn tại trước audit.
INSERT INTO public.audit_logs (workspace_id, user_id, user_email, action, resource_type, resource_id, resource_name, metadata, created_at)
SELECT pr.workspace_id, pr.created_by, pf.email, 'project_created', 'project', pr.id, pr.name,
  jsonb_build_object('source', 'historical_backfill'), pr.created_at
FROM public.projects pr
LEFT JOIN public.profiles pf ON pf.id = pr.created_by
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_logs al WHERE al.action = 'project_created' AND al.resource_id = pr.id
);

INSERT INTO public.audit_logs (workspace_id, user_id, user_email, action, resource_type, resource_id, resource_name, metadata, created_at)
SELECT pr.workspace_id, ca.created_by, pf.email, 'campaign_created', 'campaign', ca.id, ca.name,
  jsonb_build_object('source', 'historical_backfill'), ca.created_at
FROM public.campaigns ca
JOIN public.projects pr ON pr.id = ca.project_id
LEFT JOIN public.profiles pf ON pf.id = ca.created_by
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_logs al WHERE al.action = 'campaign_created' AND al.resource_id = ca.id
);

INSERT INTO public.audit_logs (workspace_id, user_id, user_email, action, resource_type, resource_id, resource_name, metadata, created_at)
SELECT pr.workspace_id, ca.created_by, pf.email, 'campaign_sent', 'campaign', ca.id, ca.name,
  jsonb_build_object('source', 'historical_backfill', 'status', ca.status), ca.updated_at
FROM public.campaigns ca
JOIN public.projects pr ON pr.id = ca.project_id
LEFT JOIN public.profiles pf ON pf.id = ca.created_by
WHERE ca.status IN ('sent', 'partial', 'failed')
  AND NOT EXISTS (
    SELECT 1 FROM public.audit_logs al WHERE al.action = 'campaign_sent' AND al.resource_id = ca.id
  );

INSERT INTO public.audit_logs (workspace_id, user_id, user_email, action, resource_type, resource_id, resource_name, metadata, created_at)
SELECT pc.workspace_id, NULL, 'Historical import', 'personal_campaign_created', 'personal_campaign', pc.id, pc.name,
  jsonb_build_object('source', 'historical_backfill'), pc.created_at
FROM public.personal_campaigns pc
WHERE NOT EXISTS (
  SELECT 1 FROM public.audit_logs al WHERE al.action = 'personal_campaign_created' AND al.resource_id = pc.id
);
