# Task D — Docker build heap report

## 상태

`REVIEW_PENDING`

## 변경

- `webhard-api/Dockerfile`의 build RUN만 `NODE_OPTIONS=--max-old-space-size=4096 pnpm build`로 바꿨다.
- 전역 `ENV NODE_OPTIONS`, runtime `CMD` 변경, startup migration 추가는 하지 않았다. CMD는 정확히 `node dist/src/main`을 유지한다.
- `tests/static/device-auth-deployment-contract.test.mjs`에 build heap/runtime 분리 계약을 추가했다. 유일한 build command가 4096 MiB 이상의 scoped Node heap을 사용하고, `NODE_OPTIONS`가 build RUN 밖/전역 ENV/CMD에 없음을 검사한다.

## TDD 증거

- RED: `node --test tests/static/device-auth-deployment-contract.test.mjs`는 exit 1이었다. 기존 3개 계약은 pass했고, 신규 build heap 계약만 기존 `RUN pnpm build`가 process-scoped `NODE_OPTIONS`를 갖지 않아 실패했다.
- GREEN: 최소 Dockerfile 한 줄 수정 후 같은 Node suite는 exit 0, 4/4 pass였다.

## 검증

- `node --test tests/static/device-auth-deployment-contract.test.mjs`: GREEN, 4/4 pass.
- `webhard-api: pnpm exec tsc --noEmit --pretty false`: GREEN.
- `webhard-api: pnpm build`: GREEN. npm config deprecation warnings만 출력됐다.
- `webhard-api: pnpm exec tsx scripts/collect-device-auth-rotation-compatibility-evidence.ts --source-root .. --rotation-runtime-enabled false`: GREEN.
- `pnpm exec prettier --write` 및 `--check tests/static/device-auth-deployment-contract.test.mjs`: GREEN. Dockerfile은 Prettier parser가 없어 최소 수동 diff로 확인했다.

## 운영 경계와 다음 단계

- supplied RED operational evidence는 CI `29783895303` all-green 뒤 source hash `16e89ecede58daf17f0790f29b87817c8e0cf45c0db6ca3d86daee1bbc079d98`, tag `yjlaser-webhard-api:46c5955f-16e89ecede58`의 `docker build --pull=false --no-cache --iidfile`가 Dockerfile:27 `RUN pnpm build`에서 약 2044 MiB V8 heap OOM으로 exit 1한 것이다. Engine 약 15.45 GiB, iid/image는 없었다.
- 지시된 경계에 따라 Docker retry/rebuild, image 확인, CI 재실행, deploy/migration/DB/secret/env/server, stage/commit/push는 수행하지 않았다.
- actual Docker retry와 commit/push/CI 뒤 검증은 main 작업자가 수행한다.
