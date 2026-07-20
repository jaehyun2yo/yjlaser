# Rotation endpoint policy Task 6 brief

상태: `SOURCE_ONLY_DONE — evidence doc fix applied`

기준일: 2026-07-20

## 소유 범위

- `webhard-api/scripts/collect-device-auth-rotation-compatibility-evidence.ts`
- `webhard-api/scripts/collect-device-auth-rotation-compatibility-evidence.spec.ts`
- clean RC Task 6 report/final report/progress/changelog

Parent root contract, canonical fixture, JS/Python verifier, completion master와 release plan은
`/root/task6_parent_contract` 소유다. desktop 3개 프로젝트와 `computeroff`는 읽거나 수정하지 않는다.

## TDD와 검증 계획

1. collector import 부재, source hash 제외 규칙, schema/status/nullable-column lock,
   runtime-disabled zero-operation, built-artifact fail-closed를 RED로 확인한다.
2. DB/network/process start 없이 read-only collector를 최소 구현하고 focused spec을 GREEN으로 만든다.
3. Task 1~5를 포함한 중앙 source suite, TypeScript, Nest build, placeholder-only Prisma validate,
   Prettier, diff/marker/credential scan을 실행한다.
4. Docker는 daemon 상태만 read-only로 확인한다. build/start/pull/push 및 daemon 시작은 하지 않는다.

## 운영 경계

실제 DB/migration apply, secret, 배포, 장치/PC 검증, desktop fixture copy, artifact publish/sign은
미수행 상태로 유지한다. `--require-copies 0`은 중앙 source-only 증적이며 desktop 호환 증적이 아니다.
