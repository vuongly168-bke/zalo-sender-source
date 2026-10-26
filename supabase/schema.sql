-- =============================================
-- ZALO SENDER - DATABASE SCHEMA
-- Chạy file này trong Supabase SQL Editor
-- =============================================

-- 1. WORKSPACES (Tổ chức / Công ty)
CREATE TABLE workspaces (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. WORKSPACE MEMBERS (Thành viên trong workspace)
CREATE TABLE workspace_members (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, user_id)
);

-- 3. API KEYS (Cấu hình API func.vn cho mỗi workspace)
CREATE TABLE api_keys (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  key_type TEXT NOT NULL CHECK (key_type IN (
    'group_send_images',
    'group_send_message',
    'get_group_info',
    'user_send_message',
    'get_user_info'
  )),
  api_url TEXT NOT NULL,
  bearer_token TEXT NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(workspace_id, key_type)
);

-- 4. PROJECTS (Dự án)
CREATE TABLE projects (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. ZALO GROUPS (Nhóm Zalo thuộc project)
CREATE TABLE zalo_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE NOT NULL,
  group_name TEXT NOT NULL,
  group_id TEXT NOT NULL,
  group_link TEXT,
  member_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CAMPAIGNS (Đợt gửi tin nhắn)
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

-- 7. CAMPAIGN GROUPS (Group nào được gửi trong campaign)
CREATE TABLE campaign_groups (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE CASCADE NOT NULL,
  zalo_group_id UUID REFERENCES zalo_groups(id) ON DELETE CASCADE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
  sent_at TIMESTAMPTZ,
  error_message TEXT,
  UNIQUE(campaign_id, zalo_group_id)
);

-- 8. USER PROFILES (Thông tin thêm cho user)
CREATE TABLE profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE zalo_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Profiles: user chỉ xem/sửa profile của mình
CREATE POLICY "Users can view own profile" ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

-- Workspaces: chỉ members mới thấy
CREATE POLICY "Members can view workspace" ON workspaces FOR SELECT
  USING (id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Anyone can create workspace" ON workspaces FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Admins can update workspace" ON workspaces FOR UPDATE
  USING (id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- Workspace Members
CREATE POLICY "Members can view members" ON workspace_members FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid()));
CREATE POLICY "Anyone can insert member" ON workspace_members FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Admins can delete members" ON workspace_members FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members wm WHERE wm.user_id = auth.uid() AND wm.role IN ('owner', 'admin')));

-- API Keys: chỉ members thấy
CREATE POLICY "Members can view api_keys" ON api_keys FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Admins can manage api_keys" ON api_keys FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));
CREATE POLICY "Admins can update api_keys" ON api_keys FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));
CREATE POLICY "Admins can delete api_keys" ON api_keys FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- Projects: members of workspace
CREATE POLICY "Members can view projects" ON projects FOR SELECT
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can create projects" ON projects FOR INSERT
  WITH CHECK (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Members can update projects" ON projects FOR UPDATE
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()));
CREATE POLICY "Admins can delete projects" ON projects FOR DELETE
  USING (workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- Zalo Groups
CREATE POLICY "Members can view zalo_groups" ON zalo_groups FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())));
CREATE POLICY "Members can manage zalo_groups" ON zalo_groups FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())));
CREATE POLICY "Members can update zalo_groups" ON zalo_groups FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())));
CREATE POLICY "Members can delete zalo_groups" ON zalo_groups FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())));

-- Campaigns
CREATE POLICY "Members can view campaigns" ON campaigns FOR SELECT
  USING (project_id IN (SELECT id FROM projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())));
CREATE POLICY "Members can create campaigns" ON campaigns FOR INSERT
  WITH CHECK (project_id IN (SELECT id FROM projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())));
CREATE POLICY "Members can update campaigns" ON campaigns FOR UPDATE
  USING (project_id IN (SELECT id FROM projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())));
CREATE POLICY "Members can delete campaigns" ON campaigns FOR DELETE
  USING (project_id IN (SELECT id FROM projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())));

-- Campaign Groups
CREATE POLICY "Members can view campaign_groups" ON campaign_groups FOR SELECT
  USING (campaign_id IN (SELECT id FROM campaigns WHERE project_id IN (SELECT id FROM projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))));
CREATE POLICY "Members can manage campaign_groups" ON campaign_groups FOR INSERT
  WITH CHECK (campaign_id IN (SELECT id FROM campaigns WHERE project_id IN (SELECT id FROM projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))));
CREATE POLICY "Members can update campaign_groups" ON campaign_groups FOR UPDATE
  USING (campaign_id IN (SELECT id FROM campaigns WHERE project_id IN (SELECT id FROM projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))));
CREATE POLICY "Members can delete campaign_groups" ON campaign_groups FOR DELETE
  USING (campaign_id IN (SELECT id FROM campaigns WHERE project_id IN (SELECT id FROM projects WHERE workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid()))));

-- =============================================
-- TRIGGER: Auto-create profile on signup
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));
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

CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_api_keys_updated_at BEFORE UPDATE ON api_keys FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_projects_updated_at BEFORE UPDATE ON projects FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
