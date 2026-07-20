# Task C — CI gate closure brief

## 범위

- GitHub Actions [run 29782813735](https://github.com/jaehyun2yo/yjlaser/actions/runs/29782813735)의 root lint 35개 오류와 Ubuntu에서 `rg` 부재로 실패한 secret fallback static gate를 최소 수정한다.
- lint 오류가 있던 정확히 12개 파일과 root `tests/security/secret-fallback-static-gate.test.ts`만 수정한다. `device-endpoint-policy.guard.spec.ts`는 오류 목록 밖이므로 읽기 전용이다.
- package/lockfile/workflow, 애플리케이션 동작, deploy/migration/DB/secret/env/server, commit/push는 변경하지 않는다.

## 계약

1. root eslint error-only 결과는 0 files / 0 errors여야 한다. 기존 warning은 이 작업 범위 밖이다.
2. secret fallback static gate는 `rg` 실행 파일에 의존하지 않고, 기존 `src`, `webhard-api/src`, `middleware.ts` 스캔 루트·TypeScript 확장자·test/spec/d.ts 제외 규칙을 보존한다.
3. 테스트의 동적 `require`는 정적 import로 바꾸고, 빌드 산출물의 런타임 경로를 실제로 선택하는 collector만 좁은 `createRequire(__filename)`을 사용한다.

## TDD 증거

- RED: lint JSON은 12개 파일 35 errors를 확인했다 (`no-require-imports` 23, `no-assign-module-variable` 10, `no-unsafe-function-type` 2).
- RED: GitHub Ubuntu CI test job은 `spawnSync rg ENOENT`로 secret fallback gate에서 실패했다. 로컬 Windows는 `rg`가 있어 동일 test가 통과하므로 CI 증적을 원인으로 사용한다.
- GREEN: Node `fs` deterministic traversal 및 최소 lint 수정 후 focused/root 검증을 실행한다.
