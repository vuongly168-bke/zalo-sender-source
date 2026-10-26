-- =============================================
-- ZALO SENDER - DATABASE SCHEMA V2
-- Multi-workspace, Multi-Zalo, Personal messaging
-- ⚠️ CHẠY FILE NÀY TRONG SUPABASE SQL EDITOR
-- ⚠️ FILE NÀY SẼ XÓA TOÀN BỘ DATA CŨ!
-- =============================================

-- ============ DROP OLD SCHEMA ============
DROP TABLE IF EXISTS campaign_groups CASCADE;
DROP TABLE IF EXISTS campaigns CASCADE;
DROP TABLE IF EXISTS zalo_groups CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS api_keys CASCADE;
DROP TABLE IF EXISTS workspace_members CASCADE;
DROP TABLE IF EXISTS workspaces CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;
DROP FUNCTION IF EXISTS public.is_workspace_member(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.is_workspace_admin(UUID, UUID) CASCADE;
DROP FUNCTION IF EXISTS public.get_user_workspaces(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.create_workspace_with_owner(TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.invite_member(UUID, TEXT, TEXT) CASCADE;
DROP FUNCTION IF EXISTS public.is_super_admin(UUID) CASCADE;
DROP FUNCTION IF EXISTS public.update_updated_at() CASCADE;

-- =============================================
-- 1. PROFILES (Thông tin user)
-- =============================================
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT NOT NULL,
  full_name TEXT,
  avatar_url TEXT,
  is_super_admin BOOLEAN DEFAULT FALSE,
  is_banned BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 2. WORKSPACES (Tổ chức / Công ty)
-- =============================================
CREATE TABLE workspaces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 3. WORKSPACE MEMBERS (Thành viên trong workspace)
-- =============================================
CREATE TABLE workspace_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- =============================================
-- 4. ZALO ACCOUNTS (Mỗi tài khoản Zalo riêng trong workspace)
-- VD: "Zalo Chăm sóc", "Zalo Chốt đơn", "Zalo Nội bộ"
-- =============================================
CREATE TABLE zalo_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 5. API KEYS (Cấu hình API func.vn cho mỗi Zalo Account)
-- =============================================
CREATE TABLE api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  zalo_account_id UUID REFERENCES zalo_accounts(id) ON DELETE CASCADE NOT NULL,
  key_type TEXT NOT NULL CHECK (key_type IN (
    'group_send_images',
    'group_send_message',
    'get_group_info',
    'user_send_message',
    'get_user_info'
  )),
  api_url TEXT NOT NULL,
  bearer_token TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(zalo_account_id, key_type)
);

-- =============================================
-- 6. PROJECTS (Dự án)
-- =============================================
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  zalo_account_id UUID REFERENCES zalo_accounts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 7. ZALO GROUPS (Nhóm Zalo trong project)
-- =============================================
CREATE TABLE zalo_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  group_name TEXT NOT NULL,
  group_id TEXT NOT NULL,
  group_link TEXT,
  member_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  import_batch_id UUID,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 8. CAMPAIGNS (Đợt gửi tin nhóm)
-- =============================================
CREATE TABLE campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  message TEXT,
  image_url TEXT,
  scheduled_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'scheduled', 'sending', 'sent', 'partial', 'failed'
  )),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 9. CAMPAIGN GROUPS (Nhóm nào trong campaign)
-- =============================================
CREATE TABLE campaign_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  zalo_group_id UUID REFERENCES zalo_groups(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  UNIQUE(campaign_id, zalo_group_id)
);

-- =============================================
-- 10. CONTACTS (Khách hàng cá nhân)
-- =============================================
CREATE TABLE contacts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  phone TEXT NOT NULL,
  name TEXT,
  zalo_user_id TEXT,
  avatar_url TEXT,
  tags TEXT[] DEFAULT '{}',
  notes TEXT,
  last_synced_at TIMESTAMPTZ,
  import_batch_id UUID,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, phone)
);

CREATE INDEX idx_contacts_workspace ON contacts(workspace_id);
CREATE INDEX idx_contacts_tags ON contacts USING GIN(tags);

-- =============================================
-- 11. CONTACT LISTS (Danh sách khách hàng)
-- =============================================
CREATE TABLE contact_lists (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- 12. CONTACT LIST MEMBERS (M-N giữa contact và list)
-- =============================================
CREATE TABLE contact_list_members (
  list_id UUID REFERENCES contact_lists(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY(list_id, contact_id)
);

-- =============================================
-- 13. PERSONAL CAMPAIGNS (Đợt gửi tin cá nhân hàng loạt)
-- =============================================
CREATE TABLE personal_campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  zalo_account_id UUID REFERENCES zalo_accounts(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  message TEXT,
  image_url TEXT,
  scheduled_at TIMESTAMPTZ,
  batch_size INT DEFAULT 20 CHECK (batch_size BETWEEN 1 AND 100),
  batch_delay_minutes INT DEFAULT 5 CHECK (batch_delay_minutes BETWEEN 1 AND 120),
  current_batch INT DEFAULT 0,
  last_batch_sent_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'scheduled', 'sending', 'sent', 'partial', 'failed', 'paused'
  )),
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Cross-workspace account references are rejected at the database boundary.
CREATE OR REPLACE FUNCTION enforce_zalo_account_workspace()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.zalo_account_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM zalo_accounts
    WHERE id = NEW.zalo_account_id AND workspace_id = NEW.workspace_id
  ) THEN
    RAISE EXCEPTION 'zalo account must belong to the same workspace';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_projects_zalo_account_workspace
  BEFORE INSERT OR UPDATE OF workspace_id, zalo_account_id ON projects
  FOR EACH ROW EXECUTE FUNCTION enforce_zalo_account_workspace();

CREATE TRIGGER trg_personal_campaigns_zalo_account_workspace
  BEFORE INSERT OR UPDATE OF workspace_id, zalo_account_id ON personal_campaigns
  FOR EACH ROW EXECUTE FUNCTION enforce_zalo_account_workspace();

CREATE OR REPLACE FUNCTION prevent_zalo_account_workspace_move()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.workspace_id <> OLD.workspace_id AND (
    EXISTS (SELECT 1 FROM projects WHERE zalo_account_id = NEW.id)
    OR EXISTS (SELECT 1 FROM personal_campaigns WHERE zalo_account_id = NEW.id)
  ) THEN
    RAISE EXCEPTION 'cannot move a referenced Zalo account to another workspace';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_prevent_zalo_account_workspace_move
  BEFORE UPDATE OF workspace_id ON zalo_accounts
  FOR EACH ROW EXECUTE FUNCTION prevent_zalo_account_workspace_move();

-- =============================================
-- 14. PERSONAL CAMPAIGN RECIPIENTS (Từng khách trong campaign cá nhân)
-- =============================================
CREATE TABLE personal_campaign_recipients (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES personal_campaigns(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE NOT NULL,
  batch_number INT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  UNIQUE(campaign_id, contact_id)
);

CREATE INDEX idx_recipients_campaign_status ON personal_campaign_recipients(campaign_id, status);
CREATE INDEX idx_recipients_batch ON personal_campaign_recipients(campaign_id, batch_number);

-- =============================================
-- 15. IMPORT BATCHES (Lịch sử import Excel/CSV)
-- =============================================
CREATE TABLE import_batches (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id),
  type TEXT NOT NULL CHECK (type IN ('contacts', 'groups', 'campaigns')),
  file_name TEXT,
  total_rows INT DEFAULT 0,
  success_rows INT DEFAULT 0,
  failed_rows INT DEFAULT 0,
  error_log JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- HELPER FUNCTIONS (SECURITY DEFINER - bypass RLS)
-- =============================================
CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT COALESCE((SELECT is_super_admin FROM profiles WHERE id = _user_id), FALSE);
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_workspace_member(_workspace_id UUID, _user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = _workspace_id AND user_id = _user_id
  ) OR public.is_super_admin(_user_id);
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.is_workspace_admin(_workspace_id UUID, _user_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM workspace_members
    WHERE workspace_id = _workspace_id
      AND user_id = _user_id
      AND role IN ('owner', 'admin')
  ) OR public.is_super_admin(_user_id);
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- Tạo workspace mới với owner = user hiện tại
CREATE OR REPLACE FUNCTION public.create_workspace_with_owner(workspace_name TEXT, workspace_desc TEXT DEFAULT NULL)
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

  INSERT INTO workspaces (name, description, created_by)
  VALUES (trim(workspace_name), workspace_desc, current_user_id)
  RETURNING id INTO new_workspace_id;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, current_user_id, 'owner');

  RETURN new_workspace_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.create_workspace_with_owner(TEXT, TEXT) TO authenticated;

-- Mời member theo email
CREATE OR REPLACE FUNCTION public.invite_member(p_workspace_id UUID, p_email TEXT, p_role TEXT)
RETURNS TEXT AS $$
DECLARE
  target_user_id UUID;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN RAISE EXCEPTION 'Cần đăng nhập'; END IF;

  IF NOT public.is_workspace_admin(p_workspace_id, current_user_id) THEN
    RAISE EXCEPTION 'Bạn không có quyền mời thành viên';
  END IF;

  SELECT id INTO target_user_id FROM auth.users WHERE email = lower(trim(p_email));

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Người dùng % chưa có tài khoản. Họ cần đăng nhập bằng Google trước.', p_email;
  END IF;

  IF EXISTS (SELECT 1 FROM workspace_members WHERE workspace_id = p_workspace_id AND user_id = target_user_id) THEN
    RETURN 'Người này đã là thành viên';
  END IF;

  INSERT INTO workspace_members (workspace_id, user_id, role)
  VALUES (p_workspace_id, target_user_id, p_role);

  RETURN 'Đã mời thành công';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.invite_member(UUID, TEXT, TEXT) TO authenticated;

-- =============================================
-- RLS POLICIES
-- =============================================
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_list_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE personal_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_batches ENABLE ROW LEVEL SECURITY;

-- Profiles
CREATE POLICY "View own profile or super admin" ON profiles FOR SELECT
  USING (auth.uid() = id OR public.is_super_admin(auth.uid()));
CREATE POLICY "Update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Workspaces
CREATE POLICY "View accessible workspaces" ON workspaces FOR SELECT
  USING (public.is_workspace_member(id, auth.uid()));
CREATE POLICY "Authenticated users can create workspace" ON workspaces FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "Admins can update workspace" ON workspaces FOR UPDATE
  USING (public.is_workspace_admin(id, auth.uid()));
CREATE POLICY "Owners can delete workspace" ON workspaces FOR DELETE
  USING (public.is_workspace_admin(id, auth.uid()));

-- Workspace Members
CREATE POLICY "View workspace members" ON workspace_members FOR SELECT
  USING (user_id = auth.uid() OR public.is_workspace_member(workspace_id, auth.uid()));
-- Membership writes go through reviewed SECURITY DEFINER RPCs only.
CREATE POLICY "Admins can delete members" ON workspace_members FOR DELETE
  USING (public.is_workspace_admin(workspace_id, auth.uid()));

-- Zalo Accounts
CREATE POLICY "Members view zalo_accounts" ON zalo_accounts FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Admins manage zalo_accounts" ON zalo_accounts FOR ALL
  USING (public.is_workspace_admin(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_admin(workspace_id, auth.uid()));

-- API Keys (qua zalo_account)
-- API credential reads and writes are server-only through the service role.
REVOKE ALL ON TABLE api_keys FROM authenticated, anon;

-- Projects
CREATE POLICY "Members view projects" ON projects FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members manage projects" ON projects FOR ALL
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Zalo Groups
CREATE POLICY "Members view zalo_groups" ON zalo_groups FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE public.is_workspace_member(workspace_id, auth.uid())));
CREATE POLICY "Members manage zalo_groups" ON zalo_groups FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE public.is_workspace_member(workspace_id, auth.uid())))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE public.is_workspace_member(workspace_id, auth.uid())));

-- Campaigns
CREATE POLICY "Members view campaigns" ON campaigns FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE public.is_workspace_member(workspace_id, auth.uid())));
CREATE POLICY "Members manage campaigns" ON campaigns FOR ALL
  USING (project_id IN (SELECT id FROM projects WHERE public.is_workspace_member(workspace_id, auth.uid())))
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE public.is_workspace_member(workspace_id, auth.uid())));

-- Campaign Groups
CREATE POLICY "Members manage campaign_groups" ON campaign_groups FOR ALL
  USING (campaign_id IN (
    SELECT c.id FROM campaigns c JOIN projects p ON p.id = c.project_id
    WHERE public.is_workspace_member(p.workspace_id, auth.uid())
  ))
  WITH CHECK (campaign_id IN (
    SELECT c.id FROM campaigns c JOIN projects p ON p.id = c.project_id
    WHERE public.is_workspace_member(p.workspace_id, auth.uid())
  ));

-- Contacts
CREATE POLICY "Members view contacts" ON contacts FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members manage contacts" ON contacts FOR ALL
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Contact Lists
CREATE POLICY "Members view contact_lists" ON contact_lists FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members manage contact_lists" ON contact_lists FOR ALL
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Contact List Members
CREATE POLICY "Members manage contact_list_members" ON contact_list_members FOR ALL
  USING (list_id IN (SELECT id FROM contact_lists WHERE public.is_workspace_member(workspace_id, auth.uid())))
  WITH CHECK (list_id IN (SELECT id FROM contact_lists WHERE public.is_workspace_member(workspace_id, auth.uid())));

-- Personal Campaigns
CREATE POLICY "Members view personal_campaigns" ON personal_campaigns FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members manage personal_campaigns" ON personal_campaigns FOR ALL
  USING (public.is_workspace_member(workspace_id, auth.uid()))
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- Personal Campaign Recipients
CREATE POLICY "Members manage recipients" ON personal_campaign_recipients FOR ALL
  USING (campaign_id IN (SELECT id FROM personal_campaigns WHERE public.is_workspace_member(workspace_id, auth.uid())))
  WITH CHECK (campaign_id IN (SELECT id FROM personal_campaigns WHERE public.is_workspace_member(workspace_id, auth.uid())));

-- Import Batches
CREATE POLICY "Members view import_batches" ON import_batches FOR SELECT
  USING (public.is_workspace_member(workspace_id, auth.uid()));
CREATE POLICY "Members create import_batches" ON import_batches FOR INSERT
  WITH CHECK (public.is_workspace_member(workspace_id, auth.uid()));

-- =============================================
-- TRIGGER: Auto-create profile on signup
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, is_super_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    -- Auto promote email ADMIN_EMAIL_HERE làm Super Admin (THAY bằng email Google của bạn trước khi chạy)
    CASE WHEN NEW.email = 'ADMIN_EMAIL_HERE' THEN TRUE ELSE FALSE END
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================
-- TRIGGER: Auto-update updated_at
-- =============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_zalo_accounts_updated_at BEFORE UPDATE ON zalo_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_contact_lists_updated_at BEFORE UPDATE ON contact_lists FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_personal_campaigns_updated_at BEFORE UPDATE ON personal_campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
