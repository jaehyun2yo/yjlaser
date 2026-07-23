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

## 장치 인증 환경별 secret 책임

장치 인증은 개발·스테이징·운영 환경을 하나의 keyring으로 공유하지 않는다. Backend
config마다 아래 이름은 같게 유지하되 값은 환경별로 독립 관리한다.

- `DEVICE_AUTH_ENVIRONMENT`: 개발 `dev`, 스테이징 `stg`, 운영 `prd`
- `DEVICE_AUTH_CREDENTIAL_CURRENT_HASH_KEY_VERSION`
- `DEVICE_AUTH_CREDENTIAL_PEPPER_KEYRING_JSON`
- `DEVICE_AUTH_AUDIT_HMAC_SECRET`
- `DEVICE_AUTH_ACCESS_TOKEN_ISSUER`
- `DEVICE_AUTH_ACCESS_TOKEN_AUDIENCE`
- `DEVICE_AUTH_ACCESS_TOKEN_CURRENT_KID`
- `DEVICE_AUTH_ACCESS_TOKEN_SIGNING_KEYRING_JSON`
- `DEVICE_AUTH_TOKEN_EXCHANGE_HMAC_SECRET`
- `DEVICE_AUTH_BOOTSTRAP_RATE_LIMIT_HMAC_SECRET`
- Redis/Upstash 및 database 연결 정보

Frontend의 `NEXT_PUBLIC_DEVICE_AUTH_ENVIRONMENT`는 비밀값이 아니며 배포 대상 식별자다.
Backend의 `DEVICE_AUTH_ENVIRONMENT`와 정확히 일치해야 한다. 환경 불일치가 감지되면
관리자 화면은 장치 조회·등록·승인·폐기·재발급을 모두 차단한다.

환경별 credential/access-token keyring과 audit/token-exchange/rate-limit HMAC
namespace는 서로 재사용하면 안 된다. 특히 개발 keyring/HMAC 값을 운영에 재사용하는
것은 금지한다. 문서, 로그, 배포 명령에는 실제 secret 값을 기록하지 않는다.
