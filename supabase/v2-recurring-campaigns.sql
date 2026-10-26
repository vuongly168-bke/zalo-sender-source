-- =============================================
-- RECURRING CAMPAIGNS (lặp lại định kỳ) - cho gửi NHÓM
-- ⚠️ CHẠY FILE NÀY SAU v2-buoi5-super-admin-stats.sql
-- =============================================

-- 1. Thêm các cột recurring vào campaigns
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS is_recurring BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS recurrence_unit TEXT CHECK (recurrence_unit IN ('day','week','month')),
  ADD COLUMN IF NOT EXISTS recurrence_interval INT DEFAULT 1 CHECK (recurrence_interval >= 1 AND recurrence_interval <= 365),
  ADD COLUMN IF NOT EXISTS recurrence_days_of_week INT[],  -- 1=T2..7=CN (chỉ dùng khi unit='week')
  ADD COLUMN IF NOT EXISTS recurrence_end_type TEXT CHECK (recurrence_end_type IN ('never','date','count')),
  ADD COLUMN IF NOT EXISTS recurrence_end_date DATE,
  ADD COLUMN IF NOT EXISTS recurrence_end_count INT,
  ADD COLUMN IF NOT EXISTS recurrence_count_done INT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS recurring_parent_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ;

-- Cho phép thêm status 'active' (cho parent recurring) và 'completed' (parent xong)
ALTER TABLE campaigns DROP CONSTRAINT IF EXISTS campaigns_status_check;
ALTER TABLE campaigns ADD CONSTRAINT campaigns_status_check
  CHECK (status IN ('draft', 'scheduled', 'sending', 'sent', 'partial', 'failed', 'active', 'completed', 'paused'));

CREATE INDEX IF NOT EXISTS idx_campaigns_recurring ON campaigns(is_recurring, status, next_run_at)
  WHERE is_recurring = TRUE;
CREATE INDEX IF NOT EXISTS idx_campaigns_parent ON campaigns(recurring_parent_id)
  WHERE recurring_parent_id IS NOT NULL;

-- 2. Function: tính next_run_at từ schedule config
CREATE OR REPLACE FUNCTION public.calculate_next_run(
  p_unit TEXT,
  p_interval INT,
  p_days_of_week INT[],
  p_from_time TIMESTAMPTZ,
  p_hour INT,
  p_minute INT
) RETURNS TIMESTAMPTZ AS $$
DECLARE
  next_date TIMESTAMPTZ;
  candidate_date DATE;
  candidate_dow INT;
  i INT;
BEGIN
  -- Đảm bảo p_from_time có giờ:phút trùng config (vì có thể là now())
  next_date := date_trunc('day', p_from_time) + (p_hour || ' hours')::interval + (p_minute || ' minutes')::interval;

  -- Nếu next_date <= now → cộng tối thiểu 1 unit
  IF next_date <= p_from_time THEN
    next_date := next_date + INTERVAL '1 day';  -- đẩy sang ngày kế (dù unit gì)
  END IF;

  IF p_unit = 'day' THEN
    -- Đơn giản: lặp mỗi N ngày từ from_time
    RETURN next_date;

  ELSIF p_unit = 'week' THEN
    -- Tìm ngày trong tuần (1=T2..7=CN) phù hợp với days_of_week
    IF p_days_of_week IS NULL OR array_length(p_days_of_week, 1) IS NULL THEN
      RAISE EXCEPTION 'days_of_week không được trống với unit=week';
    END IF;

    -- Loop tối đa 7 ngày để tìm dow phù hợp
    FOR i IN 0..6 LOOP
      candidate_date := (next_date + (i || ' days')::interval)::date;
      -- PostgreSQL: extract(dow) trả 0=CN..6=T7. Convert sang 1=T2..7=CN
      candidate_dow := EXTRACT(ISODOW FROM candidate_date)::INT;
      IF candidate_dow = ANY(p_days_of_week) THEN
        RETURN candidate_date + (p_hour || ' hours')::interval + (p_minute || ' minutes')::interval;
      END IF;
    END LOOP;
    RETURN next_date;  -- fallback

  ELSIF p_unit = 'month' THEN
    -- Lặp mỗi N tháng (giữ nguyên ngày trong tháng)
    RETURN next_date;
  END IF;

  RETURN next_date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- 3. RPC: tạo instance con từ recurring parent
CREATE OR REPLACE FUNCTION public.generate_recurring_instance(p_parent_id UUID)
RETURNS UUID AS $$
DECLARE
  parent campaigns%ROWTYPE;
  new_id UUID;
  next_run TIMESTAMPTZ;
  hour_part INT;
  minute_part INT;
BEGIN
  SELECT * INTO parent FROM campaigns WHERE id = p_parent_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Parent campaign không tồn tại'; END IF;
  IF NOT parent.is_recurring THEN RAISE EXCEPTION 'Campaign không phải recurring'; END IF;

  -- Tính next_run cho instance này (lấy hour/minute từ next_run_at của parent)
  next_run := COALESCE(parent.next_run_at, NOW());
  hour_part := EXTRACT(HOUR FROM next_run)::INT;
  minute_part := EXTRACT(MINUTE FROM next_run)::INT;

  -- Insert child campaign (clone từ parent nhưng không recurring)
  INSERT INTO campaigns (
    project_id, name, message, image_url, scheduled_at, status,
    created_by, recurring_parent_id, is_recurring
  ) VALUES (
    parent.project_id,
    parent.name || ' (' || (parent.recurrence_count_done + 1) || ')',
    parent.message,
    parent.image_url,
    next_run,
    'scheduled',
    parent.created_by,
    parent.id,
    FALSE
  ) RETURNING id INTO new_id;

  -- Clone campaign_groups
  INSERT INTO campaign_groups (campaign_id, zalo_group_id, status)
  SELECT new_id, zalo_group_id, 'pending'
  FROM campaign_groups
  WHERE campaign_id = p_parent_id;

  -- Tính next_run kế tiếp cho parent
  IF parent.recurrence_unit = 'day' THEN
    next_run := next_run + (parent.recurrence_interval || ' days')::interval;
  ELSIF parent.recurrence_unit = 'week' THEN
    -- Tìm ngày tiếp theo trong days_of_week
    next_run := public.calculate_next_run(
      'week', parent.recurrence_interval, parent.recurrence_days_of_week,
      next_run + INTERVAL '1 day', hour_part, minute_part
    );
  ELSIF parent.recurrence_unit = 'month' THEN
    next_run := next_run + (parent.recurrence_interval || ' months')::interval;
  END IF;

  -- Update parent: tăng count + set next_run_at
  UPDATE campaigns
  SET recurrence_count_done = recurrence_count_done + 1,
      next_run_at = next_run,
      status = CASE
        WHEN recurrence_end_type = 'count' AND recurrence_count_done + 1 >= recurrence_end_count THEN 'completed'
        WHEN recurrence_end_type = 'date' AND next_run::date > recurrence_end_date THEN 'completed'
        ELSE 'active'
      END
  WHERE id = p_parent_id;

  RETURN new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.generate_recurring_instance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_next_run(TEXT, INT, INT[], TIMESTAMPTZ, INT, INT) TO authenticated;

-- 4. RPC: lấy danh sách child instances của 1 parent
CREATE OR REPLACE FUNCTION public.get_recurring_instances(p_parent_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  status TEXT,
  scheduled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  sent_count BIGINT,
  failed_count BIGINT,
  total_count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    c.status,
    c.scheduled_at,
    c.created_at,
    (SELECT COUNT(*) FROM campaign_groups WHERE campaign_id = c.id AND status = 'sent'),
    (SELECT COUNT(*) FROM campaign_groups WHERE campaign_id = c.id AND status = 'failed'),
    (SELECT COUNT(*) FROM campaign_groups WHERE campaign_id = c.id)
  FROM campaigns c
  WHERE c.recurring_parent_id = p_parent_id
  ORDER BY c.scheduled_at DESC NULLS LAST
  LIMIT 100;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_recurring_instances(UUID) TO authenticated;
