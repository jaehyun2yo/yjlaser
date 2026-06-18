-- task 25 Bug 1: admin 이 업체 폴더에 업로드한 파일 중 webhard_files.company_id 가 NULL 로
-- 저장된 케이스를 부모 폴더의 company_id 로 백필. idempotent.
UPDATE webhard_files f
SET company_id = wf.company_id
FROM webhard_folders wf
WHERE f.folder_id = wf.id
  AND f.company_id IS NULL
  AND wf.company_id IS NOT NULL
  AND f.deleted_at IS NULL;
