# Task B — root lockfile 정합성 brief

## 범위

- root `package.json`의 `pnpm.overrides`와 root `pnpm-lock.yaml`의 top-level `overrides`를 정확히 일치시킨다.
- GitHub CI root Type Check/Lint/Test를 막은 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`를 lockfile 재생성으로 해소한다.
- package manifest를 수정하지 않으며, 실제 배포·migration·DB·secret·환경·서버·commit·push를 수행하지 않는다.

## 소유 파일

- `pnpm-lock.yaml`
- `.superpowers/sdd/task-b-lockfile-consistency-{brief,report}.md`
- `.superpowers/sdd/progress.md`
- `docs/changelog/CHANGELOG.md`

## 계약 및 판정

1. `package.json`의 10개 `pnpm.overrides` 항목과 lockfile top-level `overrides`가 key/value까지 정확히 같다.
2. `npx --yes pnpm@9.15.9 install --frozen-lockfile --lockfile-only --ignore-scripts`가 성공한다.
3. 재생성 diff의 직접 변경은 manifest의 `nodemailer ^9.0.1` 해석과 manifest `pnpm.overrides`(esbuild, hono, js-yaml, ws)의 해석으로 설명된다. 나머지는 해당 direct/peer 의존성의 snapshot 전파다.

## TDD 증거

- RED (main 사전 재현): 같은 exact pnpm 9 frozen command가 `ERR_PNPM_LOCKFILE_CONFIG_MISMATCH`로 실패했다. 원인은 manifest에는 있으나 lockfile에는 없거나 다른 overrides였다.
- GREEN: manifest 변경 없이 pnpm 9.15.9로 lockfile-only 재생성 후 같은 command가 exit 0이어야 한다.

## 정적 계약 선택

CI의 root Type Check/Lint/Test job이 이미 각각 `pnpm install --frozen-lockfile`을 실행한다. 별도 static test를 만들거나 CI workflow를 수정하면 이 작업의 lockfile 정합성 범위를 넓히므로 추가하지 않는다.
