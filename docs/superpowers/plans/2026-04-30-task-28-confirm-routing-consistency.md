# Task 28 — confirm-routing-consistency Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `confirmUpload` 와 `batchConfirmUpload` 에 task 26 의 `tryRouteExternalUpload` 동일 적용 — presigned-url 과 confirm 의 routing 동작 대칭화로 R2 PUT 경로와 DB row 의 split-brain 결함 해결.

**Architecture:** 두 endpoint 가 독립적으로 routing 검사. 각 함수가 `dto.folderId` 로 `tryRouteExternalUpload` 호출 → redirected folderId/companyId 반환되면 그것 사용, 실패 시 try/catch + warn 로그 + 원본 fallback (R2 orphan 방지). 멱등 — `ensureRoutingTarget` 의 lazy create 가 이미 멱등.

**Tech Stack:** NestJS 10, Prisma, Postgres (Supabase), Jest.

---

## 배경 — 새 세션 worker 가 알아야 할 컨텍스트

### split-brain 결함 (2026-04-30 dev 환경에서 reproduce)

task 26 Phase 1.5 의 `tryRouteExternalUpload` 가:

- **presigned-url 응답**: 회사 폴더로 redirected folderId 반환 → R2 PUT 이 회사 경로로 박힘
- **후속 confirm**: Electron 이 원본 husk folderId 를 그대로 confirm body 에 사용 → DB `webhard_files.folder_id` 가 husk 를 가리킴

결과: R2 path = `webhard/company-4/...`, DB folder_id = husk uuid → admin UI husk 트리에 파일 노출 / 회사 사용자에게는 안 보임.

### 사용자가 합의한 정책 (2026-04-30 brainstorm)

| 항목           | 결정                                                                                    |
| -------------- | --------------------------------------------------------------------------------------- |
| 수정 위치      | 백엔드만 (Electron 미변경) — 양 endpoint 의 routing 일관성은 백엔드 책임                |
| 적용 함수      | `confirmUpload` + `batchConfirmUpload` 둘 다 (대칭)                                     |
| 실패 시        | try/catch + warn 로그 + 원본 folderId fallback — confirm 자체는 성공 (R2 orphan 방지)   |
| 회복           | admin UI 의 [재마이그레이션] 버튼 1번 (코드 변경 없음, task 26 의 cascadeBackfill 활용) |
| 공유 헬퍼 추출 | 본 task 범위 외 (presigned-url 까지 리팩토링 필요 → 회귀 위험)                          |

### 불변 규칙 (변경하지 않음)

- task 27 husk 정책 — husk 는 deletedAt=null 유지 (routing 진입점 보존)
- R2 path 미변경 — 이미 `webhard/company-N/...` 로 박힌 파일은 그대로
- presigned-url 흐름 — task 26 R1~R5 그대로
- companyId 상속 precedence — task 25 F1~F5 그대로 (단 redirected 시 그 값이 우선)

### Reproduction 검증 (운영 검증 단계에서 0건 되어야 함)

```sql
SELECT f.id, f.name, f.path, f.folder_id, fold.path AS folder_path, f.company_id
FROM webhard_files f
LEFT JOIN webhard_folders fold ON fold.id = f.folder_id
WHERE f.path LIKE 'webhard/company-%'
  AND fold.path LIKE '/외부웹하드/%'
  AND f.deleted_at IS NULL;
```

---

## 파일 구조 — 변경 영향

### 코드 수정

- **수정**: `webhard-api/src/files/files.service.ts` — `confirmUpload` (~line 356), `batchConfirmUpload` (~line 444)
- **수정**: `webhard-api/src/files/__tests__/files.service.spec.ts` — 신규 describe 블록 2개 추가

### 문서 수정

- **수정**: `docs/specs/features/external-folder-migration.md` — task 28 routing-consistency 섹션 추가
- **수정**: `docs/changelog/CHANGELOG.md` — task 28 항목 추가

---

# Phase A — `confirmUpload` routing

### Task A1: confirmUpload — happy path (C1) + error fallback (C4) 동시 TDD 사이클

**Files:**

- Modify: `webhard-api/src/files/__tests__/files.service.spec.ts` (신규 describe 추가)
- Modify: `webhard-api/src/files/files.service.ts` (`confirmUpload` 메서드, ~line 356-420)

**작업 컨텍스트:**

- 본 task 는 strict TDD: C1 + C4 테스트를 먼저 작성 → 실패 확인 → routing 코드 추가 → 통과 확인.
- C2/C3/C5 는 Task A2 에서 추가 — 이 시점에는 impl 의 fallback 분기가 자연스럽게 만족시키므로 별도 코드 변경 없이 검증만.
- `tryRouteExternalUpload` 은 같은 service 의 private 메서드 — `this.tryRouteExternalUpload(folderId)` 로 호출.

- [ ] **Step 1: 신규 describe 블록 작성 — C1 + C4 테스트만 (실패 예정)**

`webhard-api/src/files/__tests__/files.service.spec.ts` 파일 끝부분 (마지막 describe 다음, 마지막 `})` 직전) 에 추가:

```ts
// task 28: confirmUpload routing consistency (C1~C5)
describe('FilesService.confirmUpload routing consistency (task 28)', () => {
  let service: FilesService;
  let prisma: ReturnType<typeof makePrisma>;
  let storage: { invalidateStorageCache: jest.Mock };
  let events: { emitToFolder: jest.Mock; emitToFolderBatched: jest.Mock };
  let autoContact: { detectAndCreate: jest.Mock };
  let folders: { propagateUpdatedAt: jest.Mock };
  let webhardConfig: { getStatusMapping: jest.Mock };

  // 외부 husk root + 회사 root setup helper
  const HUSK_ID = 'husk-root-uuid';
  const COMPANY_ROOT_ID = 'company-root-uuid';
  const COMPANY_ID = 4;

  beforeEach(() => {
    prisma = makePrisma();
    storage = { invalidateStorageCache: jest.fn().mockResolvedValue(undefined) };
    events = { emitToFolder: jest.fn(), emitToFolderBatched: jest.fn() };
    autoContact = { detectAndCreate: jest.fn().mockResolvedValue(undefined) };
    folders = { propagateUpdatedAt: jest.fn().mockResolvedValue(undefined) };
    webhardConfig = { getStatusMapping: jest.fn() };
    service = new FilesService(
      prisma as never,
      storage as never,
      events as never,
      autoContact as never,
      folders as never,
      webhardConfig as never
    );
  });

  it('C1: external husk folderId → DB row 가 routed folderId/companyId 로 생성', async () => {
    // verifyFolderAccess 응답: husk 폴더 살아있음
    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce({ id: HUSK_ID, companyId: null, deletedAt: null })
      // tryRouteExternalUpload 의 findUnique: husk path 반환
      .mockResolvedValueOnce({
        id: HUSK_ID,
        name: '대성목형(2265-1295)',
        path: '/외부웹하드/대성목형(2265-1295)',
        folderKind: 'generic',
        companyId: null,
      });

    // lookupCompanyByFolderName 의 의존: companyFolderAlias.findFirst → approved
    prisma.companyFolderAlias.findFirst.mockResolvedValueOnce({
      company: { id: COMPANY_ID, companyName: '대성목형' },
    });

    // 회사 root 폴더 조회
    prisma.webhardFolder.findFirst.mockResolvedValueOnce({ id: COMPANY_ROOT_ID });

    // ensureRoutingTarget — depth=2 husk → 회사 root 그대로 반환 (lazy create 없음)
    // (구체 구현은 service 내부 호출이라 mock 불필요. tryRouteExternalUpload 결과만 검증.)

    prisma.webhardFile.create.mockResolvedValueOnce({
      id: 'file-1',
      name: 'test.dxf',
      folderId: COMPANY_ROOT_ID,
      companyId: COMPANY_ID,
    });

    const dto = {
      key: 'webhard/company-4/company-root-uuid/test.dxf',
      name: 'test.dxf',
      originalName: 'test.dxf',
      size: 1234,
      mimeType: 'application/octet-stream',
      folderId: HUSK_ID,
    };
    const adminUser = { userType: 'admin' as const, userId: 'admin' };

    await service.confirmUpload(dto as never, adminUser as never);

    // 검증: webhardFile.create 호출 시 folderId 가 COMPANY_ROOT_ID, companyId 가 COMPANY_ID
    expect(prisma.webhardFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          folderId: COMPANY_ROOT_ID,
          companyId: COMPANY_ID,
        }),
      })
    );
  });

  it('C4: routing throw → catch + warn 로그 + fallback (dto.folderId 사용), confirm 자체는 성공', async () => {
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

    // verifyFolderAccess 통과
    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce({ id: HUSK_ID, companyId: null, deletedAt: null })
      // tryRouteExternalUpload 안의 findUnique 가 throw
      .mockRejectedValueOnce(new Error('DB connection lost'));

    prisma.webhardFile.create.mockResolvedValueOnce({
      id: 'file-1',
      name: 'test.dxf',
      folderId: HUSK_ID,
      companyId: null,
    });

    const dto = {
      key: 'webhard/test.dxf',
      name: 'test.dxf',
      originalName: 'test.dxf',
      size: 1234,
      mimeType: 'application/octet-stream',
      folderId: HUSK_ID,
    };
    const adminUser = { userType: 'admin' as const, userId: 'admin' };

    // throw 안 함, 정상 응답
    await expect(service.confirmUpload(dto as never, adminUser as never)).resolves.toBeDefined();

    // fallback: 원본 folderId 로 create
    expect(prisma.webhardFile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          folderId: HUSK_ID,
        }),
      })
    );

    // warn 로그 호출됨
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/confirmUpload routing failed.*folderId=husk-root-uuid/)
    );
  });
});
```

**중요**: 위 테스트는 `makePrisma` 헬퍼 + `prisma.companyFolderAlias.findFirst` mock 을 사용한다. 기존 spec 파일에 `makePrisma` 가 정의되어 있으면 그걸 재사용. 없으면 같은 파일의 다른 describe 블록의 mock 패턴 참조해서 동일 형식 유지.

prisma mock 객체에 `companyFolderAlias.findFirst: jest.fn()` 추가가 필요하면 `makePrisma` 에 한 줄 추가.

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd webhard-api && npx jest src/files/__tests__/files.service.spec.ts -t "task 28" 2>&1 | tail -30
```

기대: C1 FAIL (folderId 가 HUSK_ID 로 그대로 박힘), C4 FAIL (warn 로그 안 호출됨 — 현재 코드는 try/catch 자체가 없음).

- [ ] **Step 3: confirmUpload 메서드에 routing 추가**

`webhard-api/src/files/files.service.ts` 의 `confirmUpload` 메서드 (~line 356) 를 다음과 같이 수정.

찾을 곳 (변경 전):

```ts
  async confirmUpload(dto: ConfirmUploadDto, user: SessionUser): Promise<FileResponseDto> {
    let folder: { id: string; companyId: number | null } | null = null;
    if (dto.folderId) {
      folder = await this.verifyFolderAccess(dto.folderId, user);
    }

    const effectiveCompanyId =
      user.userType === 'company' ? user.companyId : (dto.companyId ?? folder?.companyId ?? null);

    const size = Math.floor(Number(dto.size));
    const uploadedBy = user.userType === 'admin' ? 'admin' : String(user.userId);

    const file = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFile.create({
          data: {
            // ...
            folderId: dto.folderId ?? null,
            companyId: effectiveCompanyId,
            // ...
          },
          // ...
        }),
      { operationName: 'confirmUpload.create' }
    );
```

변경 후:

```ts
  async confirmUpload(dto: ConfirmUploadDto, user: SessionUser): Promise<FileResponseDto> {
    let folder: { id: string; companyId: number | null } | null = null;
    if (dto.folderId) {
      folder = await this.verifyFolderAccess(dto.folderId, user);
    }

    // task 28: routing consistency — presigned-url 과 동일하게 외부웹하드 경로 routing 시도.
    // 매칭 실패 / 예외 시 fallback 으로 원본 folderId 사용 (R2 PUT 이미 완료라 confirm 막지 않음).
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
      }
    }

    const effectiveFolderId = routedFolderId ?? dto.folderId ?? null;

    // companyId 결정 규칙 (Bug 1, task 25 + task 28):
    //   1) company user        → user.companyId
    //   2) admin + redirected → routedCompanyId
    //   3) admin + dto.companyId 명시 → 그 값
    //   4) admin + folder 있음 + 명시 없음 → folder.companyId 상속
    //   5) admin + folder 없음 → null
    let effectiveCompanyId: number | null;
    if (user.userType === 'company') {
      effectiveCompanyId = user.companyId;
    } else if (redirected && routedCompanyId !== null) {
      effectiveCompanyId = routedCompanyId;
    } else {
      effectiveCompanyId = dto.companyId ?? folder?.companyId ?? null;
    }

    if (redirected) {
      this.logger.log(
        `confirmUpload routed — original=${dto.folderId} → routed=${routedFolderId} companyId=${routedCompanyId} key=${dto.key}`
      );
    }

    const size = Math.floor(Number(dto.size));
    const uploadedBy = user.userType === 'admin' ? 'admin' : String(user.userId);

    const file = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFile.create({
          data: {
            name: dto.name,
            originalName: dto.originalName,
            size,
            mimeType: dto.mimeType,
            path: dto.key,
            folderId: effectiveFolderId,
            companyId: effectiveCompanyId,
            uploadedBy: String(uploadedBy),
            inquiryNumber: dto.inquiryNumber ?? null,
            isDownloaded: false,
          },
          include: {
            company: {
              select: {
                companyName: true,
                managerName: true,
              },
            },
          },
        }),
      { operationName: 'confirmUpload.create' }
    );

    // (storage cache invalidate, eventsGateway.emitToFolder 등 기존 흐름 유지 — 단 emit 의 folderId 는
    // effectiveFolderId 사용 — Task A2 의 C5 케이스에서 검증)
```

**중요**: `eventsGateway.emitToFolder` 호출의 folderId 도 `effectiveFolderId` 로 변경. 기존 `dto.folderId ?? null` 두 군데 (emit 의 첫 인자 + payload.folderId) 모두 `effectiveFolderId` 로.

찾을 곳 (변경 전):

```ts
this.eventsGateway.emitToFolder(dto.folderId ?? null, {
  type: 'file:created',
  folderId: dto.folderId ?? null,
  data: { fileId: file.id },
});
```

변경 후:

```ts
this.eventsGateway.emitToFolder(effectiveFolderId, {
  type: 'file:created',
  folderId: effectiveFolderId,
  data: { fileId: file.id },
});
```

또한 `triggerAutoContact` 또는 비슷하게 `dto.folderId` 를 사용하는 부분이 있다면 `effectiveFolderId` 로 일관 적용. (검색: `dto.folderId` in confirmUpload body)

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

```bash
cd webhard-api && npx jest src/files/__tests__/files.service.spec.ts -t "task 28" 2>&1 | tail -20
```

기대: C1 PASS, C4 PASS.

- [ ] **Step 5: 기존 confirmUpload 테스트 회귀 확인 (task 25 F1-F4)**

```bash
cd webhard-api && npx jest src/files/__tests__/files.service.spec.ts -t "confirmUpload" 2>&1 | tail -20
```

기대: 기존 + 신규 모두 PASS. 만약 F1-F4 가 깨지면, mock 의 `webhardFolder.findUnique` 호출 횟수 차이 — `verifyFolderAccess` + `tryRouteExternalUpload` 두 번 호출되니 mock 도 두 번째 응답 추가 필요.

- [ ] **Step 6: 커밋**

```bash
git add webhard-api/src/files/files.service.ts webhard-api/src/files/__tests__/files.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(task 28 Phase A-1): confirmUpload routing consistency — C1/C4

task 26 의 tryRouteExternalUpload 를 confirmUpload 에도 적용. presigned-url
응답의 redirected folderId 가 R2 PUT 만 회사 경로로 보내고 후속 confirm 이
원본 husk folderId 로 DB row 를 박는 split-brain 결함 해결.

- C1: external husk folderId → routed folderId/companyId 로 DB row 생성
- C4: routing throw → catch + warn 로그 + 원본 fallback (R2 orphan 방지)
- companyId precedence — redirected 시 routedCompanyId 우선 (task 25 호환)
- emitToFolder folderId 도 effectiveFolderId 로 일관
EOF
)"
```

---

### Task A2: confirmUpload — edge cases (C2/C3/C5)

**Files:**

- Modify: `webhard-api/src/files/__tests__/files.service.spec.ts`

**작업 컨텍스트:** Task A1 의 impl 은 이미 routing 분기를 포함하므로 C2/C3/C5 는 별도 코드 변경 없이 검증 가능. 회귀 가드 강화 목적.

- [ ] **Step 1: C2/C3/C5 테스트 추가**

`task 28` describe 블록 안에 추가:

```ts
it('C2: non-external folderId (회사 폴더) → routing 미적용, dto.folderId 그대로 사용', async () => {
  const COMPANY_FOLDER_ID = 'company-folder-uuid';
  prisma.webhardFolder.findUnique
    // verifyFolderAccess
    .mockResolvedValueOnce({ id: COMPANY_FOLDER_ID, companyId: COMPANY_ID, deletedAt: null })
    // tryRouteExternalUpload — 회사 폴더는 path 가 /외부웹하드/ 로 시작 안 함
    .mockResolvedValueOnce({
      id: COMPANY_FOLDER_ID,
      name: '대성목형',
      path: '/대성목형',
      folderKind: 'generic',
      companyId: COMPANY_ID,
    });

  prisma.webhardFile.create.mockResolvedValueOnce({
    id: 'file-2',
    folderId: COMPANY_FOLDER_ID,
    companyId: COMPANY_ID,
  });

  const dto = {
    key: 'webhard/company-4/company-folder-uuid/test.dxf',
    name: 'test.dxf',
    originalName: 'test.dxf',
    size: 1234,
    mimeType: 'application/octet-stream',
    folderId: COMPANY_FOLDER_ID,
  };
  const adminUser = { userType: 'admin' as const, userId: 'admin' };

  await service.confirmUpload(dto as never, adminUser as never);

  expect(prisma.webhardFile.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        folderId: COMPANY_FOLDER_ID,
        companyId: COMPANY_ID, // folder.companyId 상속 (precedence #4)
      }),
    })
  );
});

it('C3: folderId=null (root upload) → routing skip, 기존 동작 유지', async () => {
  prisma.webhardFile.create.mockResolvedValueOnce({
    id: 'file-3',
    folderId: null,
    companyId: null,
  });

  const dto = {
    key: 'webhard/root-test.dxf',
    name: 'root-test.dxf',
    originalName: 'root-test.dxf',
    size: 1234,
    mimeType: 'application/octet-stream',
    // folderId 없음
  };
  const adminUser = { userType: 'admin' as const, userId: 'admin' };

  await service.confirmUpload(dto as never, adminUser as never);

  // tryRouteExternalUpload 자체가 호출 안 됨 (verifyFolderAccess 도 skip)
  expect(prisma.webhardFolder.findUnique).not.toHaveBeenCalled();
  expect(prisma.webhardFile.create).toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({
        folderId: null,
        companyId: null,
      }),
    })
  );
});

it('C5: redirected 시 emitToFolder event payload 의 folderId 도 routed 값 사용', async () => {
  prisma.webhardFolder.findUnique
    .mockResolvedValueOnce({ id: HUSK_ID, companyId: null, deletedAt: null })
    .mockResolvedValueOnce({
      id: HUSK_ID,
      name: '대성목형(2265-1295)',
      path: '/외부웹하드/대성목형(2265-1295)',
      folderKind: 'generic',
      companyId: null,
    });
  prisma.companyFolderAlias.findFirst.mockResolvedValueOnce({
    company: { id: COMPANY_ID, companyName: '대성목형' },
  });
  prisma.webhardFolder.findFirst.mockResolvedValueOnce({ id: COMPANY_ROOT_ID });
  prisma.webhardFile.create.mockResolvedValueOnce({
    id: 'file-5',
    folderId: COMPANY_ROOT_ID,
    companyId: COMPANY_ID,
  });

  const dto = {
    key: 'webhard/company-4/company-root-uuid/test.dxf',
    name: 'test.dxf',
    originalName: 'test.dxf',
    size: 1234,
    mimeType: 'application/octet-stream',
    folderId: HUSK_ID,
  };
  const adminUser = { userType: 'admin' as const, userId: 'admin' };

  await service.confirmUpload(dto as never, adminUser as never);

  // emitToFolder 호출 검증 — folderId 인자 + payload.folderId 둘 다 routed
  expect(events.emitToFolder).toHaveBeenCalledWith(
    COMPANY_ROOT_ID,
    expect.objectContaining({
      type: 'file:created',
      folderId: COMPANY_ROOT_ID,
    })
  );
});
```

- [ ] **Step 2: 테스트 실행 → 모두 통과 확인**

```bash
cd webhard-api && npx jest src/files/__tests__/files.service.spec.ts -t "task 28" 2>&1 | tail -20
```

기대: C1, C2, C3, C4, C5 모두 PASS (5/5).

- [ ] **Step 3: 커밋**

```bash
git add webhard-api/src/files/__tests__/files.service.spec.ts
git commit -m "test(task 28 Phase A-2): confirmUpload routing edge cases — C2/C3/C5

- C2: non-external folderId → routing 미적용 회귀 가드
- C3: folderId=null → routing skip (기존 동작)
- C5: redirected 시 emitToFolder 이벤트도 routed folderId 사용"
```

---

# Phase B — `batchConfirmUpload` routing

### Task B1: batchConfirmUpload — per-file routing TDD 사이클 (BC1 + BC2)

**Files:**

- Modify: `webhard-api/src/files/__tests__/files.service.spec.ts`
- Modify: `webhard-api/src/files/files.service.ts` (`batchConfirmUpload` 메서드, ~line 444-580)

**작업 컨텍스트:**

- batchConfirmUpload 의 main flow 는 `validFiles.map((f) => ({ ... data ... }))` 로 createMany. 여기에 per-file routing 적용 — file 별로 `tryRouteExternalUpload(f.folderId)` 호출.
- routing 결과를 `Map<originalFolderId, RoutedInfo>` 로 캐싱하면 배치 내 동일 husk folderId 가 여러 번 등장해도 routing 1회만 호출.
- emitToFolderBatched 의 folderId 도 routed 값 사용.

- [ ] **Step 1: BC1 + BC2 테스트 작성**

`task 28: confirmUpload` describe 다음에 신규 describe:

```ts
describe('FilesService.batchConfirmUpload routing consistency (task 28)', () => {
  let service: FilesService;
  let prisma: ReturnType<typeof makePrisma>;
  let storage: { invalidateStorageCache: jest.Mock };
  let events: { emitToFolder: jest.Mock; emitToFolderBatched: jest.Mock };
  let autoContact: { detectAndCreate: jest.Mock };
  let folders: { propagateUpdatedAt: jest.Mock };
  let webhardConfig: { getStatusMapping: jest.Mock };

  const HUSK_ID = 'husk-root-uuid';
  const COMPANY_ROOT_ID = 'company-root-uuid';
  const COMPANY_FOLDER_ID = 'company-folder-uuid';
  const COMPANY_ID = 4;

  beforeEach(() => {
    prisma = makePrisma();
    storage = { invalidateStorageCache: jest.fn().mockResolvedValue(undefined) };
    events = { emitToFolder: jest.fn(), emitToFolderBatched: jest.fn() };
    autoContact = { detectAndCreate: jest.fn().mockResolvedValue(undefined) };
    folders = { propagateUpdatedAt: jest.fn().mockResolvedValue(undefined) };
    webhardConfig = { getStatusMapping: jest.fn() };
    service = new FilesService(
      prisma as never,
      storage as never,
      events as never,
      autoContact as never,
      folders as never,
      webhardConfig as never
    );
  });

  it('BC1: 배치 내 일부 file 만 external → 해당 file 만 redirected, 나머지 그대로', async () => {
    // 폴더 일괄 fetch (uniqueFolderIds = [HUSK_ID, COMPANY_FOLDER_ID])
    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      {
        id: HUSK_ID,
        name: '대성목형(2265-1295)',
        path: '/외부웹하드/대성목형(2265-1295)',
        companyId: null,
        parentId: 'external-root',
      },
      {
        id: COMPANY_FOLDER_ID,
        name: '대성목형',
        path: '/대성목형',
        companyId: COMPANY_ID,
        parentId: null,
      },
    ]);

    // tryRouteExternalUpload — HUSK_ID 만 external (path startsWith /외부웹하드/)
    // findUnique 는 per-file 호출. 첫 번째 = HUSK_ID, 두 번째 = COMPANY_FOLDER_ID
    prisma.webhardFolder.findUnique
      .mockResolvedValueOnce({
        id: HUSK_ID,
        name: '대성목형(2265-1295)',
        path: '/외부웹하드/대성목형(2265-1295)',
        folderKind: 'generic',
        companyId: null,
      })
      .mockResolvedValueOnce({
        id: COMPANY_FOLDER_ID,
        name: '대성목형',
        path: '/대성목형',
        folderKind: 'generic',
        companyId: COMPANY_ID,
      });

    // husk 의 alias 매칭
    prisma.companyFolderAlias.findFirst.mockResolvedValueOnce({
      company: { id: COMPANY_ID, companyName: '대성목형' },
    });
    prisma.webhardFolder.findFirst.mockResolvedValueOnce({ id: COMPANY_ROOT_ID });

    prisma.webhardFile.createMany.mockResolvedValueOnce({ count: 2 });

    const dto = {
      files: [
        {
          key: 'webhard/company-4/company-root-uuid/file1.dxf',
          name: 'file1.dxf',
          originalName: 'file1.dxf',
          size: 1234,
          mimeType: 'application/octet-stream',
          folderId: HUSK_ID, // → routed
        },
        {
          key: 'webhard/company-4/company-folder-uuid/file2.dxf',
          name: 'file2.dxf',
          originalName: 'file2.dxf',
          size: 5678,
          mimeType: 'application/octet-stream',
          folderId: COMPANY_FOLDER_ID, // → 그대로
        },
      ],
    };
    const adminUser = { userType: 'admin' as const, userId: 'admin' };

    await service.batchConfirmUpload(dto as never, adminUser as never);

    expect(prisma.webhardFile.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            folderId: COMPANY_ROOT_ID, // routed
            companyId: COMPANY_ID,
          }),
          expect.objectContaining({
            folderId: COMPANY_FOLDER_ID, // 그대로
            companyId: COMPANY_ID, // folder.companyId 상속
          }),
        ]),
      })
    );
  });

  it('BC2: 배치 내 1건 routing throw → 그 1건만 fallback, 나머지 영향 없음', async () => {
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation();

    // 폴더 일괄 fetch
    prisma.webhardFolder.findMany.mockResolvedValueOnce([
      {
        id: HUSK_ID,
        name: '대성목형(2265-1295)',
        path: '/외부웹하드/대성목형(2265-1295)',
        companyId: null,
        parentId: 'external-root',
      },
      {
        id: COMPANY_FOLDER_ID,
        name: '대성목형',
        path: '/대성목형',
        companyId: COMPANY_ID,
        parentId: null,
      },
    ]);

    // tryRouteExternalUpload per-file:
    //   첫 번째 (HUSK_ID) → throw (DB 일시 장애 시뮬)
    //   두 번째 (COMPANY_FOLDER_ID) → 정상
    prisma.webhardFolder.findUnique
      .mockRejectedValueOnce(new Error('DB connection lost'))
      .mockResolvedValueOnce({
        id: COMPANY_FOLDER_ID,
        name: '대성목형',
        path: '/대성목형',
        folderKind: 'generic',
        companyId: COMPANY_ID,
      });

    prisma.webhardFile.createMany.mockResolvedValueOnce({ count: 2 });

    const dto = {
      files: [
        {
          key: 'webhard/file1.dxf',
          name: 'file1.dxf',
          originalName: 'file1.dxf',
          size: 1234,
          mimeType: 'application/octet-stream',
          folderId: HUSK_ID,
        },
        {
          key: 'webhard/company-4/company-folder-uuid/file2.dxf',
          name: 'file2.dxf',
          originalName: 'file2.dxf',
          size: 5678,
          mimeType: 'application/octet-stream',
          folderId: COMPANY_FOLDER_ID,
        },
      ],
    };
    const adminUser = { userType: 'admin' as const, userId: 'admin' };

    await service.batchConfirmUpload(dto as never, adminUser as never);

    // 첫 번째 file: fallback (HUSK_ID 그대로), 두 번째: 정상 (COMPANY_FOLDER_ID 그대로)
    expect(prisma.webhardFile.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            folderId: HUSK_ID, // fallback
          }),
          expect.objectContaining({
            folderId: COMPANY_FOLDER_ID, // 정상
          }),
        ]),
      })
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringMatching(/batchConfirmUpload routing failed/)
    );
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

```bash
cd webhard-api && npx jest src/files/__tests__/files.service.spec.ts -t "batchConfirmUpload routing" 2>&1 | tail -20
```

기대: BC1 FAIL (HUSK_ID 가 routed 안 됨), BC2 FAIL.

- [ ] **Step 3: batchConfirmUpload 메서드에 per-file routing 추가**

`webhard-api/src/files/files.service.ts` 의 `batchConfirmUpload` 메서드 (~line 444 부터). 핵심 변경: `validFiles.map(...)` 직전에 per-file routing 결과 캐시 빌드 + map 안에서 routed 값 사용.

찾을 곳 (변경 전, ~line 488-522):

```ts
// 2. 유효한 파일만 필터링
const validFiles = dto.files.filter((f) => {
  if (f.folderId && !folderAllowedMap.get(f.folderId)) {
    errors.push(`폴더 접근 권한 없음: ${f.name} (folderId: ${f.folderId})`);
    return false;
  }
  return true;
});

if (validFiles.length === 0) {
  return { success: 0, failed: dto.files.length, errors };
}

// 항목별 companyId 결정 (Bug 1, task 25)
const resolveItemCompanyId = (f: ConfirmUploadDto): number | null => {
  if (user.userType !== 'admin') return effectiveCompanyId;
  if (f.companyId !== undefined) return f.companyId;
  if (!f.folderId) return null;
  return folderInfoMap.get(f.folderId)?.companyId ?? null;
};

// 3. createMany로 단일 INSERT 문 실행
const data = validFiles.map((f) => ({
  id: crypto.randomUUID(),
  name: f.name,
  originalName: f.originalName,
  size: Math.floor(Number(f.size)),
  mimeType: f.mimeType,
  path: f.key,
  folderId: f.folderId ?? null,
  companyId: resolveItemCompanyId(f),
  uploadedBy,
  inquiryNumber: f.inquiryNumber ?? null,
  isDownloaded: false,
}));
```

변경 후:

```ts
// 2. 유효한 파일만 필터링
const validFiles = dto.files.filter((f) => {
  if (f.folderId && !folderAllowedMap.get(f.folderId)) {
    errors.push(`폴더 접근 권한 없음: ${f.name} (folderId: ${f.folderId})`);
    return false;
  }
  return true;
});

if (validFiles.length === 0) {
  return { success: 0, failed: dto.files.length, errors };
}

// task 28: per-file routing 캐시 — 배치 내 동일 folderId 는 routing 1회만 호출.
// 키는 원본 folderId, 값은 redirected 결과 또는 null (non-external / 실패).
const routingCache = new Map<string, { folderId: string; companyId: number } | null>();
for (let idx = 0; idx < validFiles.length; idx++) {
  const f = validFiles[idx];
  if (!f.folderId || routingCache.has(f.folderId)) continue;
  try {
    const routed = await this.tryRouteExternalUpload(f.folderId);
    routingCache.set(f.folderId, routed);
  } catch (err) {
    this.logger.warn(
      `batchConfirmUpload routing failed [${idx}/${validFiles.length}] folderId=${f.folderId} key=${f.key} filename=${f.name} error=${err instanceof Error ? err.message : err}`
    );
    routingCache.set(f.folderId, null); // fallback
  }
}

// routed folderId 결정 — cache hit 면 routed, miss 면 원본
const resolveEffectiveFolderId = (f: ConfirmUploadDto): string | null => {
  if (!f.folderId) return null;
  const routed = routingCache.get(f.folderId);
  return routed ? routed.folderId : f.folderId;
};

// 항목별 companyId 결정 (Bug 1, task 25 + task 28):
//   1) company user        → effectiveCompanyId
//   2) admin + redirected → routed.companyId
//   3) admin + dto.companyId 명시 → 그 값
//   4) admin + folder 있음 → folderInfoMap[folderId].companyId 상속
//   5) admin + folder 없음 → null
const resolveItemCompanyId = (f: ConfirmUploadDto): number | null => {
  if (user.userType !== 'admin') return effectiveCompanyId;
  if (f.folderId) {
    const routed = routingCache.get(f.folderId);
    if (routed) return routed.companyId;
  }
  if (f.companyId !== undefined) return f.companyId;
  if (!f.folderId) return null;
  return folderInfoMap.get(f.folderId)?.companyId ?? null;
};

// 3. createMany로 단일 INSERT 문 실행
const data = validFiles.map((f) => ({
  id: crypto.randomUUID(),
  name: f.name,
  originalName: f.originalName,
  size: Math.floor(Number(f.size)),
  mimeType: f.mimeType,
  path: f.key,
  folderId: resolveEffectiveFolderId(f),
  companyId: resolveItemCompanyId(f),
  uploadedBy,
  inquiryNumber: f.inquiryNumber ?? null,
  isDownloaded: false,
}));
```

또한 emitToFolderBatched 의 folderId 도 effective 값으로 — `data.folderId` 가 이미 effective 이므로 기존 `folderGroups` 빌드 로직은 그대로 동작. 단 검증 필요.

찾을 곳 (변경 전, ~line 530-542):

```ts
// 4. 폴더별 WebSocket 배치 이벤트 발행
const folderGroups = new Map<string | null, number>();
for (const item of data) {
  const key = item.folderId;
  folderGroups.set(key, (folderGroups.get(key) || 0) + 1);
}

for (const [folderId, count] of folderGroups) {
  this.eventsGateway.emitToFolderBatched(folderId, {
    type: 'file:created',
    folderId,
    data: { count, batch: true },
  });
}
```

이 코드는 `item.folderId` (= effectiveFolderId 가 들어간 data) 를 키로 그룹화하므로 자동으로 routed folderId 기준 그룹화 됨. 변경 불필요.

`uniqueFolderIdsForUpdate` 의 `propagateUpdatedAt` 도 마찬가지 — `folderGroups.keys()` 가 effective 기준이라 routing 후 회사 폴더의 updated_at 이 갱신됨. 의도된 동작.

- [ ] **Step 4: 테스트 재실행 → 통과 확인**

```bash
cd webhard-api && npx jest src/files/__tests__/files.service.spec.ts -t "batchConfirmUpload routing" 2>&1 | tail -20
```

기대: BC1 PASS, BC2 PASS.

- [ ] **Step 5: 기존 batchConfirmUpload 테스트 회귀 (task 25 F5, batch updated_at)**

```bash
cd webhard-api && npx jest src/files/__tests__/files.service.spec.ts -t "batchConfirmUpload" 2>&1 | tail -30
```

기대: 기존 + 신규 모두 PASS. mock 의 `webhardFolder.findUnique` 를 사용하지 않는 기존 테스트라면 routing 호출 시 undefined 반환되어 routing skip → 기존 동작 그대로.

만약 회귀 발생 시: `findUnique` mock 을 추가하거나 `tryRouteExternalUpload` 자체를 spy 로 mock 처리.

- [ ] **Step 6: 커밋**

```bash
git add webhard-api/src/files/files.service.ts webhard-api/src/files/__tests__/files.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(task 28 Phase B): batchConfirmUpload routing consistency — BC1/BC2

confirmUpload 와 동일한 routing 정책을 batch 에도 적용.

- per-file routing 캐시 (Map<folderId, routed>) — 배치 내 동일 folderId 1회만 lookup
- BC1: 배치 내 일부 file external → 해당 file 만 redirected
- BC2: 배치 내 1건 routing throw → 그 1건만 fallback (나머지 영향 없음, warn 로그)
- companyId precedence — redirected 시 routed.companyId 우선
- emitToFolderBatched / propagateUpdatedAt 의 folderId 도 effective 기준 자동 그룹화
EOF
)"
```

---

# Phase C — 검증 + 문서 동기화

### Task C1: 전체 회귀 + spec/CHANGELOG 동기화

**Files:**

- Modify: `docs/specs/features/external-folder-migration.md`
- Modify: `docs/changelog/CHANGELOG.md`

- [ ] **Step 1: 전체 jest 회귀**

```bash
cd webhard-api && npx jest 2>&1 | tail -10
```

기대: 41 suites, 728+ PASS (직전 baseline 728 + 7 신규 task 28 = 735).

만약 실패: 새로 추가한 mock 의 `companyFolderAlias.findFirst` 등이 makePrisma 에 없으면 추가 필요. 또는 회귀가 발견되면 그 자리에서 진단 + 수정.

- [ ] **Step 2: typecheck**

```bash
cd webhard-api && npx tsc --noEmit 2>&1 | tail -5
```

기대: exit 0.

- [ ] **Step 3: spec doc 에 task 28 섹션 추가**

`docs/specs/features/external-folder-migration.md` 의 task 27 결정 #3 섹션 다음에 추가:

```markdown
### task 28 — confirm-routing-consistency (2026-04-30)

**문제**: task 26 Phase 1.5 의 `tryRouteExternalUpload` 가 `getUploadPresignedUrl` 응답에는 redirected folderId 를 박지만, 후속 `confirmUpload` 가 원본 husk folderId 를 사용해 R2 path 와 DB row 가 분리되는 split-brain 결함.

**해결**: `confirmUpload` 와 `batchConfirmUpload` 에 동일 routing 적용. 두 endpoint 가 독립적으로 routing 검사 → R2 와 DB 일관성 보장.

**구현**:

- `confirmUpload`: dto.folderId 로 `tryRouteExternalUpload` 호출 → routed 값 있으면 `WebhardFile.create` 의 folderId/companyId 사용
- `batchConfirmUpload`: per-file routing 캐시 (배치 내 동일 folderId 는 1회만 lookup) → createMany 의 data 행마다 effective folderId/companyId 적용
- 실패 정책 (양쪽): try/catch + warn 로그 + 원본 folderId fallback (R2 PUT 이미 완료라 confirm 막지 않음)
- emitToFolder / emitToFolderBatched / propagateUpdatedAt 모두 effective folderId 기준

**불변 규칙** (변경 없음):

- task 27 husk 정책 — husk 는 deletedAt=null 유지
- R2 path 미변경 (이미 회사 경로로 박힌 파일 그대로)
- presigned-url 흐름 — task 26 R1~R5 그대로
- companyId 상속 precedence — task 25 F1~F5 그대로 (redirected 시 routed.companyId 가 우선)

**기존 misrouted 파일 회복**: admin UI `/admin/integration/companies` → "등록된 매핑" 패널의 [재마이그레이션] 클릭. `migrateExternalFolderTreeToCompany` BFS 가 husk 트리 순회 → folderId=husk 인 파일 모두 회사 폴더로 이동 (R2 path 미변경).

**회복 검증 SQL**:

\`\`\`sql
SELECT f.id, f.name, f.path, f.folder_id, fold.path AS folder_path, f.company_id
FROM webhard_files f
LEFT JOIN webhard_folders fold ON fold.id = f.folder_id
WHERE f.path LIKE 'webhard/company-%'
AND fold.path LIKE '/외부웹하드/%'
AND f.deleted_at IS NULL;
\`\`\`

배포 + [재마이그레이션] 후 0건이면 회복 완료.
```

(코드 블록 안의 백틱 3개는 `\`\`\`` 로 escape 필요 없음 — 위 마크다운은 그대로 붙여넣기.)

- [ ] **Step 4: CHANGELOG 항목 추가**

`docs/changelog/CHANGELOG.md` 의 `## [Unreleased]` 섹션 안에 (task 27 Phase C 항목 위 또는 아래) 추가:

```markdown
### 2026-04-30 — confirm-routing-consistency (task 28)

**Scope**: task 26 Phase 1.5 의 `tryRouteExternalUpload` 가 presigned-url 만 routing 하고 confirm 은 안 해서 R2 path / DB folder_id split-brain 발생. 두 confirm endpoint 에 동일 routing 적용.

**버그 수정**:

- **`confirmUpload`** (`webhard-api/src/files/files.service.ts:356`): dto.folderId 로 `tryRouteExternalUpload` 호출 → routed folderId/companyId 로 WebhardFile.create. 실패 시 try/catch + warn 로그 + 원본 fallback.
- **`batchConfirmUpload`** (`webhard-api/src/files/files.service.ts:444`): per-file routing 캐시 (Map<folderId, routed>) → 배치 내 동일 folderId 1회만 lookup. 실패 시 per-file fallback + warn 로그 (file index 포함).
- **emitToFolder / emitToFolderBatched / propagateUpdatedAt**: effective folderId 기준으로 자동 그룹화 (data.folderId 가 routed 값이라 별도 변경 불필요).

**테스트**:

- C1~C5 (`confirmUpload routing`): happy path / non-external pass-through / null folderId / routing throw fallback / emit folderId 일관성
- BC1, BC2 (`batchConfirmUpload routing`): 일부 file 만 routed / 1건 throw 시 per-file fallback

**불변 규칙**: task 25 F1~F5 (companyId 상속), task 26 R1~R5 (presigned-url routing), task 27 husk 정책 모두 그대로.

**회복**: 배포 후 admin UI 의 [재마이그레이션] 1번 클릭. 추가 SQL 불필요.

---
```

- [ ] **Step 5: 커밋**

```bash
git add docs/specs/features/external-folder-migration.md docs/changelog/CHANGELOG.md
git commit -m "docs(task 28 Phase C): spec/CHANGELOG 동기화 — confirm-routing-consistency"
```

---

# 검증 체크리스트 (전체)

모든 Phase 완료 후 최종 검증:

- [ ] **빌드/타입체크 모두 통과**
  - `cd webhard-api && npx tsc --noEmit` → exit 0
- [ ] **테스트 모두 통과**
  - `cd webhard-api && npx jest` → 기존 728 + 신규 7 = 735+ PASS
- [ ] **spec/CHANGELOG 동기화 검증**
  - `docs/specs/features/external-folder-migration.md` task 28 섹션 추가
  - `docs/changelog/CHANGELOG.md` task 28 항목 등재
- [ ] **운영 검증** (사용자 측, fix 배포 후):
  - admin UI 에서 [재마이그레이션] 1번 클릭 → 기존 misrouted 파일 회사 폴더로 이전 확인
  - Electron sync 1건 트리거 → NestJS 로그에 `confirmUpload routed —` LOG 라인 노출 확인
  - DB 직접 조회 — 회복 검증 SQL 결과 0건 확인
  - UI 화면 — husk 비어있고 회사 폴더에 신규 파일 노출

---

# 참조

- `docs/superpowers/specs/2026-04-30-task-28-confirm-routing-consistency-design.md` — task 28 brainstorm 결과 spec
- `docs/specs/features/external-folder-migration.md` — task 26/27 본 spec
- `docs/superpowers/plans/2026-04-30-task-27-external-husk-policy.md` — task 27 husk 정책
- `webhard-api/src/files/files.service.ts:185-279` — task 26 Phase 1.5 routing (`getUploadPresignedUrl`, `tryRouteExternalUpload`)
- `webhard-api/src/files/files.service.ts:356` — `confirmUpload` (수정 대상)
- `webhard-api/src/files/files.service.ts:444` — `batchConfirmUpload` (수정 대상)
