# Webhard Performance Fixtures

Status: active test guide (AUDIT-06, 2026-05-10)

## 목적

웹하드 성능 개선 PR에서 대량 폴더/파일 조건을 재현하되, 기본 CI 시간을 늘리지 않기 위해 heavy fixture 테스트를 opt-in으로 분리한다.

## Helper

위치: `webhard-api/test/helpers/test-utils.ts`

- `buildWebhardFolderTreeFixture`
  - deterministic in-memory folder tree를 생성한다.
  - 예: `totalFolders: 10_000`, `childrenPerFolder: 8`
- `buildWebhardFileFixture`
  - deterministic in-memory file fixture를 생성한다.
  - 예: `totalFiles: 100_000`
- `buildWebhardFixtureCleanupWhere`
  - `perf-`로 시작하는 안전한 prefix만 cleanup where 절을 만든다.
- `shouldRunWebhardPerfTests`
  - `RUN_PERF_TESTS=1`일 때만 heavy 테스트를 켠다.

## 기본 검증

기본 CI와 일반 개발 검증에서는 소량 fixture 정확도와 gate만 검증한다.

```powershell
cd webhard-api
pnpm test -- folders.service.spec.ts --runInBand
pnpm test -- files.service.spec.ts --runInBand
```

## Opt-in 성능 fixture 검증

10k folders / 100k files fixture 생성 검증은 명시적으로만 실행한다.

```powershell
cd webhard-api
$env:RUN_PERF_TESTS='1'; pnpm test -- folders --runInBand
```

## Cleanup 규칙

DB 삽입형 성능 테스트를 추가할 때는 `buildWebhardFixtureCleanupWhere(prefix)`를 사용한다. prefix는 `perf-`로 시작하고 충분히 구체적인 값이어야 한다. 짧거나 일반적인 prefix는 삭제 범위를 넓힐 수 있으므로 helper가 거부한다.
