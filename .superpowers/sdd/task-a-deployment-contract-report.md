# Task A — 배포 경계 정합성 report

## 상태

`REVIEW_PENDING`

## 요구 및 소유권 확인

- 원천 문서의 `수정 작업 A`만 읽어 요구를 추출했다.
- 현재 발견한 root cause: CI가 `master`만 수신, Docker `CMD`가 startup migration을 수행, rotation migration이 PostgreSQL enum 추가와 새 enum 제약 사용을 같은 migration에 함께 둔다.
- 허용된 Task A 소유 파일만 수정했다. CI test job의 Node static contract 실행 추가는 자동화된 계약 테스트를 지속 실행하기 위한 범위 내 변경이다.

## TDD 진행

- RED: clean RC에 Jest 실행 파일이 없어 `pnpm exec jest`는 exit 1(`Command "jest" not found`)으로 테스트 실행 자체를 증명하지 못했다. 의존성 설치 없이 실행 가능한 Node 내장 테스트로 계약을 유지하기 위해 `tests/static/device-auth-deployment-contract.test.mjs`로 전환했다. `node --test tests/static/device-auth-deployment-contract.test.mjs`는 exit 1, 3개 중 0 pass/3 fail로 실패했다: CI는 `master`만 수신, Docker CMD는 Doppler+`prisma migrate deploy`를 수행, enum 선행 migration이 없었다. 이 테스트를 CI test job에도 연결했다.
- GREEN: 같은 Node suite는 exit 0, 3개 중 3 pass/0 fail을 확인했다.

## 검증

- `node --test tests/static/device-auth-deployment-contract.test.mjs`: GREEN 3/3 pass.
- `pnpm exec jest --runInBand src/integration/device-auth/device-auth.persistence.spec.ts`: 1 suite, 18/18 pass.
- `pnpm exec jest --runInBand src/integration/device-auth/device-auth-rotation-compatibility.spec.ts`: 1 suite, 25/25 pass.
- `pnpm exec tsc --noEmit`, `pnpm build`: exit 0. Nest build는 npm config deprecation warning만 출력했다.
- `pnpm exec tsx scripts/collect-device-auth-rotation-compatibility-evidence.ts --source-root .. --rotation-runtime-enabled false`: `result: compatible`, enum 7개/nullable column 5개와 runtime-disabled 경계를 확인했다.
- placeholder-only Prisma validate: 최초 `DATABASE_URL`만으로는 `DIRECT_URL` 누락 P1012(exit 1)이었고, 두 placeholder URL로 재실행해 schema valid(exit 0)를 확인했다. 연결/migration은 발생하지 않았다.
- Prettier: 지원하는 YAML/TS/MJS/MD 변경 파일은 `--check` 통과했다. Prettier는 SQL parser를 제공하지 않아 두 migration SQL은 `--write` 대상에서 parser error가 났으며, SQL은 최소 수동 diff와 `git diff --check`로 확인했다.
- `git diff --check`: exit 0.
- 변경 소유 파일 대상 private-key/API-key denylist scan: no matches(exit 0).

## 정확한 변경 파일

1. `.github/workflows/ci.yml`
2. `webhard-api/Dockerfile`
3. `webhard-api/prisma/migrations/20260720140000_add_device_credential_rotation_status_values/migration.sql` (신규)
4. `webhard-api/prisma/migrations/20260720150000_complete_device_credential_rotation/migration.sql`
5. `tests/static/device-auth-deployment-contract.test.mjs` (신규)
6. `webhard-api/src/integration/device-auth/device-auth.persistence.spec.ts`
7. `.superpowers/sdd/task-a-deployment-contract-brief.md` (신규)
8. `.superpowers/sdd/task-a-deployment-contract-report.md` (신규)
9. `.superpowers/sdd/progress.md`
10. `docs/changelog/CHANGELOG.md`

## 남은 우려

- PostgreSQL 실제 migration apply, Docker image build, GitHub CI run, deploy는 금지된 운영 작업이므로 수행하지 않았다. enum transaction 분리는 migration directory 순서와 source contract로만 검증됐다.
- clean RC root에는 Jest executable이 없어 최초 root Jest 호출은 runner-missing으로 실패했다. 최종 static 계약은 Node 내장 runner로 CI test job에 연결했고, backend Jest suites는 `webhard-api`의 설치된 의존성으로 통과했다.

## REVIEW_PENDING review-fix — TASKA-MNT-001

- 승인된 Important 유지보수 지적: `readdirSync()`의 directory 반환 순서는 계약의 migration index 비교에 직접 사용하면 비결정적일 수 있다.
- main이 적용한 최소 보정 `readdirSync(migrationsDirectory).sort()`을 검토했다. enum/rotation migration의 명시적 lexicographic timestamp 순서를 안정적으로 만든 뒤 기존 index 비교를 유지하므로 정확하다. 다른 범위 수정은 하지 않았다.
- covering evidence: `node --test tests/static/device-auth-deployment-contract.test.mjs`는 exit 0, 3/3 pass. 실제 정렬된 migration 목록에서 enum migration index는 23, rotation migration index는 24로 확인되어 선행 조건을 만족한다.
- 상태는 `REVIEW_PENDING`으로 유지한다. commit/push 및 운영 작업은 수행하지 않았다.

## 금지된 작업

실제 deploy/migrate/DB connect/secret read/env change/server start/commit/push를 수행하지 않았다. Prisma validate의 URL은 command-process 한정 placeholder였으며 실제 접속 정보가 아니다.
