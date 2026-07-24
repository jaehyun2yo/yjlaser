# Task E — runtime Doppler entrypoint report

## 상태

`COMPLETE`

## 변경

- 단일 `webhard-api/docker-entrypoint.sh`를 추가하고 Docker CMD와 Railway startCommand를
  모두 `/app/docker-entrypoint.sh`로 결속했다.
- token이 있으면 Doppler를 통해, 없으면 직접 Node로 시작하며 두 분기 모두 `exec`로
  PID 1을 넘긴다. startup migration은 없다.
- Docker build가 Windows CRLF를 제거하고 실행 권한을 부여하도록 했다. 기존 build 전용
  `NODE_OPTIONS=--max-old-space-size=4096`과 runtime `NODE_OPTIONS` 부재는 유지했다.

## TDD 증거

- RED: 기존 직접 Node CMD와 누락된 entrypoint 때문에 정적 계약 5개 중 신규 2개가
  예상대로 실패했다(exit 1, 3 pass/2 fail).
- GREEN: 최소 source 수정 후 같은 suite가 exit 0, 5/5 pass했다.

## 검증

- 정적 배포 계약: 5/5 pass.
- `/bin/sh -n`: exit 0. source entrypoint는 131 bytes, CR 0, LF 8이다.
- PATH stub dry probe: token 없음은 `node:dist/src/main`, synthetic token 있음은
  `doppler:run -- node dist/src/main`으로 종료했다. 실제 Doppler network/secret과 Nest 서버는
  사용하지 않았다.
- backend TypeScript와 Nest build: exit 0. build는 기존 npm config warning만 출력했다.
- source compatibility collector: `result: compatible`; rotation-disabled 5개 HTTP target은
  404/no-store이며 controller/service/Prisma write는 0이다.
- Prettier, `git diff --check`, 변경 파일 secret denylist scan: 통과.
- 최초 spec review의 Important 1/Minor 1은 entrypoint 전체 source exact equality,
  Railway startCommand 단일 exact 값, build heap exact 4096 계약으로 해소했다. runtime
  `NODE_OPTIONS` mutation RED 4/5 뒤 복원 GREEN 5/5를 확인했다.
- 최초 quality review의 Important 1은 Railway 배포 가이드의 구 startCommand 3곳과
  startup migration 설명을 현재 config-as-code 계약으로 동기화해 해소했다.
- fresh spec/quality re-review: 모두 APPROVED, Critical/Important/Minor 0/0/0.

## CI와 Docker image 검증

- source commit `06b0e6b1`을 push했다.
- GitHub CI run `29786176056`: Lint, Type Check, Test, NestJS Type Check, Build 5개
  job이 모두 success다. GitHub Actions Node 20 deprecation annotation은 별도 유지보수 항목이다.
- `--pull=false --no-cache` build가 tag `yjlaser-webhard-api:06b0e6b1-task-e`, image ID
  `sha256:ac011111dd40c566159cf3008326b71057db4ba3e9f88f11856621765d7857b3`으로 성공했다.
- image inspect는 CMD `[/app/docker-entrypoint.sh]`, runtime `NODE_OPTIONS` 부재를 확인했다.
  entrypoint는 mode 755, CR 0이며 shell syntax 검사를 통과했다.
- built-image offline PATH stub probe는 token 없음 `node:dist/src/main`, synthetic token 있음
  `doppler:run -- node dist/src/main`을 각각 반환했다. 실제 Doppler network/secret과 Nest 서버는
  사용하지 않았다.
- built collector는 exit 0, rotation status 7개 수용/invalid 3개 거부, runtime-disabled 5개
  target 404/no-store와 controller/service/Prisma write 0을 확인했다.

## 운영 경계

운영 배포, secret 조회/변경, Railway/Doppler 환경변수 변경, DB 연결, migration 실행은
수행하지 않았다.
