-- =============================================
-- MULTI-IMAGE SUPPORT (tối đa 5 ảnh / đợt gửi)
-- ⚠️ CHẠY FILE NÀY SAU v2-recurring-campaigns.sql
-- =============================================

-- 1. Thêm cột image_urls (mảng) cho campaigns + personal_campaigns
ALTER TABLE campaigns
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

ALTER TABLE personal_campaigns
  ADD COLUMN IF NOT EXISTS image_urls TEXT[] DEFAULT '{}';

-- 2. Migrate dữ liệu cũ: nếu image_url có giá trị → thêm vào image_urls
UPDATE campaigns
  SET image_urls = ARRAY[image_url]
  WHERE image_url IS NOT NULL AND image_url != ''
    AND (image_urls IS NULL OR array_length(image_urls, 1) IS NULL);

UPDATE personal_campaigns
  SET image_urls = ARRAY[image_url]
  WHERE image_url IS NOT NULL AND image_url != ''
    AND (image_urls IS NULL OR array_length(image_urls, 1) IS NULL);

-- 3. Cập nhật RPC generate_recurring_instance để clone image_urls
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

  next_run := COALESCE(parent.next_run_at, NOW());
  hour_part := EXTRACT(HOUR FROM next_run)::INT;
  minute_part := EXTRACT(MINUTE FROM next_run)::INT;

  INSERT INTO campaigns (
    project_id, name, message, image_url, image_urls, scheduled_at, status,
    created_by, recurring_parent_id, is_recurring
  ) VALUES (
    parent.project_id,
    parent.name || ' (' || (parent.recurrence_count_done + 1) || ')',
    parent.message,
    parent.image_url,
    parent.image_urls,
    next_run,
    'scheduled',
    parent.created_by,
    parent.id,
    FALSE
  ) RETURNING id INTO new_id;

  INSERT INTO campaign_groups (campaign_id, zalo_group_id, status)
  SELECT new_id, zalo_group_id, 'pending'
  FROM campaign_groups
  WHERE campaign_id = p_parent_id;

  IF parent.recurrence_unit = 'day' THEN
    next_run := next_run + (parent.recurrence_interval || ' days')::interval;
  ELSIF parent.recurrence_unit = 'week' THEN
    next_run := public.calculate_next_run(
      'week', parent.recurrence_interval, parent.recurrence_days_of_week,
      next_run + INTERVAL '1 day', hour_part, minute_part
    );
  ELSIF parent.recurrence_unit = 'month' THEN
    next_run := next_run + (parent.recurrence_interval || ' months')::interval;
  END IF;

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
