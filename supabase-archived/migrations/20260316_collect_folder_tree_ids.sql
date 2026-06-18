CREATE OR REPLACE FUNCTION collect_folder_tree_ids(p_folder_id UUID)
RETURNS UUID[] AS $$
DECLARE
  result UUID[];
BEGIN
  WITH RECURSIVE folder_tree AS (
    SELECT id FROM webhard_folders WHERE id = p_folder_id AND deleted_at IS NULL
    UNION ALL
    SELECT wf.id
    FROM webhard_folders wf
    INNER JOIN folder_tree ft ON wf.parent_id = ft.id
    WHERE wf.deleted_at IS NULL
  )
  SELECT ARRAY_AGG(id) INTO result FROM folder_tree;

  RETURN COALESCE(result, ARRAY[]::UUID[]);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION collect_folder_tree_ids(UUID) TO authenticated;
COMMENT ON FUNCTION collect_folder_tree_ids IS '폴더의 모든 하위 폴더 ID를 재귀적으로 수집합니다 (읽기 전용).';
