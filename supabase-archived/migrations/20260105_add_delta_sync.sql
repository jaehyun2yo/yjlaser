-- Delta Sync 마이그레이션
-- 증분 동기화를 위한 상태 추적 테이블

-- 1. 동기화 상태 테이블
CREATE TABLE IF NOT EXISTS webhard_sync_state (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  last_sync_at TIMESTAMPTZ DEFAULT NOW(),
  last_sync_hash TEXT, -- 마지막 동기화 시점의 파일 해시
  files_synced INT DEFAULT 0,
  folders_synced INT DEFAULT 0,
  sync_type TEXT DEFAULT 'full', -- 'full' | 'delta'
  sync_status TEXT DEFAULT 'completed', -- 'in_progress' | 'completed' | 'failed'
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id)
);

-- 2. 동기화 히스토리 테이블 (로그용)
CREATE TABLE IF NOT EXISTS webhard_sync_history (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  company_id INT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  sync_started_at TIMESTAMPTZ DEFAULT NOW(),
  sync_completed_at TIMESTAMPTZ,
  sync_type TEXT NOT NULL, -- 'full' | 'delta'
  files_added INT DEFAULT 0,
  files_updated INT DEFAULT 0,
  files_deleted INT DEFAULT 0,
  folders_added INT DEFAULT 0,
  folders_deleted INT DEFAULT 0,
  total_size_bytes BIGINT DEFAULT 0,
  sync_status TEXT DEFAULT 'in_progress',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. 인덱스 추가
CREATE INDEX IF NOT EXISTS idx_sync_state_company
ON webhard_sync_state(company_id);

CREATE INDEX IF NOT EXISTS idx_sync_history_company
ON webhard_sync_history(company_id, sync_started_at DESC);

-- 4. Delta Sync를 위한 변경 파일 조회 함수
CREATE OR REPLACE FUNCTION get_changed_files_since(
  p_company_id INT,
  p_since_timestamp TIMESTAMPTZ
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  original_name TEXT,
  size BIGINT,
  mime_type TEXT,
  path TEXT,
  folder_id UUID,
  is_downloaded BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  change_type TEXT -- 'added' | 'updated' | 'deleted'
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    wf.id,
    wf.name,
    wf.original_name,
    wf.size,
    wf.mime_type,
    wf.path,
    wf.folder_id,
    wf.is_downloaded,
    wf.created_at,
    wf.updated_at,
    wf.deleted_at,
    CASE
      WHEN wf.created_at > p_since_timestamp AND wf.deleted_at IS NULL THEN 'added'
      WHEN wf.deleted_at > p_since_timestamp THEN 'deleted'
      WHEN wf.updated_at > p_since_timestamp AND wf.deleted_at IS NULL THEN 'updated'
    END AS change_type
  FROM webhard_files wf
  WHERE wf.company_id = p_company_id
    AND (
      wf.created_at > p_since_timestamp
      OR wf.updated_at > p_since_timestamp
      OR wf.deleted_at > p_since_timestamp
    )
  ORDER BY
    CASE
      WHEN wf.deleted_at IS NOT NULL THEN wf.deleted_at
      WHEN wf.updated_at > wf.created_at THEN wf.updated_at
      ELSE wf.created_at
    END DESC;
END;
$$ LANGUAGE plpgsql;

-- 5. Delta Sync를 위한 변경 폴더 조회 함수
CREATE OR REPLACE FUNCTION get_changed_folders_since(
  p_company_id INT,
  p_since_timestamp TIMESTAMPTZ
)
RETURNS TABLE(
  id UUID,
  name TEXT,
  parent_id UUID,
  path TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  change_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    wf.id,
    wf.name,
    wf.parent_id,
    wf.path,
    wf.created_at,
    wf.updated_at,
    wf.deleted_at,
    CASE
      WHEN wf.created_at > p_since_timestamp AND wf.deleted_at IS NULL THEN 'added'
      WHEN wf.deleted_at > p_since_timestamp THEN 'deleted'
      WHEN wf.updated_at > p_since_timestamp AND wf.deleted_at IS NULL THEN 'updated'
    END AS change_type
  FROM webhard_folders wf
  WHERE wf.company_id = p_company_id
    AND (
      wf.created_at > p_since_timestamp
      OR wf.updated_at > p_since_timestamp
      OR wf.deleted_at > p_since_timestamp
    )
  ORDER BY wf.path;
END;
$$ LANGUAGE plpgsql;

-- 6. 동기화 상태 업데이트 함수
CREATE OR REPLACE FUNCTION update_sync_state(
  p_company_id INT,
  p_sync_type TEXT,
  p_files_synced INT,
  p_folders_synced INT,
  p_status TEXT DEFAULT 'completed',
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO webhard_sync_state (
    company_id, last_sync_at, files_synced, folders_synced, sync_type, sync_status, error_message, updated_at
  )
  VALUES (
    p_company_id, NOW(), p_files_synced, p_folders_synced, p_sync_type, p_status, p_error_message, NOW()
  )
  ON CONFLICT (company_id)
  DO UPDATE SET
    last_sync_at = NOW(),
    files_synced = p_files_synced,
    folders_synced = p_folders_synced,
    sync_type = p_sync_type,
    sync_status = p_status,
    error_message = p_error_message,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- 7. 동기화 히스토리 기록 함수
CREATE OR REPLACE FUNCTION record_sync_history(
  p_company_id INT,
  p_sync_type TEXT,
  p_files_added INT DEFAULT 0,
  p_files_updated INT DEFAULT 0,
  p_files_deleted INT DEFAULT 0,
  p_folders_added INT DEFAULT 0,
  p_folders_deleted INT DEFAULT 0,
  p_total_size BIGINT DEFAULT 0,
  p_status TEXT DEFAULT 'completed',
  p_error_message TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  history_id UUID;
BEGIN
  INSERT INTO webhard_sync_history (
    company_id, sync_type, files_added, files_updated, files_deleted,
    folders_added, folders_deleted, total_size_bytes, sync_status,
    error_message, sync_completed_at
  )
  VALUES (
    p_company_id, p_sync_type, p_files_added, p_files_updated, p_files_deleted,
    p_folders_added, p_folders_deleted, p_total_size, p_status,
    p_error_message, CASE WHEN p_status = 'completed' THEN NOW() ELSE NULL END
  )
  RETURNING id INTO history_id;

  RETURN history_id;
END;
$$ LANGUAGE plpgsql;
