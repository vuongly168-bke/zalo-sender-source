-- =============================================
-- HOTFIX 2: Backfill profiles cho user thiếu + Cải thiện get_pending_users
-- ⚠️ CHẠY FILE NÀY SAU v2-hotfix-invite-only.sql
-- =============================================

-- 1. Backfill: tạo profile cho user trong auth.users mà chưa có profile
INSERT INTO profiles (id, email, full_name, avatar_url, is_super_admin, is_banned)
SELECT
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', u.email),
  u.raw_user_meta_data->>'avatar_url',
  CASE WHEN u.email = 'ADMIN_EMAIL_HERE' THEN TRUE ELSE FALSE END,
  FALSE
FROM auth.users u
LEFT JOIN profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- 2. Đảm bảo trigger handle_new_user robust hơn (trường hợp INSERT bị conflict)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, is_super_admin)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', NEW.email),
    NEW.raw_user_meta_data->>'avatar_url',
    CASE WHEN NEW.email = 'ADMIN_EMAIL_HERE' THEN TRUE ELSE FALSE END
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    full_name = COALESCE(EXCLUDED.full_name, profiles.full_name),
    avatar_url = COALESCE(EXCLUDED.avatar_url, profiles.avatar_url);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Không block sign-up nếu có lỗi tạo profile
  RAISE WARNING 'handle_new_user error: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Cập nhật get_pending_users: query từ auth.users (bắt cả user thiếu profile)
DROP FUNCTION IF EXISTS public.get_pending_users();

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
  SELECT
    u.id AS user_id,
    u.email::TEXT AS email,
    COALESCE(
      p.full_name,
      u.raw_user_meta_data->>'full_name',
      u.raw_user_meta_data->>'name',
      u.email
    )::TEXT AS full_name,
    COALESCE(p.avatar_url, u.raw_user_meta_data->>'avatar_url')::TEXT AS avatar_url,
    u.created_at
  FROM auth.users u
  LEFT JOIN profiles p ON p.id = u.id
  WHERE NOT EXISTS (SELECT 1 FROM workspace_members wm WHERE wm.user_id = u.id)
    AND COALESCE(p.is_super_admin, FALSE) = FALSE
    AND COALESCE(p.is_banned, FALSE) = FALSE
    AND u.deleted_at IS NULL
  ORDER BY u.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_pending_users() TO authenticated;
