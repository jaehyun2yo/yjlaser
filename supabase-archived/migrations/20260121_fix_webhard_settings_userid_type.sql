-- webhard_settings.user_id 컬럼 타입 수정: bigint → text
-- 이유: 서비스 코드가 "admin" 또는 "company-{id}" 형식의 문자열을 사용
-- 08P01 에러의 근본 원인

-- 1. 기존 데이터 백업 및 변환
-- 기존 bigint 값을 "company-{id}" 형식으로 변환
DO $$
BEGIN
  -- 임시 컬럼 생성
  ALTER TABLE webhard_settings ADD COLUMN IF NOT EXISTS user_id_new TEXT;

  -- 기존 데이터 변환 (bigint → "company-{id}")
  UPDATE webhard_settings
  SET user_id_new = 'company-' || user_id::text
  WHERE user_id_new IS NULL;

  -- 기존 컬럼 삭제 및 새 컬럼으로 교체
  ALTER TABLE webhard_settings DROP COLUMN user_id;
  ALTER TABLE webhard_settings RENAME COLUMN user_id_new TO user_id;

  -- Primary Key 재설정
  ALTER TABLE webhard_settings ADD PRIMARY KEY (user_id);

  RAISE NOTICE 'webhard_settings.user_id 컬럼 타입이 text로 변경되었습니다.';
END $$;
