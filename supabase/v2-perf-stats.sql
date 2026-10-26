-- =============================================
-- PERFORMANCE: RPC aggregate stats (fix N+1 queries)
-- ⚠️ CHẠY FILE NÀY SAU v2-message-delay.sql
-- =============================================

-- Lấy list personal campaigns + stats (sent/failed/total) trong 1 query duy nhất
-- Thay vì N+1 (3 query × số campaign) ở client.
CREATE OR REPLACE FUNCTION public.get_personal_campaigns_with_stats(p_workspace_id UUID)
RETURNS TABLE (
  id UUID,
  name TEXT,
  status TEXT,
  scheduled_at TIMESTAMPTZ,
  batch_size INT,
  batch_delay_minutes INT,
  zalo_account_id UUID,
  zalo_account_name TEXT,
  zalo_account_phone TEXT,
  created_at TIMESTAMPTZ,
  recipient_count BIGINT,
  sent_count BIGINT,
  failed_count BIGINT
) AS $$
BEGIN
  IF NOT public.is_workspace_member(p_workspace_id, auth.uid()) THEN
    RAISE EXCEPTION 'Không có quyền xem';
  END IF;

  RETURN QUERY
  SELECT
    pc.id,
    pc.name,
    pc.status,
    pc.scheduled_at,
    pc.batch_size,
    pc.batch_delay_minutes,
    pc.zalo_account_id,
    za.name::TEXT AS zalo_account_name,
    za.phone_number::TEXT AS zalo_account_phone,
    pc.created_at,
    COALESCE(stats.total, 0) AS recipient_count,
    COALESCE(stats.sent, 0) AS sent_count,
    COALESCE(stats.failed, 0) AS failed_count
  FROM personal_campaigns pc
  LEFT JOIN zalo_accounts za ON za.id = pc.zalo_account_id
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'sent') AS sent,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed
    FROM personal_campaign_recipients
    WHERE campaign_id = pc.id
  ) stats ON TRUE
  WHERE pc.workspace_id = p_workspace_id
  ORDER BY pc.created_at DESC
  LIMIT 100;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_personal_campaigns_with_stats(UUID) TO authenticated;

-- Lấy stats tổng hợp của 1 personal campaign (cho auto-refresh nhẹ — không tải full recipients)
CREATE OR REPLACE FUNCTION public.get_personal_campaign_progress(p_campaign_id UUID)
RETURNS TABLE (
  total BIGINT,
  sent BIGINT,
  failed BIGINT,
  pending BIGINT,
  status TEXT,
  current_batch INT,
  last_batch_sent_at TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(r.*) AS total,
    COUNT(r.*) FILTER (WHERE r.status = 'sent') AS sent,
    COUNT(r.*) FILTER (WHERE r.status = 'failed') AS failed,
    COUNT(r.*) FILTER (WHERE r.status = 'pending') AS pending,
    pc.status,
    pc.current_batch,
    pc.last_batch_sent_at
  FROM personal_campaigns pc
  LEFT JOIN personal_campaign_recipients r ON r.campaign_id = pc.id
  WHERE pc.id = p_campaign_id
  GROUP BY pc.status, pc.current_batch, pc.last_batch_sent_at;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.get_personal_campaign_progress(UUID) TO authenticated;
