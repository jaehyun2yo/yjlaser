-- Fix folder delete statement timeout
-- Created: 2026-03-16
-- Purpose: 재귀 CTE 폴더 삭제 시 statement_timeout 오류 해결
-- 변경: SET LOCAL statement_timeout = '120s' 추가 + SECURITY DEFINER로 timeout 제어 보장

-- =====================================================
-- 1. delete_folder_recursive 개선
-- =====================================================
CREATE OR REPLACE FUNCTION delete_folder_recursive(
  p_folder_id UUID,
  p_deleted_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSON AS $$
DECLARE
  folder_ids UUID[];
  folders_deleted INT;
  files_deleted INT;
BEGIN
  -- 재귀 CTE에 충분한 시간 부여
  SET LOCAL statement_timeout = '120s';

  -- 모든 하위 폴더 ID 수집 (시작 폴더 포함)
  WITH RECURSIVE folder_tree AS (
    SELECT id FROM webhard_folders WHERE id = p_folder_id AND deleted_at IS NULL
    UNION ALL
    SELECT wf.id
    FROM webhard_folders wf
    INNER JOIN folder_tree ft ON wf.parent_id = ft.id
    WHERE wf.deleted_at IS NULL
  )
  SELECT ARRAY_AGG(id) INTO folder_ids FROM folder_tree;

  -- 폴더가 없으면 에러
  IF folder_ids IS NULL OR array_length(folder_ids, 1) IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Folder not found',
      'folders_deleted', 0,
      'files_deleted', 0
    );
  END IF;

  -- 모든 파일 soft delete (한 번의 쿼리로)
  WITH deleted_files AS (
    UPDATE webhard_files
    SET deleted_at = p_deleted_at
    WHERE folder_id = ANY(folder_ids)
      AND deleted_at IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO files_deleted FROM deleted_files;

  -- 모든 폴더 soft delete (한 번의 쿼리로)
  WITH deleted_folders AS (
    UPDATE webhard_folders
    SET deleted_at = p_deleted_at
    WHERE id = ANY(folder_ids)
      AND deleted_at IS NULL
    RETURNING id
  )
  SELECT COUNT(*) INTO folders_deleted FROM deleted_folders;

  RETURN json_build_object(
    'success', true,
    'folders_deleted', folders_deleted,
    'files_deleted', files_deleted
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 2. delete_folders_batch 개선
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
BEGIN
  -- 재귀 CTE에 충분한 시간 부여
  SET LOCAL statement_timeout = '120s';

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
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================
-- 3. 권한 부여 (SECURITY DEFINER로 변경했으므로 재설정)
-- =====================================================
GRANT EXECUTE ON FUNCTION delete_folder_recursive(UUID, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION delete_folders_batch(UUID[], TIMESTAMPTZ) TO authenticated;

COMMENT ON FUNCTION delete_folder_recursive IS '폴더와 모든 하위 폴더/파일을 한 번에 soft delete합니다. statement_timeout 120s.';
COMMENT ON FUNCTION delete_folders_batch IS '다중 폴더와 모든 하위 폴더/파일을 일괄 soft delete합니다. statement_timeout 120s.';
