-- Migration: Make company_id nullable in webhard_folders table
-- Purpose: 관리자가 생성한 폴더는 company_id 없이 저장 (관리자 전용 폴더)
-- Date: 2024-12-24

-- 1. webhard_folders 테이블의 company_id 외래 키 제약조건 삭제
ALTER TABLE webhard_folders
DROP CONSTRAINT IF EXISTS webhard_folders_company_id_fkey;

-- 2. company_id 컬럼을 nullable로 변경
ALTER TABLE webhard_folders
ALTER COLUMN company_id DROP NOT NULL;

-- 3. 외래 키 제약조건 재설정 (nullable 허용)
ALTER TABLE webhard_folders
ADD CONSTRAINT webhard_folders_company_id_fkey
FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

-- 4. webhard_files 테이블도 동일하게 처리 (관리자 업로드 파일 지원)
ALTER TABLE webhard_files
DROP CONSTRAINT IF EXISTS webhard_files_company_id_fkey;

ALTER TABLE webhard_files
ALTER COLUMN company_id DROP NOT NULL;

ALTER TABLE webhard_files
ADD CONSTRAINT webhard_files_company_id_fkey
FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE SET NULL;

-- 5. unique constraint 업데이트 (company_id가 NULL인 경우 처리)
-- 기존 인덱스 삭제 후 재생성
DROP INDEX IF EXISTS idx_webhard_folders_unique_name;

CREATE UNIQUE INDEX idx_webhard_folders_unique_name
ON webhard_folders (name, COALESCE(parent_id::text, 'NULL'), COALESCE(company_id::text, 'NULL'))
WHERE deleted_at IS NULL;

-- 6. 코멘트 추가
COMMENT ON COLUMN webhard_folders.company_id IS '회사 ID. NULL이면 관리자 전용 폴더';
COMMENT ON COLUMN webhard_files.company_id IS '회사 ID. NULL이면 관리자 업로드 파일';
