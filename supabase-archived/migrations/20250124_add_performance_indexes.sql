-- Performance Optimization: Add indexes for common query patterns
-- Created: 2025-01-24
-- Purpose: Optimize contacts table queries for dashboard and list views

-- ============================================================================
-- Composite Index: Most common query pattern (status + created_at)
-- ============================================================================
-- Optimizes queries like: WHERE status = 'new' ORDER BY created_at DESC
-- Expected improvement: 60-80% faster on filtered + sorted queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_status_created_at
ON contacts(status, created_at DESC);

-- ============================================================================
-- BRIN Index: Date range queries (dashboard statistics)
-- ============================================================================
-- Optimizes queries like: WHERE created_at >= '2024-01-01'
-- BRIN indexes are ideal for monotonically increasing columns (timestamps, IDs)
-- Uses much less space than B-tree indexes
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_created_at_brin
ON contacts USING brin(created_at)
WITH (pages_per_range = 128);

-- ============================================================================
-- Text Pattern Index: inquiry_number LIKE queries
-- ============================================================================
-- Optimizes queries like: WHERE inquiry_number LIKE '20250124-%'
-- text_pattern_ops enables index usage for LIKE 'prefix%' queries
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_inquiry_number_pattern
ON contacts(inquiry_number text_pattern_ops);

-- ============================================================================
-- Partial Index: Active contacts (most frequently accessed)
-- ============================================================================
-- Optimizes queries on active statuses (new, read, contacted)
-- Smaller index size, faster queries for common cases
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_active_status_created_at
ON contacts(status, created_at DESC)
WHERE status IN ('new', 'read', 'contacted', 'in_progress');

-- ============================================================================
-- Index for email lookups (case-insensitive)
-- ============================================================================
-- Drop existing case-sensitive email index
DROP INDEX CONCURRENTLY IF EXISTS idx_contacts_email;

-- Create case-insensitive email index
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_contacts_email_lower
ON contacts(LOWER(email));

-- ============================================================================
-- Verification Queries
-- ============================================================================
-- After applying this migration, run these queries to verify index usage:

-- 1. Check index sizes:
-- SELECT
--   schemaname,
--   tablename,
--   indexname,
--   pg_size_pretty(pg_relation_size(indexrelid)) as index_size
-- FROM pg_indexes
-- JOIN pg_class ON pg_indexes.indexname = pg_class.relname
-- WHERE tablename = 'contacts'
-- ORDER BY pg_relation_size(indexrelid) DESC;

-- 2. Test query performance with EXPLAIN ANALYZE:
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT * FROM contacts
-- WHERE status = 'new'
-- ORDER BY created_at DESC
-- LIMIT 50;

-- Expected: Index Scan using idx_contacts_status_created_at
-- ============================================================================

COMMENT ON INDEX idx_contacts_status_created_at IS 'Composite index for status filtering with date ordering';
COMMENT ON INDEX idx_contacts_created_at_brin IS 'BRIN index for date range queries in dashboard';
COMMENT ON INDEX idx_contacts_inquiry_number_pattern IS 'Pattern index for inquiry number prefix searches';
COMMENT ON INDEX idx_contacts_active_status_created_at IS 'Partial index for frequently accessed active contacts';
COMMENT ON INDEX idx_contacts_email_lower IS 'Case-insensitive email lookup index';
