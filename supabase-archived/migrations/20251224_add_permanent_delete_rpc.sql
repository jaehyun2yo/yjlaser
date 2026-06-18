-- =====================================================
-- 영구 삭제용 RPC 함수
-- Created: 2024-12-24
-- Purpose: R2 삭제를 위한 경로 수집 + DB 영구 삭제 통합
-- =====================================================

-- =====================================================
-- 1. 파일 영구 삭제 (경로 반환)
-- 파일 경로를 먼저 수집한 후 DB에서 삭제
-- =====================================================
CREATE OR REPLACE FUNCTION permanent_delete_files_with_paths(
  p_file_ids UUID[]
)
RETURNS JSON AS $$
DECLARE
  file_paths TEXT[];
  files_deleted INT := 0;
BEGIN
  -- 입력 검증
  IF p_file_ids IS NULL OR array_length(p_file_ids, 1) IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No file IDs provided',
      'files_deleted', 0,
      'paths', ARRAY[]::TEXT[]
    );
  END IF;

  -- 삭제할 파일의 path 수집 (deleted_at이 있는 파일만 = 휴지통에 있는 파일)
  SELECT ARRAY_AGG(path) INTO file_paths
  FROM webhard_files
  WHERE id = ANY(p_file_ids)
    AND deleted_at IS NOT NULL
    AND path IS NOT NULL
    AND path != '';

  -- DB에서 영구 삭제
  WITH deleted AS (
    DELETE FROM webhard_files
    WHERE id = ANY(p_file_ids)
      AND deleted_at IS NOT NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO files_deleted FROM deleted;

  RETURN json_build_object(
    'success', true,
    'files_deleted', files_deleted,
    'paths', COALESCE(file_paths, ARRAY[]::TEXT[])
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. 휴지통 파일 청크 조회 (페이지네이션)
-- R2 삭제를 위해 ID와 path를 함께 조회
-- =====================================================
CREATE OR REPLACE FUNCTION get_trash_files_chunk(
  p_company_id BIGINT DEFAULT NULL,
  p_limit INT DEFAULT 1000,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  path TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT f.id, f.path
  FROM webhard_files f
  WHERE f.deleted_at IS NOT NULL
    AND (p_company_id IS NULL OR f.company_id = p_company_id)
    AND f.path IS NOT NULL
    AND f.path != ''
  ORDER BY f.deleted_at ASC
  LIMIT p_limit
  OFFSET p_offset;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- 3. 폴더 영구 삭제 (하위 파일 경로 반환)
-- 폴더와 모든 하위 폴더/파일을 영구 삭제하고 경로 반환
-- =====================================================
CREATE OR REPLACE FUNCTION permanent_delete_folders_with_paths(
  p_folder_ids UUID[]
)
RETURNS JSON AS $$
DECLARE
  all_folder_ids UUID[];
  file_paths TEXT[];
  folders_deleted INT := 0;
  files_deleted INT := 0;
BEGIN
  -- 입력 검증
  IF p_folder_ids IS NULL OR array_length(p_folder_ids, 1) IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No folder IDs provided',
      'folders_deleted', 0,
      'files_deleted', 0,
      'paths', ARRAY[]::TEXT[]
    );
  END IF;

  -- 모든 하위 폴더 수집 (deleted_at이 있는 것만)
  WITH RECURSIVE folder_tree AS (
    SELECT id FROM webhard_folders
    WHERE id = ANY(p_folder_ids) AND deleted_at IS NOT NULL
    UNION ALL
    SELECT wf.id FROM webhard_folders wf
    INNER JOIN folder_tree ft ON wf.parent_id = ft.id
    WHERE wf.deleted_at IS NOT NULL
  )
  SELECT ARRAY_AGG(DISTINCT id) INTO all_folder_ids FROM folder_tree;

  -- 폴더가 없으면 종료
  IF all_folder_ids IS NULL OR array_length(all_folder_ids, 1) IS NULL THEN
    RETURN json_build_object(
      'success', true,
      'folders_deleted', 0,
      'files_deleted', 0,
      'paths', ARRAY[]::TEXT[],
      'message', 'No deleted folders found'
    );
  END IF;

  -- 파일 경로 수집
  SELECT ARRAY_AGG(path) INTO file_paths
  FROM webhard_files
  WHERE folder_id = ANY(all_folder_ids)
    AND deleted_at IS NOT NULL
    AND path IS NOT NULL
    AND path != '';

  -- 파일 영구 삭제
  WITH deleted_files AS (
    DELETE FROM webhard_files
    WHERE folder_id = ANY(all_folder_ids)
      AND deleted_at IS NOT NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO files_deleted FROM deleted_files;

  -- 폴더 영구 삭제
  WITH deleted_folders AS (
    DELETE FROM webhard_folders
    WHERE id = ANY(all_folder_ids)
      AND deleted_at IS NOT NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO folders_deleted FROM deleted_folders;

  RETURN json_build_object(
    'success', true,
    'folders_deleted', folders_deleted,
    'files_deleted', files_deleted,
    'paths', COALESCE(file_paths, ARRAY[]::TEXT[])
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 4. 휴지통 전체 비우기 (경로 반환)
-- 모든 삭제된 파일의 경로를 반환하고 DB에서 삭제
-- =====================================================
CREATE OR REPLACE FUNCTION empty_trash_with_paths(
  p_company_id BIGINT DEFAULT NULL,
  p_limit INT DEFAULT 1000
)
RETURNS JSON AS $$
DECLARE
  file_paths TEXT[];
  files_deleted INT := 0;
BEGIN
  -- 삭제할 파일의 path 수집
  SELECT ARRAY_AGG(path) INTO file_paths
  FROM (
    SELECT path
    FROM webhard_files
    WHERE deleted_at IS NOT NULL
      AND (p_company_id IS NULL OR company_id = p_company_id)
      AND path IS NOT NULL
      AND path != ''
    LIMIT p_limit
  ) sub;

  -- DB에서 영구 삭제
  WITH deleted AS (
    DELETE FROM webhard_files
    WHERE id IN (
      SELECT id
      FROM webhard_files
      WHERE deleted_at IS NOT NULL
        AND (p_company_id IS NULL OR company_id = p_company_id)
      LIMIT p_limit
    )
    RETURNING id
  )
  SELECT COUNT(*) INTO files_deleted FROM deleted;

  RETURN json_build_object(
    'success', true,
    'files_deleted', files_deleted,
    'paths', COALESCE(file_paths, ARRAY[]::TEXT[]),
    'has_more', files_deleted = p_limit
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. 휴지통 파일 개수 조회
-- =====================================================
CREATE OR REPLACE FUNCTION get_trash_count(
  p_company_id BIGINT DEFAULT NULL
)
RETURNS INT AS $$
DECLARE
  total_count INT;
BEGIN
  SELECT COUNT(*) INTO total_count
  FROM webhard_files
  WHERE deleted_at IS NOT NULL
    AND (p_company_id IS NULL OR company_id = p_company_id);

  RETURN total_count;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- 6. 권한 부여
-- =====================================================
GRANT EXECUTE ON FUNCTION permanent_delete_files_with_paths(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION get_trash_files_chunk(BIGINT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION permanent_delete_folders_with_paths(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION empty_trash_with_paths(BIGINT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_trash_count(BIGINT) TO authenticated;

-- =====================================================
-- 7. 함수 설명
-- =====================================================
COMMENT ON FUNCTION permanent_delete_files_with_paths IS '파일 ID 배열을 받아 R2 경로를 수집하고 DB에서 영구 삭제합니다.';
COMMENT ON FUNCTION get_trash_files_chunk IS '휴지통 파일을 페이지네이션으로 조회합니다 (ID, path).';
COMMENT ON FUNCTION permanent_delete_folders_with_paths IS '폴더와 모든 하위 항목을 영구 삭제하고 파일 경로를 반환합니다.';
COMMENT ON FUNCTION empty_trash_with_paths IS '휴지통을 비우고 삭제된 파일 경로를 반환합니다.';
COMMENT ON FUNCTION get_trash_count IS '휴지통 파일 개수를 조회합니다.';
