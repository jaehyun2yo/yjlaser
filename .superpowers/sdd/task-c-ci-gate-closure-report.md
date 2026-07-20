# Task C — CI gate closure report

## 상태

`REVIEW_PENDING`

## 변경

- root secret fallback static gate를 외부 `rg` 실행 파일 대신 정렬된 Node `fs` 순회로 변경했다. 기존 세 source root, `.ts`/`.tsx` 대상, test/spec/d.ts 제외 규칙은 유지한다.
- 12개 기존 lint error 파일에서 테스트 모듈 로딩을 정적 import로 바꾸고, `module` 지역 변수는 `testingModule`으로 명확히 변경했다. CSRF test의 넓은 `Function`은 정확한 callable/constructor 타입으로 변경했다.
- built artifact의 절대 경로를 런타임에 선택하는 compatibility collector만 `createRequire(__filename)`로 CommonJS module loader를 명시적으로 생성했다. 정적 import로 바꿀 수 없는 동적 artifact probe를 보존한다.
- `device-endpoint-policy.guard.spec.ts`는 수정하지 않았다.

## 검증

- RED lint: 정확히 12 files / 35 errors (`no-require-imports` 23, `no-assign-module-variable` 10, `no-unsafe-function-type` 2).
- `pnpm exec eslint . --format json` error-only: GREEN, 0 files / 0 errors. warning은 기존 1,031건이 남아 있으며 이번 범위에서 bulk-fix하지 않았다.
- `pnpm test -- --runTestsByPath tests/security/secret-fallback-static-gate.test.ts`: GREEN, 1 suite / 5 tests.
- 영향 Nest Jest: GREEN, 11 suites / 220 tests (초기 10 suites / 179 tests + `device-credential-rotation.service.spec.ts` 1 suite / 41 tests 재실행).
- root `pnpm exec tsc --noEmit`, backend `pnpm exec tsc --noEmit`: GREEN.
- `pnpm exec tsx scripts/collect-device-auth-rotation-compatibility-evidence.ts --help`: GREEN, built artifact runtime probe와 `createRequire(__filename)` 호환성이 `compatible` evidence로 확인됐다.
- `pnpm test -- --runInBand`: GREEN, 158 suites / 1,149 tests.
- 변경 13 files `prettier --write` 후 `prettier --check`: GREEN.

## 경계와 다음 단계

- 실제 GitHub CI 재실행, deploy, migration, DB/secret/env/server 작업, stage/commit/push는 수행하지 않았다.
- fresh independent review와 전달/커밋은 상위 작업자가 수행한다.
