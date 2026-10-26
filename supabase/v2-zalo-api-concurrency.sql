-- ================================================================
-- Điều phối API Zalo dùng chung khi nhiều user thao tác đồng thời.
-- Chạy một lần trong Supabase SQL Editor trước khi deploy code mới.
-- ================================================================

CREATE TABLE IF NOT EXISTS public.zalo_api_rate_limits (
  zalo_account_id UUID PRIMARY KEY REFERENCES public.zalo_accounts(id) ON DELETE CASCADE,
  next_available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

ALTER TABLE public.zalo_api_rate_limits ENABLE ROW LEVEL SECURITY;

-- Không mở policy trực tiếp: client chỉ được đặt chỗ qua function đã kiểm tra
-- quyền workspace. Service role vẫn có thể phục vụ cron/campaign.
REVOKE ALL ON TABLE public.zalo_api_rate_limits FROM anon, authenticated;

CREATE OR REPLACE FUNCTION public.reserve_zalo_api_slot(
  p_zalo_account_id UUID,
  p_interval_ms INTEGER DEFAULT 1250,
  p_max_wait_ms INTEGER DEFAULT 25000
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := clock_timestamp();
  v_next TIMESTAMPTZ;
  v_scheduled TIMESTAMPTZ;
  v_interval INTERVAL;
  v_wait_ms NUMERIC;
BEGIN
  IF p_interval_ms < 250 OR p_interval_ms > 60000 THEN
    RAISE EXCEPTION 'Khoảng cách API không hợp lệ';
  END IF;
  IF p_max_wait_ms < 0 OR p_max_wait_ms > 120000 THEN
    RAISE EXCEPTION 'Thời gian chờ API không hợp lệ';
  END IF;

  IF auth.role() <> 'service_role' AND NOT EXISTS (
    SELECT 1
    FROM public.zalo_accounts za
    JOIN public.workspace_members wm ON wm.workspace_id = za.workspace_id
    WHERE za.id = p_zalo_account_id
      AND wm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Không có quyền dùng Zalo Account này';
  END IF;

  v_interval := make_interval(secs => p_interval_ms / 1000.0);

  INSERT INTO public.zalo_api_rate_limits (zalo_account_id, next_available_at, updated_at)
  VALUES (p_zalo_account_id, v_now, v_now)
  ON CONFLICT (zalo_account_id) DO NOTHING;

  -- Khóa đúng một row/tài khoản trong transaction rất ngắn. Mỗi request nhận
  -- một thời điểm riêng, nên nhiều Vercel instance cũng không gọi upstream cùng lúc.
  SELECT next_available_at
  INTO v_next
  FROM public.zalo_api_rate_limits
  WHERE zalo_account_id = p_zalo_account_id
  FOR UPDATE;

  v_scheduled := GREATEST(v_next, v_now);
  v_wait_ms := EXTRACT(EPOCH FROM (v_scheduled - v_now)) * 1000;

  IF v_wait_ms > p_max_wait_ms THEN
    RAISE EXCEPTION 'ZALO_QUEUE_FULL: wait_ms=%', CEIL(v_wait_ms);
  END IF;

  UPDATE public.zalo_api_rate_limits
  SET next_available_at = v_scheduled + v_interval,
      updated_at = v_now
  WHERE zalo_account_id = p_zalo_account_id;

  RETURN v_scheduled;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_zalo_api_slot(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_zalo_api_slot(UUID, INTEGER, INTEGER) TO authenticated, service_role;

COMMENT ON FUNCTION public.reserve_zalo_api_slot(UUID, INTEGER, INTEGER) IS
  'Atomically reserves a per-Zalo-account API slot across all application instances.';
