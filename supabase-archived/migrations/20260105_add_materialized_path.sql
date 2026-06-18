-- Materialized Path 마이그레이션
-- 폴더 경로 조회 성능 최적화를 위해 path 컬럼 추가

-- 1. path 컬럼 추가
ALTER TABLE webhard_folders
ADD COLUMN IF NOT EXISTS path TEXT;

-- 2. path 컬럼 인덱스 추가 (LIKE 검색 최적화)
CREATE INDEX IF NOT EXISTS idx_webhard_folders_path
ON webhard_folders(path);

-- 3. GIN 인덱스 추가 (하위 폴더 검색 최적화)
CREATE INDEX IF NOT EXISTS idx_webhard_folders_path_gin
ON webhard_folders USING gin(path gin_trgm_ops);

-- 4. 폴더 경로 계산 함수
CREATE OR REPLACE FUNCTION calculate_folder_path(folder_id UUID)
RETURNS TEXT AS $$
DECLARE
  result_path TEXT := '';
  current_id UUID := folder_id;
  folder_name TEXT;
  parent_id UUID;
BEGIN
  -- 최대 20레벨까지 탐색 (무한 루프 방지)
  FOR i IN 1..20 LOOP
    SELECT name, webhard_folders.parent_id
    INTO folder_name, parent_id
    FROM webhard_folders
    WHERE id = current_id;

    IF folder_name IS NULL THEN
      EXIT;
    END IF;

    IF result_path = '' THEN
      result_path := folder_name;
    ELSE
      result_path := folder_name || '/' || result_path;
    END IF;

    IF parent_id IS NULL THEN
      EXIT;
    END IF;

    current_id := parent_id;
  END LOOP;

  RETURN '/' || result_path;
END;
$$ LANGUAGE plpgsql;

-- 5. 폴더 생성/업데이트 시 path 자동 업데이트 트리거 함수
CREATE OR REPLACE FUNCTION update_folder_path()
RETURNS TRIGGER AS $$
BEGIN
  NEW.path := calculate_folder_path(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 6. 트리거 생성 (INSERT/UPDATE 시 path 자동 계산)
DROP TRIGGER IF EXISTS trigger_update_folder_path ON webhard_folders;
CREATE TRIGGER trigger_update_folder_path
BEFORE INSERT OR UPDATE OF name, parent_id ON webhard_folders
FOR EACH ROW
EXECUTE FUNCTION update_folder_path();

-- 7. 하위 폴더들의 path 재계산 함수 (부모 폴더 이동/이름 변경 시)
CREATE OR REPLACE FUNCTION update_descendant_paths(folder_id UUID)
RETURNS VOID AS $$
DECLARE
  child_folder RECORD;
BEGIN
  -- 직접 하위 폴더들 조회
  FOR child_folder IN
    SELECT id FROM webhard_folders WHERE parent_id = folder_id
  LOOP
    -- 하위 폴더 path 업데이트 (트리거가 실행됨)
    UPDATE webhard_folders
    SET path = calculate_folder_path(child_folder.id)
    WHERE id = child_folder.id;

    -- 재귀적으로 하위의 하위 폴더도 업데이트
    PERFORM update_descendant_paths(child_folder.id);
  END LOOP;
END;
$$ LANGUAGE plpgsql;

-- 8. 부모 폴더 변경 시 하위 폴더들 path 자동 업데이트 트리거
CREATE OR REPLACE FUNCTION trigger_update_descendant_paths()
RETURNS TRIGGER AS $$
BEGIN
  -- 부모 폴더가 변경되었거나 이름이 변경된 경우
  IF OLD.parent_id IS DISTINCT FROM NEW.parent_id OR OLD.name <> NEW.name THEN
    PERFORM update_descendant_paths(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_descendant_paths ON webhard_folders;
CREATE TRIGGER trigger_update_descendant_paths
AFTER UPDATE OF name, parent_id ON webhard_folders
FOR EACH ROW
EXECUTE FUNCTION trigger_update_descendant_paths();

-- 9. 기존 폴더들의 path 백필
UPDATE webhard_folders
SET path = calculate_folder_path(id)
WHERE path IS NULL;

-- 10. 폴더 경로로 빠르게 조상 조회하는 RPC 함수
CREATE OR REPLACE FUNCTION get_folder_ancestors_fast(folder_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  parent_id UUID,
  path TEXT,
  depth INT
) AS $$
DECLARE
  folder_path TEXT;
  path_parts TEXT[];
BEGIN
  -- 폴더의 path 조회
  SELECT wf.path INTO folder_path
  FROM webhard_folders wf
  WHERE wf.id = folder_id;

  IF folder_path IS NULL THEN
    RETURN;
  END IF;

  -- path를 분해하여 조상들 조회
  RETURN QUERY
  WITH path_folders AS (
    SELECT
      wf.id,
      wf.name,
      wf.parent_id,
      wf.path,
      array_position(string_to_array(folder_path, '/'), wf.name) AS depth
    FROM webhard_folders wf
    WHERE folder_path LIKE '%' || wf.name || '%'
      AND wf.path IS NOT NULL
      AND folder_path LIKE wf.path || '%'
    ORDER BY length(wf.path)
  )
  SELECT * FROM path_folders;
END;
$$ LANGUAGE plpgsql;

-- 11. 하위 폴더 빠르게 조회하는 RPC 함수
CREATE OR REPLACE FUNCTION get_folder_descendants_fast(folder_id UUID)
RETURNS TABLE(
  id UUID,
  name TEXT,
  parent_id UUID,
  company_id INT,
  path TEXT,
  created_at TIMESTAMPTZ
) AS $$
DECLARE
  parent_path TEXT;
BEGIN
  -- 부모 폴더의 path 조회
  SELECT wf.path INTO parent_path
  FROM webhard_folders wf
  WHERE wf.id = folder_id;

  IF parent_path IS NULL THEN
    RETURN;
  END IF;

  -- path가 부모 path로 시작하는 모든 폴더 조회
  RETURN QUERY
  SELECT
    wf.id,
    wf.name,
    wf.parent_id,
    wf.company_id,
    wf.path,
    wf.created_at
  FROM webhard_folders wf
  WHERE wf.path LIKE parent_path || '/%'
    AND wf.deleted_at IS NULL
  ORDER BY wf.path;
END;
$$ LANGUAGE plpgsql;
