-- 휴지통 시스템 타입 수정 마이그레이션
-- uploaded_by 컬럼 타입을 BIGINT로 수정 (실제 DB 스키마와 일치)

-- 기존 함수 삭제 후 재생성
DROP FUNCTION IF EXISTS get_trash_files(BIGINT, INTEGER, INTEGER);
DROP FUNCTION IF EXISTS get_trash_count(BIGINT);
DROP FUNCTION IF EXISTS restore_file_from_trash(UUID);
DROP FUNCTION IF EXISTS get_files_to_permanently_delete();
DROP FUNCTION IF EXISTS permanently_delete_expired_files();
DROP FUNCTION IF EXISTS permanently_delete_file(UUID);
DROP FUNCTION IF EXISTS empty_trash(BIGINT);
DROP FUNCTION IF EXISTS execute_empty_trash(BIGINT);

-- 1. 휴지통 파일 조회 함수 (uploaded_by를 BIGINT로 수정)
CREATE OR REPLACE FUNCTION get_trash_files(
  p_company_id BIGINT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  original_name TEXT,
  size BIGINT,
  mime_type TEXT,
  path TEXT,
  folder_id UUID,
  company_id BIGINT,
  uploaded_by BIGINT,
  inquiry_number TEXT,
  is_downloaded BOOLEAN,
  created_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  deleted_by BIGINT,
  days_until_permanent_delete INTEGER,
  company_name TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.name,
    f.original_name,
    f.size,
    f.mime_type,
    f.path,
    f.folder_id,
    f.company_id,
    f.uploaded_by,
    f.inquiry_number,
    f.is_downloaded,
    f.created_at,
    f.deleted_at,
    f.deleted_by,
    GREATEST(0, 3 - EXTRACT(DAY FROM NOW() - f.deleted_at)::INTEGER) AS days_until_permanent_delete,
    c.company_name
  FROM webhard_files f
  LEFT JOIN companies c ON f.company_id = c.id
  WHERE f.deleted_at IS NOT NULL
    AND f.deleted_at > NOW() - INTERVAL '3 days'
    AND (p_company_id IS NULL OR f.company_id = p_company_id)
  ORDER BY f.deleted_at DESC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql;

-- 2. 휴지통 파일 개수 조회 함수
CREATE OR REPLACE FUNCTION get_trash_count(
  p_company_id BIGINT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*)::INTEGER INTO v_count
  FROM webhard_files
  WHERE deleted_at IS NOT NULL
    AND deleted_at > NOW() - INTERVAL '3 days'
    AND (p_company_id IS NULL OR company_id = p_company_id);

  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 3. 파일 복원 함수 (휴지통에서 복원)
CREATE OR REPLACE FUNCTION restore_file_from_trash(
  p_file_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_success BOOLEAN;
BEGIN
  UPDATE webhard_files
  SET deleted_at = NULL, deleted_by = NULL
  WHERE id = p_file_id
    AND deleted_at IS NOT NULL;

  v_success := FOUND;
  RETURN v_success;
END;
$$ LANGUAGE plpgsql;

-- 4. 3일 경과 파일 영구 삭제 함수 (스토리지 파일 삭제는 애플리케이션에서 처리)
CREATE OR REPLACE FUNCTION get_files_to_permanently_delete()
RETURNS TABLE (
  id UUID,
  path TEXT,
  company_id BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT f.id, f.path, f.company_id
  FROM webhard_files f
  WHERE f.deleted_at IS NOT NULL
    AND f.deleted_at <= NOW() - INTERVAL '3 days';
END;
$$ LANGUAGE plpgsql;

-- 5. 3일 경과 파일 DB에서 영구 삭제
CREATE OR REPLACE FUNCTION permanently_delete_expired_files()
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM webhard_files
  WHERE deleted_at IS NOT NULL
    AND deleted_at <= NOW() - INTERVAL '3 days';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- 6. 특정 파일 영구 삭제 함수 (관리자 전용)
CREATE OR REPLACE FUNCTION permanently_delete_file(
  p_file_id UUID
)
RETURNS BOOLEAN AS $$
DECLARE
  v_success BOOLEAN;
BEGIN
  DELETE FROM webhard_files
  WHERE id = p_file_id
    AND deleted_at IS NOT NULL;

  v_success := FOUND;
  RETURN v_success;
END;
$$ LANGUAGE plpgsql;

-- 7. 휴지통 비우기 함수 (관리자 전용, 특정 회사 또는 전체)
CREATE OR REPLACE FUNCTION empty_trash(
  p_company_id BIGINT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  path TEXT
) AS $$
BEGIN
  -- 먼저 삭제할 파일 정보 반환 (스토리지 삭제용)
  RETURN QUERY
  SELECT f.id, f.path
  FROM webhard_files f
  WHERE f.deleted_at IS NOT NULL
    AND (p_company_id IS NULL OR f.company_id = p_company_id);
END;
$$ LANGUAGE plpgsql;

-- 8. 휴지통 비우기 실행 함수
CREATE OR REPLACE FUNCTION execute_empty_trash(
  p_company_id BIGINT DEFAULT NULL
)
RETURNS INTEGER AS $$
DECLARE
  v_count INTEGER;
BEGIN
  DELETE FROM webhard_files
  WHERE deleted_at IS NOT NULL
    AND (p_company_id IS NULL OR company_id = p_company_id);

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql;
