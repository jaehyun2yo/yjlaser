# Task A — 배포 경계 정합성 brief

## 범위

- CI는 `main`, `codex/**` push 및 `main` 대상 PR에서 실행된다.
- 컨테이너 시작은 `node dist/src/main`만 실행하며 migration을 시작 경로에서 실행하지 않는다.
- `expired`, `revoked` enum 값은 별도 선행 migration에서 추가하고, 후속 rotation migration은 새 enum 값을 사용하는 제약만 적용한다.

## 소유 파일

- `.github/workflows/ci.yml`
- `webhard-api/Dockerfile`
- `webhard-api/prisma/migrations/20260720140000_add_device_credential_rotation_status_values/migration.sql` (신규)
- `webhard-api/prisma/migrations/20260720150000_complete_device_credential_rotation/migration.sql`
- `tests/static/device-auth-deployment-contract.test.mjs` (신규)
- `webhard-api/src/integration/device-auth/device-auth.persistence.spec.ts`
- `.superpowers/sdd/task-a-deployment-contract-{brief,report}.md`
- `.superpowers/sdd/progress.md`, `docs/changelog/CHANGELOG.md`

## TDD 계약

1. CI 트리거가 요구 branch 집합을 정확히 포함한다.
2. Docker `CMD`가 startup migration 없이 정확한 application command만 가진다.
3. enum 추가 migration이 rotation migration보다 먼저 있고, 각 enum `ADD VALUE`가 후속 제약 사용과 별도 파일/commit 경계를 가진다.

CI test job에 Node 내장 static contract test를 연결한 것은 위 계약이 후속 변경에서 계속 실행되도록 하는 범위 내 변경이다.

## 금지/운영 경계

실제 deploy, migrate, DB 연결, secret 읽기, 환경 변경, 서버 시작, commit, push를 수행하지 않는다. migration 실행은 명시적 one-off `pnpm migrate:deploy` script로만 남긴다.
