-- Fix webhard file paths by removing newlines and storing as objectKey format
-- Migration: Convert from full URLs to objectKey format (webhard/filename)

BEGIN;

-- 기존 파일들의 path를 정리
-- URL 형식 (https://yjlaser.net/webhard/...)에서 objectKey 형식 (webhard/...)으로 변환
UPDATE webhard_files
SET path = REGEXP_REPLACE(
  SUBSTRING(path, POSITION('webhard' IN path)),
  '\s+',
  ' ',
  'g'
)
WHERE path LIKE 'https://%/webhard/%'
AND path LIKE '%' || CHR(10) || '%'; -- path에 줄바꿈이 있는 경우만

-- 주석: 위 쿼리가 작동하지 않으면 아래 대안을 사용
-- UPDATE webhard_files
-- SET path = REPLACE(REPLACE(path, CHR(13), ''), CHR(10), '')
-- WHERE path LIKE 'https://%/webhard/%';

-- path가 아직도 전체 URL인 경우, objectKey로만 추출
UPDATE webhard_files
SET path = SUBSTRING(path, POSITION('webhard' IN path))
WHERE path LIKE 'https://%/webhard/%'
AND NOT path LIKE 'webhard/%';

COMMIT;
