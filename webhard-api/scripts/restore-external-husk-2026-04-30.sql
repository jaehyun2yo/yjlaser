-- restore-external-husk-2026-04-30.sql
-- task 27 Phase A — task 26 cascade soft-delete 회귀 회복
-- 대성목형(2265-1295) 외부웹하드 트리 deletedAt 복원

-- 0. 사전 확인 — 복원 대상 트리 조회
SELECT id, name, path, parent_id, folder_kind, company_id, deleted_at
FROM webhard_folders
WHERE path LIKE '/외부웹하드/대성목형(2265-1295)%'
  AND deleted_at IS NOT NULL
ORDER BY path;

-- 1. 복원 — deletedAt 을 NULL 로
-- 안전: 2026-04-30 09:00 ~ 10:00 사이에 deletedAt 이 set 된 행만 대상.
--      만약 이 시각 외 다른 cascade 실행이 있었다면 시간 범위 조정 필요.
UPDATE webhard_folders
SET deleted_at = NULL,
    updated_at = NOW()
WHERE path LIKE '/외부웹하드/대성목형(2265-1295)%'
  AND deleted_at >= '2026-04-30 00:00:00+00'
  AND deleted_at <  '2026-04-30 23:59:59+00';

-- 2. 사후 검증 — 트리 deletedAt 모두 NULL 인지 확인
SELECT id, name, path, deleted_at
FROM webhard_folders
WHERE path LIKE '/외부웹하드/대성목형(2265-1295)%'
ORDER BY path;
-- 기대: 모든 행 deleted_at = NULL
