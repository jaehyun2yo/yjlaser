-- ============================================
-- 웹하드 성능 최적화 인덱스 추가
-- 문서: docs/003-DB-인덱스-최적화-계획.md
-- 날짜: 2026-01-13
-- ============================================

-- ============================================
-- 파일 인덱스
-- ============================================

-- 1. 파일 목록 조회 최적화 (필수 #1)
-- 쿼리: SELECT * FROM webhard_files WHERE folder_id = ? AND company_id = ? AND deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_files_folder_company_deleted
ON webhard_files (folder_id, company_id, deleted_at)
WHERE deleted_at IS NULL;

-- 2. 미다운로드 카운트 최적화 (필수 #2)
-- 쿼리: SELECT COUNT(*) FROM webhard_files WHERE company_id = ? AND is_downloaded = FALSE AND deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_files_company_downloaded
ON webhard_files (company_id, is_downloaded)
WHERE deleted_at IS NULL AND is_downloaded = FALSE;

-- ============================================
-- 폴더 인덱스
-- ============================================

-- 3. 폴더 목록 조회 최적화 (필수 #5)
-- 쿼리: SELECT * FROM webhard_folders WHERE parent_id = ? AND company_id = ? AND deleted_at IS NULL
CREATE INDEX IF NOT EXISTS idx_folders_parent_company_deleted
ON webhard_folders (parent_id, company_id, deleted_at)
WHERE deleted_at IS NULL;

-- ============================================
-- 롤백 스크립트 (필요 시 사용)
-- ============================================
-- DROP INDEX IF EXISTS idx_files_folder_company_deleted;
-- DROP INDEX IF EXISTS idx_files_company_downloaded;
-- DROP INDEX IF EXISTS idx_folders_parent_company_deleted;
