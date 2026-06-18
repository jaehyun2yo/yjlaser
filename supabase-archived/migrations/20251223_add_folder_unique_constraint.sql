-- Add unique constraint to prevent duplicate folders
-- Created: 2025-12-23
-- Purpose: 동일한 위치에 같은 이름의 폴더가 중복 생성되는 것을 방지

-- 먼저 기존 중복 데이터 확인 및 정리 (soft delete된 것 제외)
-- 중복이 있으면 가장 오래된 것만 남기고 나머지는 soft delete
WITH duplicates AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY name, COALESCE(parent_id::text, 'NULL'), COALESCE(company_id::text, 'NULL')
      ORDER BY created_at ASC
    ) as rn
  FROM webhard_folders
  WHERE deleted_at IS NULL
)
UPDATE webhard_folders
SET deleted_at = NOW()
WHERE id IN (
  SELECT id FROM duplicates WHERE rn > 1
);

-- Unique partial index 생성 (deleted_at IS NULL인 것만 대상)
-- parent_id와 company_id가 NULL일 수 있으므로 COALESCE 사용
CREATE UNIQUE INDEX IF NOT EXISTS idx_webhard_folders_unique_name
ON webhard_folders (name, COALESCE(parent_id::text, 'NULL'), COALESCE(company_id::text, 'NULL'))
WHERE deleted_at IS NULL;

-- Comment
COMMENT ON INDEX idx_webhard_folders_unique_name IS '동일한 위치(parent_id, company_id)에 같은 이름의 폴더가 중복 생성되는 것을 방지하는 unique index';
