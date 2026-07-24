# Task E — runtime Doppler entrypoint brief

## 원인

Task A에서 Docker 시작 명령을 직접 `node dist/src/main`으로 고정하면서, Railway의
`DOPPLER_TOKEN`을 실제 런타임 환경변수로 주입하던 `doppler run` 경로도 함께 제거됐다.
또한 `webhard-api/railway.toml`의 `startCommand`가 Docker CMD를 별도로 덮어쓰므로 두
시작 경계를 하나의 entrypoint에 결속해야 한다.

## 범위와 계약

- `webhard-api/docker-entrypoint.sh`를 Docker CMD와 Railway startCommand가 함께 호출한다.
- `DOPPLER_TOKEN`이 있으면 `exec doppler run -- node dist/src/main`을 실행한다.
- `DOPPLER_TOKEN`이 없으면 `exec node dist/src/main`을 실행한다.
- 어느 경로도 Prisma migration을 실행하지 않는다.
- Docker build의 process-scoped 4096 MiB heap과 runtime `NODE_OPTIONS` 부재를 유지한다.
- Windows checkout의 CRLF는 image build에서 LF로 정규화하고 entrypoint를 executable로 만든다.

## 소유 파일

- `webhard-api/Dockerfile`
- `webhard-api/railway.toml`
- `webhard-api/docker-entrypoint.sh`
- `tests/static/device-auth-deployment-contract.test.mjs`
- `docs/doppler.md`
- `.superpowers/sdd/task-e-runtime-doppler-entrypoint-{brief,report}.md`
- `.superpowers/sdd/progress.md`
- `docs/changelog/CHANGELOG.md`

## 금지 경계

운영 배포, secret 조회/변경, Railway/Doppler 환경변수 변경, DB 연결, migration 실행은
수행하지 않는다.
