# Doppler runtime startup

회사사이트 Webhard API image에는 Doppler CLI가 포함된다. Docker와 Railway는 모두
`/app/docker-entrypoint.sh` 하나만 시작점으로 사용한다.

```sh
#!/bin/sh
set -eu

if [ -n "${DOPPLER_TOKEN:-}" ]; then
  exec doppler run -- node dist/src/main
else
  exec node dist/src/main
fi
```

- Railway에 대상 환경의 read-only service token인 `DOPPLER_TOKEN`이 있으면 Doppler가
  해당 config의 secret을 process 환경에 주입한 뒤 NestJS를 시작한다.
- token이 없으면 이미 주입된 process 환경을 사용해 NestJS를 직접 시작한다.
- token 값이나 secret 값은 저장소, 로그, 명령 인자, 문서에 기록하지 않는다.
- startup 경로에서는 migration을 실행하지 않는다. migration은 승인된 대상 DB를 확인한
  뒤 별도의 one-off `pnpm migrate:deploy` 절차로만 실행한다.
