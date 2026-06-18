-- company_storage 테이블: 업체별 저장공간 사용량 실시간 추적
CREATE TABLE IF NOT EXISTS company_storage (
  company_id INT PRIMARY KEY,
  used_bytes BIGINT NOT NULL DEFAULT 0,
  file_count INT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 초기 데이터 적재 (기존 파일 데이터 기반)
INSERT INTO company_storage (company_id, used_bytes, file_count)
SELECT
  COALESCE(company_id, 0),
  COALESCE(SUM(size), 0),
  COUNT(*)
FROM webhard_files
WHERE deleted_at IS NULL
GROUP BY COALESCE(company_id, 0)
ON CONFLICT (company_id) DO UPDATE
SET used_bytes = EXCLUDED.used_bytes,
    file_count = EXCLUDED.file_count,
    updated_at = NOW();

-- 트리거 함수: 파일 INSERT/UPDATE/DELETE 시 company_storage 자동 갱신
CREATE OR REPLACE FUNCTION update_storage_stats()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.deleted_at IS NULL THEN
    INSERT INTO company_storage (company_id, used_bytes, file_count, updated_at)
    VALUES (COALESCE(NEW.company_id, 0), NEW.size, 1, NOW())
    ON CONFLICT (company_id) DO UPDATE
    SET used_bytes = company_storage.used_bytes + NEW.size,
        file_count = company_storage.file_count + 1,
        updated_at = NOW();
  ELSIF TG_OP = 'UPDATE' THEN
    -- Soft delete (deleted_at NULL → NOT NULL)
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      UPDATE company_storage
      SET used_bytes = GREATEST(0, used_bytes - OLD.size),
          file_count = GREATEST(0, file_count - 1),
          updated_at = NOW()
      WHERE company_id = COALESCE(OLD.company_id, 0);
    -- Restore (deleted_at NOT NULL → NULL)
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      INSERT INTO company_storage (company_id, used_bytes, file_count, updated_at)
      VALUES (COALESCE(NEW.company_id, 0), NEW.size, 1, NOW())
      ON CONFLICT (company_id) DO UPDATE
      SET used_bytes = company_storage.used_bytes + NEW.size,
          file_count = company_storage.file_count + 1,
          updated_at = NOW();
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF OLD.deleted_at IS NULL THEN
      UPDATE company_storage
      SET used_bytes = GREATEST(0, used_bytes - OLD.size),
          file_count = GREATEST(0, file_count - 1),
          updated_at = NOW()
      WHERE company_id = COALESCE(OLD.company_id, 0);
    END IF;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 트리거 생성
DROP TRIGGER IF EXISTS webhard_storage_tracking ON webhard_files;
CREATE TRIGGER webhard_storage_tracking
AFTER INSERT OR UPDATE OR DELETE ON webhard_files
FOR EACH ROW EXECUTE FUNCTION update_storage_stats();
