# Task D — Docker build heap brief

## 범위

- `webhard-api/Dockerfile`의 NestJS build 단계에서만 Node V8 heap 상한을 최소 4096 MiB로 설정한다.
- Node 내장 정적 배포 계약으로 build 단계의 scoped heap 설정과 runtime 경계(CMD/ENV)를 잠근다.

## 관찰된 실패

- CI run `29783895303`은 all-green이었다.
- source hash `16e89ecede58daf17f0790f29b87817c8e0cf45c0db6ca3d86daee1bbc079d98`, deterministic tag `yjlaser-webhard-api:46c5955f-16e89ecede58`의 Docker build는 `--pull=false --no-cache --iidfile` 조건에서 Dockerfile:27 `RUN pnpm build` 중 V8 heap 약 2044 MiB의 `Ineffective mark-compacts near heap limit / JavaScript heap out of memory`로 exit 1이었다.
- Docker Engine은 약 15.45 GiB였고 iid/image는 생성되지 않았다.

## 계약

1. 유일한 `pnpm build` Docker RUN은 `NODE_OPTIONS=--max-old-space-size=<MiB>`를 process-scoped로 받고 값은 4096 이상이다.
2. `NODE_OPTIONS`는 build RUN에만 존재하며 global `ENV`나 runtime `CMD`로 전파되지 않는다.
3. startup command는 정확히 `CMD ["node", "dist/src/main"]`으로 유지하며 migration을 추가하지 않는다.

## 금지 경계

Docker 재빌드, image/registry/sign, deploy, migration, DB, secret/env/server, stage/commit/push를 수행하지 않는다.
