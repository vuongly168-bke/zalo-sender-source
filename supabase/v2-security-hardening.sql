-- =============================================
-- Security hardening: membership and API secrets
-- Review in staging before applying to production.
-- =============================================

-- Workspace membership is created only through reviewed SECURITY DEFINER RPCs
-- such as create_workspace_with_owner and invite_member.
DROP POLICY IF EXISTS "Anyone can insert member" ON public.workspace_members;
REVOKE INSERT ON TABLE public.workspace_members FROM authenticated, anon;

-- API credentials are server-only. Authenticated browser clients must use the
-- guarded application route, which never returns bearer/account token values.
DROP POLICY IF EXISTS "Members view api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Members can view api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Admins manage api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Admins can manage api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Admins can insert api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Admins can update api_keys" ON public.api_keys;
DROP POLICY IF EXISTS "Admins can delete api_keys" ON public.api_keys;
REVOKE ALL ON TABLE public.api_keys FROM authenticated, anon;

-- A project or personal campaign may only reference a Zalo account from the
-- same workspace. This protects every writer, including direct database API
-- calls and future server routes.
CREATE OR REPLACE FUNCTION public.enforce_zalo_account_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.zalo_account_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.zalo_accounts
    WHERE id = NEW.zalo_account_id AND workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'zalo account must belong to the same workspace';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_projects_zalo_account_workspace ON public.projects;
CREATE TRIGGER trg_projects_zalo_account_workspace
  BEFORE INSERT OR UPDATE OF workspace_id, zalo_account_id ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.enforce_zalo_account_workspace();

DROP TRIGGER IF EXISTS trg_personal_campaigns_zalo_account_workspace ON public.personal_campaigns;
CREATE TRIGGER trg_personal_campaigns_zalo_account_workspace
  BEFORE INSERT OR UPDATE OF workspace_id, zalo_account_id ON public.personal_campaigns
  FOR EACH ROW EXECUTE FUNCTION public.enforce_zalo_account_workspace();

CREATE OR REPLACE FUNCTION public.prevent_zalo_account_workspace_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.workspace_id <> OLD.workspace_id AND (
    EXISTS (SELECT 1 FROM public.projects WHERE zalo_account_id = NEW.id)
    OR EXISTS (SELECT 1 FROM public.personal_campaigns WHERE zalo_account_id = NEW.id)
  ) THEN
    RAISE EXCEPTION 'cannot move a referenced Zalo account to another workspace';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_zalo_account_workspace_move ON public.zalo_accounts;
CREATE TRIGGER trg_prevent_zalo_account_workspace_move
  BEFORE UPDATE OF workspace_id ON public.zalo_accounts
  FOR EACH ROW EXECUTE FUNCTION public.prevent_zalo_account_workspace_move();
