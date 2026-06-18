-- 웹하드 마이그레이션 시스템 테이블
-- LGU+ 웹하드에서 자체 웹하드로 데이터 이전을 위한 작업 관리 테이블

-- 마이그레이션 작업 테이블
CREATE TABLE IF NOT EXISTS migration_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_folder_name TEXT NOT NULL,           -- LGU+ 원본 폴더명 (업체명)
  target_folder_id UUID,                      -- 자체 웹하드 루트 폴더 ID
  company_id BIGINT REFERENCES companies(id), -- nullable: 나중에 업체 연결
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'cancelled')),
  total_files INTEGER DEFAULT 0,
  uploaded_files INTEGER DEFAULT 0,
  failed_files INTEGER DEFAULT 0,
  skipped_files INTEGER DEFAULT 0,
  total_size BIGINT DEFAULT 0,                -- 총 바이트
  uploaded_size BIGINT DEFAULT 0,             -- 업로드된 바이트
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NOT NULL,                   -- 관리자 ID
  notes TEXT                                  -- 관리자 메모
);

-- 마이그레이션 파일 로그 테이블
CREATE TABLE IF NOT EXISTS migration_file_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES migration_jobs(id) ON DELETE CASCADE,
  source_path TEXT NOT NULL,                  -- LGU+ 원본 경로
  target_folder_id UUID,                      -- 자체 웹하드 폴더 ID
  target_file_id UUID,                        -- 업로드된 파일 ID (성공 시)
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'uploading', 'success', 'failed', 'skipped', 'duplicate')),
  error_message TEXT,
  duplicate_of UUID,                          -- 중복된 파일 ID (중복 시)
  created_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

-- 인덱스
CREATE INDEX IF NOT EXISTS idx_migration_jobs_status ON migration_jobs(status);
CREATE INDEX IF NOT EXISTS idx_migration_jobs_source ON migration_jobs(source_folder_name);
CREATE INDEX IF NOT EXISTS idx_migration_jobs_created_at ON migration_jobs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_migration_file_logs_job ON migration_file_logs(job_id);
CREATE INDEX IF NOT EXISTS idx_migration_file_logs_status ON migration_file_logs(status);
CREATE INDEX IF NOT EXISTS idx_migration_file_logs_created_at ON migration_file_logs(created_at DESC);

-- RLS 활성화 (관리자만 접근)
ALTER TABLE migration_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE migration_file_logs ENABLE ROW LEVEL SECURITY;

-- RLS 정책: 관리자 전용 (API에서 admin client 사용)
CREATE POLICY "Admin full access on migration_jobs"
  ON migration_jobs FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Admin full access on migration_file_logs"
  ON migration_file_logs FOR ALL
  USING (true)
  WITH CHECK (true);

-- 마이그레이션 통계 조회 RPC
CREATE OR REPLACE FUNCTION get_migration_stats()
RETURNS TABLE (
  total_jobs BIGINT,
  pending_jobs BIGINT,
  in_progress_jobs BIGINT,
  completed_jobs BIGINT,
  failed_jobs BIGINT,
  total_files BIGINT,
  uploaded_files BIGINT,
  failed_files BIGINT,
  skipped_files BIGINT,
  total_size BIGINT,
  uploaded_size BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_jobs,
    COUNT(*) FILTER (WHERE status = 'pending')::BIGINT AS pending_jobs,
    COUNT(*) FILTER (WHERE status = 'in_progress')::BIGINT AS in_progress_jobs,
    COUNT(*) FILTER (WHERE status = 'completed')::BIGINT AS completed_jobs,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT AS failed_jobs,
    COALESCE(SUM(mj.total_files), 0)::BIGINT AS total_files,
    COALESCE(SUM(mj.uploaded_files), 0)::BIGINT AS uploaded_files,
    COALESCE(SUM(mj.failed_files), 0)::BIGINT AS failed_files,
    COALESCE(SUM(mj.skipped_files), 0)::BIGINT AS skipped_files,
    COALESCE(SUM(mj.total_size), 0)::BIGINT AS total_size,
    COALESCE(SUM(mj.uploaded_size), 0)::BIGINT AS uploaded_size
  FROM migration_jobs mj;
END;
$$;

-- 작업별 파일 로그 통계 조회 RPC
CREATE OR REPLACE FUNCTION get_migration_job_stats(p_job_id UUID)
RETURNS TABLE (
  total_files BIGINT,
  pending_files BIGINT,
  uploading_files BIGINT,
  success_files BIGINT,
  failed_files BIGINT,
  skipped_files BIGINT,
  duplicate_files BIGINT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT AS total_files,
    COUNT(*) FILTER (WHERE status = 'pending')::BIGINT AS pending_files,
    COUNT(*) FILTER (WHERE status = 'uploading')::BIGINT AS uploading_files,
    COUNT(*) FILTER (WHERE status = 'success')::BIGINT AS success_files,
    COUNT(*) FILTER (WHERE status = 'failed')::BIGINT AS failed_files,
    COUNT(*) FILTER (WHERE status = 'skipped')::BIGINT AS skipped_files,
    COUNT(*) FILTER (WHERE status = 'duplicate')::BIGINT AS duplicate_files
  FROM migration_file_logs
  WHERE job_id = p_job_id;
END;
$$;

-- 코멘트 추가
COMMENT ON TABLE migration_jobs IS 'LGU+ 웹하드에서 자체 웹하드로의 마이그레이션 작업 관리';
COMMENT ON TABLE migration_file_logs IS '마이그레이션 작업별 개별 파일 업로드 로그';
COMMENT ON COLUMN migration_jobs.source_folder_name IS 'LGU+ 웹하드의 원본 폴더명 (보통 업체명)';
COMMENT ON COLUMN migration_jobs.target_folder_id IS '자체 웹하드에 생성된 루트 폴더 ID';
COMMENT ON COLUMN migration_jobs.company_id IS '나중에 업체 가입 시 연결될 회사 ID (초기에는 null)';
