-- Migration: Add Admin Company Record
-- Purpose: 관리자가 생성한 폴더/파일의 company_id로 사용할 전용 회사 레코드
-- Date: 2025-01-15

-- 1. Admin 회사 레코드 삽입 (ID = 0)
-- ON CONFLICT 사용하여 이미 존재하면 업데이트
INSERT INTO public.companies (
  id,
  username,
  password_hash,
  company_name,
  business_registration_number,
  representative_name,
  business_address,
  manager_name,
  manager_position,
  manager_phone,
  manager_email,
  status,
  is_approved
) VALUES (
  0,
  'admin_system',
  '$2b$10$PLACEHOLDER_NOT_FOR_LOGIN', -- 로그인용 아님
  '관리자',
  '000-00-00000',
  'System Admin',
  'System',
  'Admin',
  'System',
  '000-0000-0000',
  'admin@system.local',
  'active',
  true
)
ON CONFLICT (id) DO UPDATE SET
  company_name = EXCLUDED.company_name,
  status = EXCLUDED.status,
  is_approved = EXCLUDED.is_approved;

-- 2. 시퀀스가 0을 건너뛰도록 설정 (다음 자동 생성 ID가 1 이상이 되도록)
-- 시퀀스 현재 값이 0 이하면 1로 설정
DO $$
BEGIN
  -- 시퀀스가 존재하는 경우에만 업데이트
  IF EXISTS (SELECT 1 FROM pg_sequences WHERE schemaname = 'public' AND sequencename = 'companies_id_seq') THEN
    PERFORM setval('public.companies_id_seq', GREATEST(1, (SELECT COALESCE(MAX(id), 0) FROM public.companies WHERE id > 0)), true);
  END IF;
END $$;

-- 3. 기존 NULL company_id를 가진 폴더/파일을 Admin 회사로 마이그레이션
UPDATE webhard_folders
SET company_id = 0
WHERE company_id IS NULL;

UPDATE webhard_files
SET company_id = 0
WHERE company_id IS NULL;

-- 4. 문서화용 코멘트
COMMENT ON COLUMN public.companies.id IS '회사 ID. ID 0은 관리자 전용 웹하드 항목을 위해 예약됨.';
