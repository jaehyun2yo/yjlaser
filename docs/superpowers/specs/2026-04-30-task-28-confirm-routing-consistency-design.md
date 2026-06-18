# Task 28 — confirm-routing-consistency Design

> **Status**: Design (brainstorm-approved 2026-04-30). Implementation in a follow-up session.

**Goal**: presigned-url 과 confirm endpoint 의 routing 동작 대칭화. task 26 Phase 1.5 의 `tryRouteExternalUpload` 가 presigned-url 응답에는 redirected folderId 를 박지만, 후속 confirm 호출이 원본 husk folderId 를 사용해 DB row 와 R2 path 가 분리되는 split-brain 결함을 해결.

**Symptom**: 외부웹하드 sync 가 매핑 등록된 회사 폴더로 redirect 되어야 하는데, R2 PUT 은 회사 경로로 가지만 WebhardFile DB row 는 husk 폴더를 가리킴 → admin UI 의 husk 트리에 파일이 노출되고 회사 사용자에게는 안 보이는 가시성 불일치.

**Reproduction (2026-04-30 사용자 dev 환경)**:

- alias `대성목형(2265-1295) → 대성목형(id=4)` approved 등록
- 신규 sync 파일 `260430(31361).dxf` 업로드
- DB 결과:
  - `webhard_files.path` = `webhard/company-4/f78e1ea0.../...` (회사 R2 경로)
  - `webhard_files.folder_id` = `f5c0d572...` (husk root)
  - `webhard_files.company_id` = `null`
- 기대: `folder_id` = 회사 root 폴더 id, `company_id` = 4

---

## Architecture

**core principle**: 두 endpoint 가 독립적으로 routing 검사 → R2 와 DB 의 일관성 보장.

```
[presigned-url]  → tryRouteExternalUpload → routed folderId/companyId → R2 PUT (회사 경로)
[confirm]        → tryRouteExternalUpload → routed folderId/companyId → DB row (회사 폴더)
```

**불변 규칙**:

- `tryRouteExternalUpload` 은 멱등 (`ensureRoutingTarget` 의 lazy create 가 멱등) → 양쪽 호출 안전
- task 27 husk 정책 그대로 — husk 는 살아있어야 routing 진입점 보장 (deletedAt=null)
- R2 path 미변경 (이미 회사 경로로 박혀있어 추가 작업 불필요)

**범위**:

- 변경: `confirmUpload`, `batchConfirmUpload` (`webhard-api/src/files/files.service.ts`)
- 변경 없음: `getUploadPresignedUrl`, `getUploadPresignedUrlBatch`, `tryRouteExternalUpload` (그대로 재사용)

**대안 (각하)**: 공유 헬퍼 `resolveEffectiveFolder` 추출 → presigned-url + confirm 모두 사용. DRY 하지만 task 26 의 안정 흐름까지 리팩토링 필요. 별도 task 로 분리 가능.

---

## Components & Data Flow

### `confirmUpload` 변경 흐름

위치: `webhard-api/src/files/files.service.ts:356`

```ts
async confirmUpload(dto, user) {
  let folder = dto.folderId ? await verifyFolderAccess(...) : null;

  // [신규] task 28: routing consistency
  let routedFolderId: string | null = null;
  let routedCompanyId: number | null = null;
  let redirected = false;
  if (dto.folderId) {
    try {
      const routed = await this.tryRouteExternalUpload(dto.folderId);
      if (routed) {
        routedFolderId = routed.folderId;
        routedCompanyId = routed.companyId;
        redirected = true;
      }
    } catch (err) {
      this.logger.warn(
        `confirmUpload routing failed — folderId=${dto.folderId} key=${dto.key} filename=${dto.name} error=${err instanceof Error ? err.message : err}`
      );
      // fallback — DB row 는 husk 에 박히지만 R2 PUT 이미 완료 → 막지 않음
    }
  }

  const effectiveFolderId = routedFolderId ?? dto.folderId ?? null;
  const effectiveCompanyId =
    user.userType === 'company' ? user.companyId
    : redirected && routedCompanyId !== null ? routedCompanyId
    : (dto.companyId ?? folder?.companyId ?? null);

  // create WebhardFile with effectiveFolderId + effectiveCompanyId
  // event emit 도 effectiveFolderId 사용
}
```

### `companyId` precedence (presigned-url 과 동일)

1. company user → `user.companyId`
2. admin + redirected → `routedCompanyId`
3. admin + `dto.companyId` 명시 → `dto.companyId`
4. admin + folder 있음 → `folder.companyId`
5. else → `null`

### `batchConfirmUpload` 변경 흐름

위치: `webhard-api/src/files/files.service.ts:444`

- per-file routing 적용 — `dto.files.map` 안에서 각 file 의 folderId 별로 `tryRouteExternalUpload` 호출
- folderInfoMap 캐싱과 충돌 없음 (routing 결과는 file 단위로 처리)
- 실패 케이스도 per-file try/catch + warn log + fallback (per-file index 포함)

### `tryRouteExternalUpload` 접근성

현재 `private`. 두 confirm 함수 모두 같은 service 내 메서드이므로 그대로 호출 가능. public 화 불필요.

---

## Error Handling & Logging

**원칙**: routing 실패 시 confirm 자체는 성공 (R2 orphan 방지) + 운영자가 로그로 추적 가능.

### 로그 레벨 구분

- **WARN**: routing 시도 실패 (catch 블록) — DB row husk 박힘 우려, 추적 필요
- **LOG**: 정상 redirected 케이스 — 평시 로그, 운영 통계용

### 로그 형식

```ts
// 실패 (routing throw)
this.logger.warn(
  `confirmUpload routing failed — folderId=${dto.folderId} key=${dto.key} filename=${dto.name} error=${msg}`
);

// 성공 + redirected
this.logger.log(
  `confirmUpload routed — original=${dto.folderId} → routed=${routedFolderId} companyId=${routedCompanyId} key=${dto.key}`
);
```

### batchConfirmUpload per-file 로그

```ts
this.logger.warn(
  `batchConfirmUpload routing failed [${idx}/${dto.files.length}] folderId=${file.folderId} key=${file.key} filename=${file.name} error=${msg}`
);
```

### 기존 에러 처리 (변경 없음)

- `verifyFolderAccess` throw → 그대로 NotFoundException (folderId 자체 검증 단계는 routing 이전)
- `confirmUpload.create` (DB write) throw → 그대로 (별개 케이스)

---

## Testing

### 단위 테스트 신규 (`webhard-api/src/files/__tests__/files.service.spec.ts`)

**describe `task 28: confirmUpload routing consistency`**:

| 케이스 | 검증                                                                                  |
| ------ | ------------------------------------------------------------------------------------- |
| C1     | external husk folderId → DB row 가 routed folderId/companyId 로 생성                  |
| C2     | non-external folderId (회사 폴더) → routing 미적용, dto.folderId 그대로               |
| C3     | folderId=null (root upload) → routing skip, 기존 동작 유지                            |
| C4     | routing throw → catch + warn 로그 + fallback (dto.folderId 사용), confirm 자체는 성공 |
| C5     | redirected 시 emitToFolder event payload 의 folderId 도 routed 값 사용                |

**describe `task 28: batchConfirmUpload routing consistency`**:

| 케이스 | 검증                                                                   |
| ------ | ---------------------------------------------------------------------- |
| BC1    | 배치 내 일부 file 만 external → 해당 file 만 redirected, 나머지 그대로 |
| BC2    | 배치 내 1건 routing throw → 그 1건만 fallback, 나머지 영향 없음        |

### 기존 테스트 회귀 가드

- `task 26 phase 1.5: getUploadPresignedUrl routing (R1~R5)` — 변경 없음 (presigned-url 미변경)
- `task 25 F1-F4: confirmUpload — companyId 상속` — admin + non-routed 케이스 그대로 동작 검증
- `task 25 F5: batchConfirmUpload — companyId 상속` — 회귀 없는지 확인

### Mock 전략

- `tryRouteExternalUpload` 자체는 spy / stub
- 또는 `prisma.webhardFolder.findUnique` mock 으로 간접 제어 (path 가 `/외부웹하드/...` 시작하는지로 routing 분기 트리거)
- E2E/integration 테스트는 본 task 범위 외 — 단위 테스트만으로 routing 호출 계약 검증

---

## Recovery Strategy

**기존 misrouted 파일 처리** (코드 변경 없음):

1. 백엔드 fix 배포
2. admin UI `/admin/integration/companies` → "등록된 매핑" 패널의 [재마이그레이션] 클릭
3. `runCascadeBackfill` → `migrateExternalFolderTreeToCompany` BFS 가 husk 트리 순회 → folderId=husk 인 파일 모두 회사 폴더로 이동
4. R2 path 는 변경 없음 (이미 회사 경로) — DB folderId/companyId 만 갱신되어 정합

**운영 검증 흐름**:

1. fix 배포 후 Electron sync 1건 트리거
2. NestJS 로그 확인 — `confirmUpload routed —` LOG 라인 노출
3. DB 직접 조회 — `webhardFile.folderId` 가 회사 폴더 id 인지 확인
4. UI 화면 — husk 비어있고 회사 폴더에 신규 파일 노출

**기 유실 검증 SQL**:

```sql
-- 회복 대상 색출 (배포 직후 1회 실행)
SELECT f.id, f.name, f.path, f.folder_id, fold.path AS folder_path, f.company_id
FROM webhard_files f
LEFT JOIN webhard_folders fold ON fold.id = f.folder_id
WHERE f.path LIKE 'webhard/company-%'
  AND fold.path LIKE '/외부웹하드/%'
  AND f.deleted_at IS NULL;
```

이 결과가 0건이면 [재마이그레이션] 이 모두 정리한 것. 0 건이 아니면 추가 진단 필요.

---

## References

- `docs/specs/features/external-folder-migration.md` — task 26 본 spec
- `docs/superpowers/plans/2026-04-30-task-27-external-husk-policy.md` — task 27 husk 정책 (routing 진입점 보존)
- `webhard-api/src/files/files.service.ts:185-279` — task 26 Phase 1.5 routing (`getUploadPresignedUrl`, `tryRouteExternalUpload`)
- `webhard-api/src/files/files.service.ts:356` — `confirmUpload` (수정 대상)
- `webhard-api/src/files/files.service.ts:444` — `batchConfirmUpload` (수정 대상)

---

## Open Questions

(Brainstorm 단계에서 모두 해소 — 추가 질문 없음)
