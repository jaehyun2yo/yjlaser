# Task B — root lockfile 정합성 report

## 상태

`REVIEW_PENDING`

## 원인 및 변경

- GitHub Actions [run 29781770815](https://github.com/jaehyun2yo/yjlaser/actions/runs/29781770815)의 root Type Check/Lint/Test는 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`로 실패했고, backend lockfile job은 통과했다.
- 원인은 root `package.json`의 `pnpm.overrides`와 root lockfile top-level `overrides`의 stale 불일치였다.
- package manifest는 변경하지 않았다 (`git diff --quiet HEAD -- package.json` exit 0). pnpm 9.15.9의 no-frozen lockfile-only 재생성 결과인 `pnpm-lock.yaml`만 소유했다.
- lockfile의 10개 top-level override가 manifest와 정확히 일치한다: `@opentelemetry/instrumentation>import-in-the-middle`, `bn.js@<4.12.3`, `esbuild`, `hono`, `js-yaml`, `picomatch`, `postcss`, `socket.io-parser`, `yaml`, `ws`.

## TDD 진행

- RED: main이 사전 실행한 `npx --yes pnpm@9.15.9 install --frozen-lockfile --lockfile-only --ignore-scripts`는 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`로 실패했다. 이 작업 중 재실행하지 않고 전달된 exact evidence를 사용했다.
- GREEN: 같은 exact command를 재실행하여 exit 0을 확인했다 (`Done in 401ms using pnpm v9.15.9`).

## lockfile diff 분석

- 직접 importer 정합성: root `nodemailer`는 stale `^8.0.8`/`8.0.8`에서 package manifest에 이미 선언된 `^9.0.1`/해석된 `9.0.3`으로 갱신됐다. manifest 자체는 HEAD와 동일하다.
- override 정합성: `esbuild 0.27.1 → 0.28.1`, `hono 4.12.23 → 4.12.27`, `js-yaml 3.14.2·4.1.1 → 4.2.0`, `ws 8.20.1 → 8.21.0`은 모두 manifest의 `pnpm.overrides`에 선언된 값이다.
- 전체 lockfile diff 181 additions/198 deletions는 위 override와 `nodemailer` 해석에 따른 esbuild 플랫폼 패키지, Jest/Webpack peer snapshot, Hono/Inngest peer snapshot, js-yaml 하위 package 정리 및 OpenTelemetry/Sentry peer snapshot 전파다. package manifest에 없는 새 root direct dependency나 importer specifier는 추가되지 않았다.
- 신규 static contract test는 추가하지 않았다. CI의 세 root job이 이미 frozen install을 실행하므로 동일 계약을 중복해 workflow/test 범위를 키우지 않았다.

## 검증

- `npx --yes pnpm@9.15.9 install --frozen-lockfile --lockfile-only --ignore-scripts`: GREEN, exit 0.
- `npx --yes pnpm@9.15.9 install --frozen-lockfile --ignore-scripts`: exit 0, 1,380 packages, scripts 비실행.
- `npx tsc --noEmit`: exit 0.
- `pnpm test -- --ci --passWithNoTests`: exit 0, 158 suites / 1,149 tests passed. 테스트 출력의 예상 error-log 및 Windows `grep` 미존재 메시지는 suite 실패가 아니다.
- `pnpm lint`: exit 1, 35 errors / 1,031 warnings. 이번 변경과 무관한 기존 repo-wide blocking finding이다. 오류는 12개 backend 파일에 있으며 규칙별로 `@typescript-eslint/no-require-imports` 23건, `@next/next/no-assign-module-variable` 10건, `@typescript-eslint/no-unsafe-function-type` 2건이다. Task B diff 파일과 오류 파일의 교집합은 0이므로 범위 밖으로 남겼다.
- `git diff --check`: exit 0.
- 허용 변경 파일 denylist scan: private-key/API-key match 없음.

## 남은 우려

- 실제 GitHub CI 재실행, deploy, migration, DB/secret/environment/server 작업은 수행하지 않았다.
- root lint의 기존 35 errors는 CI 전체 green을 막는 독립 blocker다. 이 lockfile 수정의 frozen-install blocker는 해소됐지만 lint source 정리는 별도 승인·범위로 다뤄야 한다.

## 금지된 작업

실제 deploy/migrate/DB/secret/env/server/commit/push를 수행하지 않았다.
