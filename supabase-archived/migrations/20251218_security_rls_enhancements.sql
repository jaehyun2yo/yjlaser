-- ============================================
-- 보안 강화 마이그레이션: RLS 정책 업데이트
-- 날짜: 2025-12-18
-- 작성: Claude Code
-- ============================================

-- ============================================
-- 1. webhard_logs 테이블 RLS 정책 강화
-- 기존 dev_anon_all 정책 제거 및 회사별 격리 정책 추가
-- ============================================

-- 기존 dev_anon_all 정책 삭제 (존재하는 경우에만)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'webhard_logs'
    AND policyname = 'dev_anon_all'
  ) THEN
    DROP POLICY dev_anon_all ON public.webhard_logs;
    RAISE NOTICE 'Dropped policy: dev_anon_all on webhard_logs';
  END IF;
END $$;

-- 회사별 SELECT 정책: 자신의 회사 로그만 조회 가능
-- 관리자(service_role)는 모든 로그 조회 가능
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'webhard_logs'
    AND policyname = 'webhard_logs_company_select'
  ) THEN
    CREATE POLICY webhard_logs_company_select ON public.webhard_logs
      FOR SELECT
      USING (
        -- auth.uid()가 company_id와 일치하거나
        -- service_role (관리자)인 경우 허용
        company_id::text = COALESCE(current_setting('request.jwt.claims', true)::json->>'sub', '')
        OR current_setting('role', true) = 'service_role'
      );
    RAISE NOTICE 'Created policy: webhard_logs_company_select';
  END IF;
END $$;

-- 회사별 INSERT 정책: 자신의 회사 로그만 삽입 가능
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'webhard_logs'
    AND policyname = 'webhard_logs_company_insert'
  ) THEN
    CREATE POLICY webhard_logs_company_insert ON public.webhard_logs
      FOR INSERT
      WITH CHECK (
        company_id::text = COALESCE(current_setting('request.jwt.claims', true)::json->>'sub', '')
        OR current_setting('role', true) = 'service_role'
      );
    RAISE NOTICE 'Created policy: webhard_logs_company_insert';
  END IF;
END $$;

-- 삭제 정책: service_role만 삭제 가능 (일반 사용자는 삭제 불가)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'webhard_logs'
    AND policyname = 'webhard_logs_service_delete'
  ) THEN
    CREATE POLICY webhard_logs_service_delete ON public.webhard_logs
      FOR DELETE
      USING (current_setting('role', true) = 'service_role');
    RAISE NOTICE 'Created policy: webhard_logs_service_delete';
  END IF;
END $$;

-- 업데이트 정책: service_role만 업데이트 가능 (로그 무결성 보장)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
    AND tablename = 'webhard_logs'
    AND policyname = 'webhard_logs_service_update'
  ) THEN
    CREATE POLICY webhard_logs_service_update ON public.webhard_logs
      FOR UPDATE
      USING (current_setting('role', true) = 'service_role');
    RAISE NOTICE 'Created policy: webhard_logs_service_update';
  END IF;
END $$;

-- ============================================
-- 2. companies 테이블에 is_approved 컬럼 추가
-- 업체 승인 절차를 위한 플래그
-- ============================================

-- is_approved 컬럼 추가 (존재하지 않는 경우에만)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'companies'
    AND column_name = 'is_approved'
  ) THEN
    ALTER TABLE public.companies
    ADD COLUMN is_approved BOOLEAN NOT NULL DEFAULT false;
    RAISE NOTICE 'Added column: is_approved to companies';
  END IF;
END $$;

-- approved_at 컬럼 추가 (승인 시간 기록)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'companies'
    AND column_name = 'approved_at'
  ) THEN
    ALTER TABLE public.companies
    ADD COLUMN approved_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;
    RAISE NOTICE 'Added column: approved_at to companies';
  END IF;
END $$;

-- approved_by 컬럼 추가 (승인한 관리자 기록)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
    AND table_name = 'companies'
    AND column_name = 'approved_by'
  ) THEN
    ALTER TABLE public.companies
    ADD COLUMN approved_by TEXT DEFAULT NULL;
    RAISE NOTICE 'Added column: approved_by to companies';
  END IF;
END $$;

-- 기존 active 상태의 회사들은 자동으로 승인 처리
UPDATE public.companies
SET
  is_approved = true,
  approved_at = NOW(),
  approved_by = 'system_migration'
WHERE status = 'active' AND is_approved = false;

-- is_approved 컬럼에 인덱스 추가 (승인 대기 목록 조회 성능)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
    AND tablename = 'companies'
    AND indexname = 'idx_companies_is_approved'
  ) THEN
    CREATE INDEX idx_companies_is_approved ON public.companies(is_approved);
    RAISE NOTICE 'Created index: idx_companies_is_approved';
  END IF;
END $$;

-- ============================================
-- 3. 감사 로그 무결성 강화
-- activity_logs 테이블 DELETE/UPDATE 방지
-- ============================================

-- activity_logs 테이블에 대한 DELETE 방지 트리거 (WORM - Write Once Read Many)
CREATE OR REPLACE FUNCTION prevent_activity_log_modification()
RETURNS TRIGGER AS $$
BEGIN
  -- service_role도 삭제/수정 불가 (감사 로그 무결성)
  RAISE EXCEPTION 'activity_logs table is immutable. DELETE and UPDATE operations are not allowed.';
END;
$$ LANGUAGE plpgsql;

-- DELETE 트리거 (존재하지 않는 경우에만)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'prevent_activity_log_delete'
    AND tgrelid = 'public.activity_logs'::regclass
  ) THEN
    CREATE TRIGGER prevent_activity_log_delete
      BEFORE DELETE ON public.activity_logs
      FOR EACH ROW
      EXECUTE FUNCTION prevent_activity_log_modification();
    RAISE NOTICE 'Created trigger: prevent_activity_log_delete';
  END IF;
END $$;

-- UPDATE 트리거 (존재하지 않는 경우에만)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'prevent_activity_log_update'
    AND tgrelid = 'public.activity_logs'::regclass
  ) THEN
    CREATE TRIGGER prevent_activity_log_update
      BEFORE UPDATE ON public.activity_logs
      FOR EACH ROW
      EXECUTE FUNCTION prevent_activity_log_modification();
    RAISE NOTICE 'Created trigger: prevent_activity_log_update';
  END IF;
END $$;

-- ============================================
-- 마이그레이션 완료 로그
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '=============================================';
  RAISE NOTICE 'Security RLS Enhancement Migration Complete';
  RAISE NOTICE '1. webhard_logs RLS: Company isolation enabled';
  RAISE NOTICE '2. companies: is_approved column added';
  RAISE NOTICE '3. activity_logs: WORM (immutable) enforced';
  RAISE NOTICE '=============================================';
END $$;
