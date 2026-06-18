-- Batch Delete RPC Functions
-- Created: 2025-12-23
-- Purpose: 다중 폴더/파일 배치 삭제 성능 최적화

-- =====================================================
-- 1. 다중 폴더 일괄 삭제 함수 (관리자 전용)
-- =====================================================
CREATE OR REPLACE FUNCTION delete_folders_batch(
  p_folder_ids UUID[],
  p_deleted_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSON AS $$
DECLARE
  all_folder_ids UUID[];
  folders_deleted INT := 0;
  files_deleted INT := 0;
  processed_count INT := 0;
BEGIN
  -- 입력 검증
  IF p_folder_ids IS NULL OR array_length(p_folder_ids, 1) IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No folder IDs provided',
      'folders_deleted', 0,
      'files_deleted', 0
    );
  END IF;

  -- 모든 폴더와 하위 폴더 ID 수집
  WITH RECURSIVE folder_tree AS (
    -- Base case: 선택된 폴더들
    SELECT id
    FROM webhard_folders
    WHERE id = ANY(p_folder_ids)
      AND deleted_at IS NULL
    UNION ALL
    -- Recursive case: 모든 하위 폴더
    SELECT wf.id
    FROM webhard_folders wf
    INNER JOIN folder_tree ft ON wf.parent_id = ft.id
    WHERE wf.deleted_at IS NULL
  )
  SELECT ARRAY_AGG(DISTINCT id) INTO all_folder_ids FROM folder_tree;

  -- 폴더가 없으면 종료
  IF all_folder_ids IS NULL OR array_length(all_folder_ids, 1) IS NULL THEN
    RETURN json_build_object(
      'success', true,
      'folders_deleted', 0,
      'files_deleted', 0,
      'message', 'No folders found to delete'
    );
  END IF;

  -- 모든 파일 soft delete (단일 쿼리)
  WITH deleted_files AS (
    UPDATE webhard_files
    SET deleted_at = p_deleted_at
    WHERE folder_id = ANY(all_folder_ids)
      AND deleted_at IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO files_deleted FROM deleted_files;

  -- 모든 폴더 soft delete (단일 쿼리)
  WITH deleted_folders AS (
    UPDATE webhard_folders
    SET deleted_at = p_deleted_at
    WHERE id = ANY(all_folder_ids)
      AND deleted_at IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO folders_deleted FROM deleted_folders;

  RETURN json_build_object(
    'success', true,
    'folders_deleted', folders_deleted,
    'files_deleted', files_deleted,
    'root_folders_count', array_length(p_folder_ids, 1)
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. 다중 파일 일괄 삭제 함수
-- =====================================================
CREATE OR REPLACE FUNCTION delete_files_batch(
  p_file_ids UUID[],
  p_deleted_at TIMESTAMPTZ DEFAULT NOW(),
  p_deleted_by INT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  files_deleted INT := 0;
BEGIN
  -- 입력 검증
  IF p_file_ids IS NULL OR array_length(p_file_ids, 1) IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No file IDs provided',
      'files_deleted', 0
    );
  END IF;

  -- 모든 파일 soft delete (단일 쿼리)
  WITH deleted_files AS (
    UPDATE webhard_files
    SET
      deleted_at = p_deleted_at,
      deleted_by = p_deleted_by
    WHERE id = ANY(p_file_ids)
      AND deleted_at IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO files_deleted FROM deleted_files;

  RETURN json_build_object(
    'success', true,
    'files_deleted', files_deleted
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. 다중 폴더 삭제 통계 조회 함수
-- =====================================================
CREATE OR REPLACE FUNCTION get_folders_delete_stats(p_folder_ids UUID[])
RETURNS JSON AS $$
DECLARE
  result JSON;
  all_folder_ids UUID[];
BEGIN
  -- 모든 폴더와 하위 폴더 ID 수집
  WITH RECURSIVE folder_tree AS (
    SELECT id
    FROM webhard_folders
    WHERE id = ANY(p_folder_ids)
      AND deleted_at IS NULL
    UNION ALL
    SELECT wf.id
    FROM webhard_folders wf
    INNER JOIN folder_tree ft ON wf.parent_id = ft.id
    WHERE wf.deleted_at IS NULL
  )
  SELECT ARRAY_AGG(DISTINCT id) INTO all_folder_ids FROM folder_tree;

  IF all_folder_ids IS NULL THEN
    RETURN json_build_object(
      'folder_count', 0,
      'file_count', 0,
      'root_count', 0
    );
  END IF;

  SELECT json_build_object(
    'folder_count', array_length(all_folder_ids, 1),
    'file_count', (
      SELECT COUNT(*)
      FROM webhard_files
      WHERE folder_id = ANY(all_folder_ids)
        AND deleted_at IS NULL
    ),
    'root_count', array_length(p_folder_ids, 1)
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql STABLE;

-- =====================================================
-- 4. 회사별 전체 폴더/파일 삭제 함수 (관리자 전용)
-- =====================================================
CREATE OR REPLACE FUNCTION delete_company_webhard(
  p_company_id INT,
  p_deleted_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSON AS $$
DECLARE
  folders_deleted INT := 0;
  files_deleted INT := 0;
BEGIN
  -- 모든 파일 soft delete
  WITH deleted_files AS (
    UPDATE webhard_files
    SET deleted_at = p_deleted_at
    WHERE company_id = p_company_id
      AND deleted_at IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO files_deleted FROM deleted_files;

  -- 모든 폴더 soft delete
  WITH deleted_folders AS (
    UPDATE webhard_folders
    SET deleted_at = p_deleted_at
    WHERE company_id = p_company_id
      AND deleted_at IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO folders_deleted FROM deleted_folders;

  RETURN json_build_object(
    'success', true,
    'company_id', p_company_id,
    'folders_deleted', folders_deleted,
    'files_deleted', files_deleted
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 5. 권한 부여
-- =====================================================
GRANT EXECUTE ON FUNCTION delete_folders_batch(UUID[], TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_files_batch(UUID[], TIMESTAMPTZ, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_folders_delete_stats(UUID[]) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_company_webhard(INT, TIMESTAMPTZ) TO authenticated;

-- =====================================================
-- 6. 함수 설명
-- =====================================================
COMMENT ON FUNCTION delete_folders_batch IS '다중 폴더와 모든 하위 폴더/파일을 일괄 soft delete합니다. 관리자 전용.';
COMMENT ON FUNCTION delete_files_batch IS '다중 파일을 일괄 soft delete합니다.';
COMMENT ON FUNCTION get_folders_delete_stats IS '다중 폴더의 삭제 통계(폴더/파일 수)를 조회합니다.';
COMMENT ON FUNCTION delete_company_webhard IS '특정 회사의 모든 웹하드 데이터를 일괄 soft delete합니다. 관리자 전용.';
