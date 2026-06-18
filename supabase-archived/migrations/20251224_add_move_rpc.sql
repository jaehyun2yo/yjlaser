-- =====================================================
-- 파일/폴더 이동용 RPC 함수
-- Created: 2024-12-24
-- Purpose: 배치 파일 이동 및 폴더 이동 (순환 참조 방지)
-- =====================================================

-- =====================================================
-- 1. 파일 배치 이동
-- 여러 파일을 한 번에 다른 폴더로 이동
-- =====================================================
CREATE OR REPLACE FUNCTION move_files_batch(
  p_file_ids UUID[],
  p_target_folder_id UUID,
  p_company_id BIGINT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  files_moved INT := 0;
  target_company_id BIGINT;
BEGIN
  -- 입력 검증
  IF p_file_ids IS NULL OR array_length(p_file_ids, 1) IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'No file IDs provided',
      'files_moved', 0
    );
  END IF;

  -- 대상 폴더 검증 (NULL이면 루트로 이동)
  IF p_target_folder_id IS NOT NULL THEN
    SELECT company_id INTO target_company_id
    FROM webhard_folders
    WHERE id = p_target_folder_id
      AND deleted_at IS NULL;

    IF target_company_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Target folder not found or deleted',
        'files_moved', 0
      );
    END IF;

    -- 회사 간 이동 방지
    IF p_company_id IS NOT NULL AND target_company_id != p_company_id THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Cannot move files to folder of different company',
        'files_moved', 0
      );
    END IF;
  END IF;

  -- 파일 이동 실행
  WITH moved AS (
    UPDATE webhard_files
    SET
      folder_id = p_target_folder_id,
      updated_at = NOW()
    WHERE id = ANY(p_file_ids)
      AND deleted_at IS NULL
      AND (p_company_id IS NULL OR company_id = p_company_id)
    RETURNING id
  )
  SELECT COUNT(*) INTO files_moved FROM moved;

  RETURN json_build_object(
    'success', true,
    'files_moved', files_moved
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 2. 폴더 이동 (순환 참조 방지)
-- 폴더를 다른 폴더로 이동 (자기 자신 또는 하위로 이동 불가)
-- =====================================================
CREATE OR REPLACE FUNCTION move_folder(
  p_folder_id UUID,
  p_target_folder_id UUID,
  p_company_id BIGINT DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  source_company_id BIGINT;
  target_company_id BIGINT;
  is_circular BOOLEAN := false;
BEGIN
  -- 입력 검증
  IF p_folder_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Folder ID is required'
    );
  END IF;

  -- 자기 자신으로 이동 방지
  IF p_folder_id = p_target_folder_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Cannot move folder into itself'
    );
  END IF;

  -- 원본 폴더 검증
  SELECT company_id INTO source_company_id
  FROM webhard_folders
  WHERE id = p_folder_id
    AND deleted_at IS NULL;

  IF source_company_id IS NULL THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Source folder not found or deleted'
    );
  END IF;

  -- 회사 권한 검증
  IF p_company_id IS NOT NULL AND source_company_id != p_company_id THEN
    RETURN json_build_object(
      'success', false,
      'error', 'Access denied to source folder'
    );
  END IF;

  -- 대상 폴더 검증 (NULL이면 루트로 이동)
  IF p_target_folder_id IS NOT NULL THEN
    SELECT company_id INTO target_company_id
    FROM webhard_folders
    WHERE id = p_target_folder_id
      AND deleted_at IS NULL;

    IF target_company_id IS NULL THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Target folder not found or deleted'
      );
    END IF;

    -- 회사 간 이동 방지
    IF source_company_id != target_company_id THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Cannot move folder to different company'
      );
    END IF;

    -- 순환 참조 검사: 대상 폴더가 원본 폴더의 하위인지 확인
    WITH RECURSIVE folder_ancestors AS (
      -- 시작: 대상 폴더
      SELECT id, parent_id FROM webhard_folders
      WHERE id = p_target_folder_id

      UNION ALL

      -- 재귀: 부모 폴더들
      SELECT wf.id, wf.parent_id FROM webhard_folders wf
      INNER JOIN folder_ancestors fa ON wf.id = fa.parent_id
    )
    SELECT EXISTS (
      SELECT 1 FROM folder_ancestors WHERE id = p_folder_id
    ) INTO is_circular;

    IF is_circular THEN
      RETURN json_build_object(
        'success', false,
        'error', 'Cannot move folder into its own subfolder (circular reference)'
      );
    END IF;
  END IF;

  -- 폴더 이동 실행
  UPDATE webhard_folders
  SET
    parent_id = p_target_folder_id,
    updated_at = NOW()
  WHERE id = p_folder_id
    AND deleted_at IS NULL;

  RETURN json_build_object(
    'success', true,
    'folder_id', p_folder_id,
    'new_parent_id', p_target_folder_id
  );
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 3. 권한 부여
-- =====================================================
GRANT EXECUTE ON FUNCTION move_files_batch(UUID[], UUID, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION move_folder(UUID, UUID, BIGINT) TO authenticated;

-- =====================================================
-- 4. 함수 설명
-- =====================================================
COMMENT ON FUNCTION move_files_batch IS '여러 파일을 한 번에 다른 폴더로 이동합니다.';
COMMENT ON FUNCTION move_folder IS '폴더를 다른 폴더로 이동합니다 (순환 참조 방지 포함).';
