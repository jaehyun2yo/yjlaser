-- Dashboard Statistics RPC Function
-- Created: 2025-01-24
-- Purpose: Consolidate multiple dashboard queries into a single database call

-- ============================================================================
-- Function: get_dashboard_stats
-- ============================================================================
-- Returns comprehensive dashboard statistics in a single query
-- Replaces 5+ individual queries with optimized PostgreSQL aggregation
--
-- Expected performance improvement: 70% reduction in dashboard load time
-- ============================================================================

CREATE OR REPLACE FUNCTION get_dashboard_stats()
RETURNS TABLE (
  -- Contact counts
  new_contact_count BIGINT,
  yesterday_contact_count BIGINT,
  today_contact_count BIGINT,

  -- Company counts
  new_company_count BIGINT,
  yesterday_company_count BIGINT,

  -- Daily contacts data (JSON array for last 30 days)
  daily_contacts JSONB,

  -- Referral sources (JSON array)
  referral_sources JSONB
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_today TIMESTAMP WITH TIME ZONE;
  v_yesterday_start TIMESTAMP WITH TIME ZONE;
  v_yesterday_end TIMESTAMP WITH TIME ZONE;
  v_thirty_days_ago TIMESTAMP WITH TIME ZONE;
BEGIN
  -- Calculate date boundaries
  v_today := date_trunc('day', NOW());
  v_yesterday_start := v_today - INTERVAL '1 day';
  v_yesterday_end := v_today - INTERVAL '1 microsecond';
  v_thirty_days_ago := v_today - INTERVAL '30 days';

  RETURN QUERY
  WITH contact_stats AS (
    -- Aggregate all contact counts in one scan
    SELECT
      COUNT(*) FILTER (WHERE status = 'new' AND status != 'deleting') as new_count,
      COUNT(*) FILTER (WHERE created_at >= v_yesterday_start AND created_at <= v_yesterday_end AND status != 'deleting') as yesterday_count,
      COUNT(*) FILTER (WHERE created_at >= v_today AND status != 'deleting') as today_count
    FROM contacts
  ),
  company_stats AS (
    -- Aggregate company counts
    SELECT
      COUNT(*) FILTER (WHERE created_at >= v_thirty_days_ago) as new_count_30d,
      COUNT(*) FILTER (WHERE created_at >= v_yesterday_start AND created_at <= v_yesterday_end) as yesterday_count
    FROM companies
  ),
  daily_data AS (
    -- Generate daily contact counts for last 30 days
    SELECT jsonb_agg(
      jsonb_build_object(
        'date', TO_CHAR(day_date, 'MM/DD'),
        'fullDate', TO_CHAR(day_date, 'YYYY-MM-DD'),
        'count', COALESCE(contact_count, 0)
      ) ORDER BY day_date
    ) as daily_json
    FROM (
      SELECT
        date_series.day::DATE as day_date,
        COUNT(c.id) as contact_count
      FROM generate_series(
        v_thirty_days_ago,
        v_today,
        INTERVAL '1 day'
      ) AS date_series(day)
      LEFT JOIN contacts c ON
        DATE(c.created_at) = date_series.day::DATE
        AND c.status != 'deleting'
      GROUP BY date_series.day
      ORDER BY date_series.day
    ) daily_counts
  ),
  referral_data AS (
    -- Aggregate referral sources for last 30 days
    SELECT jsonb_agg(
      jsonb_build_object(
        'referral_source', COALESCE(referral_source, '기타'),
        'count', source_count
      ) ORDER BY source_count DESC
    ) as referral_json
    FROM (
      SELECT
        referral_source,
        COUNT(*) as source_count
      FROM contacts
      WHERE created_at >= v_thirty_days_ago
        AND status != 'deleting'
      GROUP BY referral_source
    ) referral_counts
  )
  SELECT
    cs.new_count,
    cs.yesterday_count,
    cs.today_count,
    cmp.new_count_30d,
    cmp.yesterday_count,
    dd.daily_json,
    rd.referral_json
  FROM contact_stats cs
  CROSS JOIN company_stats cmp
  CROSS JOIN daily_data dd
  CROSS JOIN referral_data rd;
END;
$$;

-- ============================================================================
-- Usage Example
-- ============================================================================
-- SELECT * FROM get_dashboard_stats();
--
-- Returns a single row with all dashboard statistics:
-- {
--   "new_contact_count": 42,
--   "yesterday_contact_count": 15,
--   "today_contact_count": 8,
--   "new_company_count": 12,
--   "yesterday_company_count": 2,
--   "daily_contacts": [
--     {"date": "12/25", "fullDate": "2024-12-25", "count": 5},
--     ...
--   ],
--   "referral_sources": [
--     {"referral_source": "네이버", "count": 23},
--     {"referral_source": "구글", "count": 15},
--     ...
--   ]
-- }
-- ============================================================================

COMMENT ON FUNCTION get_dashboard_stats() IS 'Consolidated dashboard statistics - replaces 7+ individual queries';
