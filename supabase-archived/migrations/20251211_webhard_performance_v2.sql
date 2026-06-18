-- Webhard Performance Optimization V2
-- Created: 2025-12-11
-- Purpose: Additional performance improvements for webhard system

-- 1. Global undownloaded count RPC (for WebhardBadge component)
-- This optimizes the /api/webhard/undownloaded-count endpoint
CREATE OR REPLACE FUNCTION count_all_undownloaded_files(p_company_id INTEGER DEFAULT NULL)
RETURNS BIGINT AS $$
  SELECT COUNT(*)::BIGINT
  FROM webhard_files
  WHERE is_downloaded = false
    AND created_at >= NOW() - INTERVAL '24 hours'
    AND deleted_at IS NULL
    AND (p_company_id IS NULL OR company_id = p_company_id);
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION count_all_undownloaded_files IS
'Counts all undownloaded files created within 24 hours. Used for badge display.
Optionally filters by company_id for company users.';

-- 2. Batch folder ancestors RPC (for search API path reconstruction)
-- This replaces the N+1 query pattern in search/route.ts
CREATE OR REPLACE FUNCTION get_folder_ancestors_batch(p_folder_ids UUID[])
RETURNS TABLE(id UUID, name TEXT, parent_id UUID) AS $$
WITH RECURSIVE ancestors AS (
  -- Base case: start with the requested folders
  SELECT f.id, f.name, f.parent_id
  FROM webhard_folders f
  WHERE f.id = ANY(p_folder_ids) AND f.deleted_at IS NULL
  UNION
  -- Recursive case: get parent folders
  SELECT f.id, f.name, f.parent_id
  FROM webhard_folders f
  INNER JOIN ancestors a ON f.id = a.parent_id
  WHERE f.deleted_at IS NULL
)
SELECT DISTINCT a.id, a.name, a.parent_id FROM ancestors a;
$$ LANGUAGE SQL STABLE;

COMMENT ON FUNCTION get_folder_ancestors_batch IS
'Fetches all ancestor folders for multiple folder IDs in a single query.
Used to build folder paths in search results without N+1 queries.';

-- 3. Sorting indexes for file listing
-- These support server-side sorting by name and size

-- Name sorting index (for Korean locale)
CREATE INDEX IF NOT EXISTS idx_webhard_files_sort_name
  ON webhard_files(company_id, folder_id, original_name)
  WHERE deleted_at IS NULL;

-- Size sorting index (descending for largest-first default)
CREATE INDEX IF NOT EXISTS idx_webhard_files_sort_size
  ON webhard_files(company_id, folder_id, size DESC)
  WHERE deleted_at IS NULL;

-- 4. Additional index for date + folder combined queries
CREATE INDEX IF NOT EXISTS idx_webhard_files_folder_date_desc
  ON webhard_files(company_id, folder_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION count_all_undownloaded_files TO authenticated;
GRANT EXECUTE ON FUNCTION count_all_undownloaded_files TO anon;
GRANT EXECUTE ON FUNCTION get_folder_ancestors_batch TO authenticated;
GRANT EXECUTE ON FUNCTION get_folder_ancestors_batch TO anon;
