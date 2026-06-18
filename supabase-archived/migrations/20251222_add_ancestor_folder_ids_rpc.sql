-- 조상 폴더 ID 목록 조회 RPC 함수
-- 실시간 업데이트 시 정밀한 캐시 무효화에 사용

CREATE OR REPLACE FUNCTION get_ancestor_folder_ids(p_folder_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_ancestors UUID[] := '{}';
  v_current_id UUID;
BEGIN
  -- 시작 폴더의 parent_id 조회
  v_current_id := (SELECT parent_id FROM webhard_folders WHERE id = p_folder_id);

  -- 최대 50단계까지 조상 폴더 탐색 (무한 루프 방지)
  FOR i IN 1..50 LOOP
    EXIT WHEN v_current_id IS NULL;

    -- 현재 폴더 ID를 배열에 추가
    v_ancestors := array_append(v_ancestors, v_current_id);

    -- 다음 부모 폴더로 이동
    v_current_id := (SELECT parent_id FROM webhard_folders WHERE id = v_current_id);
  END LOOP;

  RETURN v_ancestors;
END;
$$;

-- 함수에 대한 코멘트
COMMENT ON FUNCTION get_ancestor_folder_ids(UUID) IS '특정 폴더의 모든 조상 폴더 ID를 배열로 반환합니다. 실시간 캐시 무효화에 사용됩니다.';

-- 인덱스 추가 (parent_id 조회 성능 향상)
CREATE INDEX IF NOT EXISTS idx_webhard_folders_parent_id ON webhard_folders(parent_id);
