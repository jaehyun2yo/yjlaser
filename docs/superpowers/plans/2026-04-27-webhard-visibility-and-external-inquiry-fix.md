# 웹하드 가시성 회복 + 외부 폴더명 alias 매핑 + 미가입 업체 문의 폴더 자동화 (task 25) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bug 1·2·3 (admin 업로드 가시성 / 외부 폴더명 alias 매핑 / 미가입 업체 문의 폴더 자동화) 를 코드 정정 + 신규 endpoint + 회귀 가드 테스트로 해결.

**Architecture:** Phase 1 admin 수동 alias endpoint + 즉시 적용 (Bug 2) → Phase 2 admin 업로드 시 폴더 companyId 상속 + 1회 백필 (Bug 1) → Phase 3 미가입 업체 외부 sync 통합 회귀 가드 (Bug 3) → Phase 4 service-level integration + docs sync → Phase 5 최종 검증.

**Tech Stack:** NestJS + Prisma + PostgreSQL (Supabase) + Jest + supertest.

**Spec:** `docs/specs/features/webhard-visibility-and-external-inquiry-fix.md`

**Branch:** `feat/task-25-webhard-fix` (worktree at `.worktrees/task-25-webhard-fix/`)

**Sanity check (run before Phase 1):**

```bash
cd .worktrees/task-25-webhard-fix && git branch --show-current
# Expected: feat/task-25-webhard-fix
```

---

## 진단 결론 (사전 작업 완료, 본 plan 의 전제)

dev DB (`.env.local` DATABASE_URL → Supabase project `fbtkoikwsytoamlddpms`) 직접 진단 결과:

- PR #17 마이그레이션 두 개 모두 적용 완료 (`finished_at` NOT NULL).
- `company_folder_aliases` 테이블 + `contacts.company_id` 컬럼 존재.
- `대성목형` Company 가입 (id=4, laser_only=true).
- 외부웹하드 폴더 `대성목형(2265-1295)` (id=`5019ab31-242f-406a-885a-bfe38cada1b4`, companyId=null).
- 외부 sync contact 들 (`260427-F-006~F-010` 등) `companyName='대성목형(2265-1295)'`, `companyId=null`, `inquiryType='laser_cutting'` — 가입 업체와 매핑 안 됨.
- Bug 1 재현: 폴더 `f78e1ea0-d4fc-4a19-9629-516e436db403` (`/대성목형`, companyId=4) 안에 file `9d7a229a-...` (`기타_테스트.DXF`, companyId=null).

→ 본 plan 의 모든 task 는 위 dev DB 상태를 시작점으로 한다.

---

## File Structure

| 변경/생성 | 경로                                                                                                                                  | 책임                                                                                                                                                                    |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Modify    | `webhard-api/src/companies/companies.controller.ts`                                                                                   | `POST /folder-aliases` 신규 endpoint (admin manual alias create)                                                                                                        |
| Modify    | `webhard-api/src/companies/folder-alias.service.ts`                                                                                   | `createApprovedAlias(folderName, companyId, cascadeBackfill)` 메서드 추가                                                                                               |
| Modify    | `webhard-api/src/companies/dto/folder-alias.dto.ts`                                                                                   | `CreateFolderAliasDto` 신규 (folderName, companyId, cascadeBackfill?)                                                                                                   |
| Modify    | `webhard-api/src/companies/__tests__/folder-alias.service.spec.ts`                                                                    | A1-A6 단위 테스트 추가                                                                                                                                                  |
| Modify    | `webhard-api/src/files/files.service.ts`                                                                                              | `confirmUpload`/`batchConfirmUpload`/`getUploadPresignedUrl` companyId 상속                                                                                             |
| Modify    | `webhard-api/src/files/__tests__/files.service.spec.ts`                                                                               | F1-F6 단위 테스트 추가                                                                                                                                                  |
| Modify    | `webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts`                                                           | U1, U2, U4 단위 테스트 추가                                                                                                                                             |
| Modify    | `webhard-api/src/contacts/__tests__/contact-folder-sync.service.spec.ts` (or 위치)                                                    | U3 단위 테스트 추가                                                                                                                                                     |
| Modify    | `webhard-api/src/folders/folders.service.spec.ts`                                                                                     | U5/U5b 가시성 regression 테스트 + getFolderTree 차단 강화 (Task 3.3 scope expansion 2026-04-28)                                                                         |
| Modify    | `webhard-api/src/folders/folders.service.ts`                                                                                          | `companyVisibilityFilter` private helper — companyId=null 외부웹하드 root + path startsWith 하위 모두 차단 (회사 사용자 분기), `getFolderTree`/`getChildFolders` 일원화 |
| Create    | `webhard-api/prisma/migrations/{TS}_backfill_webhard_files_company_id/migration.sql`                                                  | 폴더 소유 + 파일 NULL 케이스 1회 백필                                                                                                                                   |
| Modify    | `webhard-api/src/files/__tests__/files.service.spec.ts` 또는 신규 `webhard-api/src/files/__tests__/files.service.integration-spec.ts` | F7 (admin → company 가시성) service-level integration                                                                                                                   |
| Modify    | `webhard-api/src/companies/folder-alias.service.spec.ts`                                                                              | A7 (대성목형 즉시 적용) service-level integration                                                                                                                       |
| Modify    | `webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts` 또는 별도 `.integration-spec.ts`                          | E2E-1 (Bug 2+3 통합) service-level integration                                                                                                                          |
| Modify    | `docs/changelog/CHANGELOG.md`                                                                                                         | 변경 이력                                                                                                                                                               |
| Modify    | `docs/features-list.md`                                                                                                               | task 25 entry                                                                                                                                                           |
| Modify    | `docs/specs/features/external-sync-company-folder.md`                                                                                 | 운영 절차 cross-link (admin manual alias 사용법)                                                                                                                        |
| Modify    | `docs/specs/features/contact-webhard-folder.md`                                                                                       | cross-link                                                                                                                                                              |
| Modify    | `docs/specs/api/endpoints/integration.md` 또는 nestjs-endpoints                                                                       | 신규 `POST /folder-aliases` endpoint 명세                                                                                                                               |

---

## Phase 1 — Bug 2: admin 수동 alias 매핑 endpoint + 즉시 적용

### Task 1.1: `CreateFolderAliasDto` + `createApprovedAlias` 서비스 메서드

**Files:**

- Modify: `webhard-api/src/companies/dto/folder-alias.dto.ts`
- Modify: `webhard-api/src/companies/folder-alias.service.ts`
- Test: `webhard-api/src/companies/__tests__/folder-alias.service.spec.ts` (A1-A6)

- [ ] **Step 1: DTO 정의 추가**

`webhard-api/src/companies/dto/folder-alias.dto.ts` 끝에 추가:

```ts
import { IsString, IsInt, IsBoolean, IsOptional } from 'class-validator';

export class CreateFolderAliasDto {
  @IsString()
  folderName!: string;

  @IsInt()
  companyId!: number;

  @IsOptional()
  @IsBoolean()
  cascadeBackfill?: boolean;
}
```

- [ ] **Step 2: 기존 spec 파일 위치/구조 확인**

Run from worktree root:

```bash
find webhard-api/src/companies -type f -name "*.ts" | grep -E "folder-alias|companies\.controller" | head
ls webhard-api/src/companies/__tests__/ 2>/dev/null
```

- [ ] **Step 3: A1 단위 테스트 작성 (failing)**

`webhard-api/src/companies/__tests__/folder-alias.service.spec.ts` (없으면 신규):

```ts
describe('FolderAliasService.createApprovedAlias (task 25 A1-A6)', () => {
  // A1: 신규 (folderName, companyId) 호출 → status='approved', approvedBy/At 기록
  it('A1: 신규 호출 → upsert(approved) + approvedBy/At 기록', async () => {
    // ... mock prisma.companyFolderAlias.upsert + assert call args
  });

  // A2: 동일 folderName 의 다른 pending 자동 rejected
  it('A2: 동일 folderName 의 다른 pending 자동 rejected', async () => {
    /* ... */
  });

  // A3: cascadeBackfill: true (default) → relocateAfterAliasApproved 호출 + backfill 응답
  it('A3: cascadeBackfill default true → backfill 호출', async () => {
    /* ... */
  });

  // A4: cascadeBackfill: false → backfill 미호출
  it('A4: cascadeBackfill false → backfill 미호출, 응답 backfill undefined', async () => {
    /* ... */
  });

  // A5: 멱등 — 동일 (folderName, companyId) 재호출 시 status 변경 X, backfill 멱등 추가
  it('A5: 멱등 재호출', async () => {
    /* ... */
  });

  // A6: 비존재 companyId → NotFoundException
  it('A6: 비존재 companyId → NotFoundException', async () => {
    /* ... */
  });
});
```

(상세 mock 코드는 기존 `folder-alias.service.spec.ts` 패턴 참조하여 채워 넣음. 없으면 `auto-contact.service.spec.ts:50-130` 의 makePrisma 패턴 차용.)

- [ ] **Step 4: 서비스 메서드 구현**

`webhard-api/src/companies/folder-alias.service.ts` 의 `FolderAliasService` 클래스에 메서드 추가:

```ts
async createApprovedAlias(
  dto: { folderName: string; companyId: number; cascadeBackfill?: boolean },
  approvedBy: string
): Promise<{ alias: CompanyFolderAlias; backfill?: { relocated: number; skipped: number } }> {
  const cascadeBackfill = dto.cascadeBackfill ?? true; // task 25 default true

  return this.prisma.$transaction(async (tx) => {
    // 1. company 존재 검증
    const company = await tx.company.findUnique({ where: { id: dto.companyId } });
    if (!company) {
      throw new NotFoundException(`Company ${dto.companyId} not found`);
    }

    // 2. upsert (approved)
    const alias = await tx.companyFolderAlias.upsert({
      where: { folderName_companyId: { folderName: dto.folderName, companyId: dto.companyId } },
      update: { status: 'approved', approvedBy, approvedAt: new Date() },
      create: { folderName: dto.folderName, companyId: dto.companyId, status: 'approved', approvedBy, approvedAt: new Date() },
    });

    // 3. 동일 folderName 의 다른 pending 자동 rejected
    await tx.companyFolderAlias.updateMany({
      where: {
        folderName: dto.folderName,
        status: 'pending',
        NOT: { id: alias.id },
      },
      data: { status: 'rejected' },
    });

    // 4. cascadeBackfill
    let backfill: { relocated: number; skipped: number } | undefined;
    if (cascadeBackfill) {
      backfill = await this.contactFolderSyncService.relocateAfterAliasApproved(
        dto.folderName, dto.companyId, tx
      );
    }

    return backfill ? { alias, backfill } : { alias };
  });
}
```

(constructor 에 `private readonly contactFolderSyncService: ContactFolderSyncService` 가 이미 있는지 확인. 없으면 inject 추가.)

- [ ] **Step 5: 테스트 실행 → A1-A6 PASS**

```bash
cd webhard-api && pnpm jest src/companies/__tests__/folder-alias.service.spec.ts -t "task 25 A"
```

Expected: 6 passing.

- [ ] **Step 6: Commit**

```bash
git add webhard-api/src/companies/dto/folder-alias.dto.ts \
        webhard-api/src/companies/folder-alias.service.ts \
        webhard-api/src/companies/__tests__/folder-alias.service.spec.ts
git commit -m "$(cat <<'EOF'
feat(task 25): admin 수동 alias 매핑 서비스 메서드 추가

- FolderAliasService.createApprovedAlias(folderName, companyId, cascadeBackfill?)
- upsert(approved) + 동일 folderName pending 자동 reject + 옵션 cascadeBackfill
- A1-A6 단위 테스트 6건

Co-Authored-By: Claude <noreply@anthropic.com>
EOF
)"
```

### Task 1.2: `POST /folder-aliases` controller endpoint

**Files:**

- Modify: `webhard-api/src/companies/companies.controller.ts`

- [ ] **Step 1: 컨트롤러에 endpoint 추가**

`webhard-api/src/companies/companies.controller.ts` 의 기존 folder-aliases endpoint 들 근처 (line 178-224 영역) 에 추가:

```ts
@Post('folder-aliases')
@UseGuards(AdminGuard)
async createFolderAlias(@Body() dto: CreateFolderAliasDto, @Req() req: { user?: { userId?: string } }) {
  const approvedBy = req.user?.userId ?? 'admin';
  return this.folderAliasService.createApprovedAlias(dto, approvedBy);
}
```

(import 추가: `Post`, `Body`, `Req` from `@nestjs/common`, `CreateFolderAliasDto` from `./dto/folder-alias.dto`.)

- [ ] **Step 2: 컨트롤러 단위/통합 테스트 (선택)**

기존 controller spec 이 있으면 동일 pattern 으로 1건 추가 — 없으면 service-level integration 단계 (Phase 4 의 A7) 에서 검증.

- [ ] **Step 3: 빌드 확인**

```bash
cd webhard-api && pnpm build 2>&1 | tail -20
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
git add webhard-api/src/companies/companies.controller.ts
git commit -m "feat(task 25): POST /companies/folder-aliases controller endpoint

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Task 1.3: 대성목형 즉시 적용 (운영 1회)

**Files:** none (DB-only 운영)

- [ ] **Step 1: 백엔드 dev 서버 기동**

```bash
cd /c/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website && pnpm webhard:dev &
```

(또는 이미 띄워져 있는 dev 서버 재시작 — Task 1.1/1.2 변경이 반영되어야 함.)

- [ ] **Step 2: admin 세션 또는 X-API-Key 로 endpoint 호출**

curl 또는 admin UI 에서:

```bash
curl -X POST http://localhost:4000/api/v1/companies/folder-aliases \
  -H 'Content-Type: application/json' \
  -H 'Cookie: <admin session cookie>' \
  -d '{"folderName": "대성목형(2265-1295)", "companyId": 4, "cascadeBackfill": true}'
```

Expected response:

```json
{
  "alias": { "id": ..., "folderName": "대성목형(2265-1295)", "companyId": 4, "status": "approved", ... },
  "backfill": { "relocated": <N>, "skipped": <M> }
}
```

- [ ] **Step 3: DB 검증**

진단 스크립트와 유사하게 임시 tsx 또는 직접 SQL:

```sql
-- 매핑 확인
SELECT * FROM company_folder_aliases WHERE folder_name = '대성목형(2265-1295)';
-- contact 들 가입 업체로 이동 확인
SELECT id, company_name, company_id, inquiry_type, work_number, webhard_folder_id
FROM contacts WHERE company_name IN ('대성목형(2265-1295)', '대성목형')
ORDER BY created_at DESC LIMIT 20;
-- 폴더 이동 확인
SELECT id, name, parent_id, company_id, path FROM webhard_folders
WHERE company_id = 4 AND folder_kind = 'inquiry'
ORDER BY created_at DESC LIMIT 10;
```

Expected:

- alias 1건 (status='approved').
- 외부 contact 들 (laser_cutting, work_number 있는 것) 의 `company_id = 4`, `company_name = '대성목형'` 으로 변경됨.
- 새 inquiry 폴더들이 `/대성목형/문의/...` 트리에 생성.

- [ ] **Step 4: 결과 사용자에게 보고 + 별도 commit 없음 (운영 작업)**

본 task 는 운영 1회 적용이므로 git commit 없음. 결과를 PR/이슈에 코멘트로 기록.

---

## Phase 2 — Bug 1: 업로드 시 `companyId` 상속 + 백필

### Task 2.1: `getUploadPresignedUrl` 폴더 companyId 상속

**Files:**

- Modify: `webhard-api/src/files/files.service.ts:164-189`
- Test: `webhard-api/src/files/__tests__/files.service.spec.ts` (F6)

- [ ] **Step 1: F6 failing 테스트 작성**

`files.service.spec.ts` 끝에 추가:

```ts
describe('FilesService.getUploadPresignedUrl — companyId 상속 (task 25 F6)', () => {
  it('admin + 폴더(companyId=42) + dto.companyId 미지정 → key 가 webhard/company-42/...', async () => {
    const prisma = makePrisma({
      webhardFolder: { findUnique: jest.fn().mockResolvedValue(makeFolder({ companyId: 42 })) },
    });
    const storage = makeStorageService();
    const service = new FilesService(/* ...mocks... */);
    const adminUser = { userType: 'admin', userId: 1 } as any;
    await service.getUploadPresignedUrl(
      {
        folderId: 'folder-uuid-1',
        filename: 'a.dxf',
        contentType: 'application/octet-stream',
      } as any,
      adminUser
    );
    expect(storage.generateStoragePath).toHaveBeenCalledWith(42, 'folder-uuid-1', 'a.dxf');
  });
});
```

(필요한 mock helper 들은 기존 spec 의 makers 재활용. 없으면 동일 패턴으로 추가.)

- [ ] **Step 2: F6 실행 → FAIL 확인**

```bash
cd webhard-api && pnpm jest src/files/__tests__/files.service.spec.ts -t "task 25 F6"
```

- [ ] **Step 3: `getUploadPresignedUrl` 수정**

`files.service.ts:164-189` 의 메서드를 다음으로 교체:

```ts
async getUploadPresignedUrl(
  dto: CreatePresignedUrlDto,
  user: SessionUser
): Promise<PresignedUrlResponseDto> {
  let inheritedCompanyId: number | null = null;
  if (dto.folderId) {
    await this.verifyFolderAccess(dto.folderId, user);
    if (user.userType === 'admin' && dto.companyId === undefined) {
      const folder = await this.prisma.executeWithRetry(
        () => this.prisma.webhardFolder.findUnique({
          where: { id: dto.folderId },
          select: { companyId: true },
        }),
        { operationName: 'getUploadPresignedUrl.inheritCompanyId' }
      );
      inheritedCompanyId = folder?.companyId ?? null;
    }
  }

  const effectiveCompanyId =
    user.userType === 'company'
      ? user.companyId
      : (dto.companyId ?? inheritedCompanyId);

  const key = this.storageService.generateStoragePath(
    effectiveCompanyId,
    dto.folderId ?? null,
    dto.filename
  );

  const result = await this.storageService.getUploadPresignedUrl(key, dto.contentType);
  return { url: result.url, key: result.key, expiresAt: result.expiresAt.toISOString() };
}
```

- [ ] **Step 4: F6 PASS 확인**

```bash
cd webhard-api && pnpm jest src/files/__tests__/files.service.spec.ts -t "task 25 F6"
```

### Task 2.2: `confirmUpload` 폴더 companyId 상속 + F1-F4

**Files:**

- Modify: `webhard-api/src/files/files.service.ts:210-281`
- Test: `webhard-api/src/files/__tests__/files.service.spec.ts` (F1-F4)

- [ ] **Step 1: F1 failing 테스트**

```ts
describe('FilesService.confirmUpload — companyId 상속 (task 25 F1-F4)', () => {
  function makeServices(folderCompanyId: number | null) {
    const prisma = makePrisma({
      webhardFolder: {
        findUnique: jest.fn().mockResolvedValue(makeFolder({ companyId: folderCompanyId })),
      },
    });
    prisma.webhardFile.create = jest
      .fn()
      .mockImplementation(({ data }: { data: any }) =>
        Promise.resolve(makeFile({ ...data, company: null }))
      );
    const service = new FilesService(/* ...mocks... */);
    return { prisma, service };
  }

  it('F1: admin + 폴더(companyId=42) → file.companyId === 42', async () => {
    const { prisma, service } = makeServices(42);
    await service.confirmUpload(
      {
        name: 'a',
        originalName: 'a',
        size: 1,
        mimeType: 'x',
        key: 'k',
        folderId: 'folder-uuid-1',
      } as any,
      { userType: 'admin', userId: 1 } as any
    );
    expect((prisma.webhardFile.create as jest.Mock).mock.calls[0][0].data.companyId).toBe(42);
  });
  // F2-F4 동일 패턴
});
```

- [ ] **Step 2: F1 실행 → FAIL 확인**

```bash
cd webhard-api && pnpm jest src/files/__tests__/files.service.spec.ts -t "task 25 F1"
```

- [ ] **Step 3: `confirmUpload` 수정**

`files.service.ts:210-281` 의 `effectiveCompanyId` 계산부 (line 211-217) 를 다음으로 교체:

```ts
let inheritedCompanyId: number | null = null;
if (dto.folderId) {
  await this.verifyFolderAccess(dto.folderId, user);
  if (user.userType === 'admin' && dto.companyId === undefined) {
    const folder = await this.prisma.executeWithRetry(
      () =>
        this.prisma.webhardFolder.findUnique({
          where: { id: dto.folderId },
          select: { companyId: true },
        }),
      { operationName: 'confirmUpload.inheritCompanyId' }
    );
    inheritedCompanyId = folder?.companyId ?? null;
  }
}

const effectiveCompanyId =
  user.userType === 'company' ? user.companyId : (dto.companyId ?? inheritedCompanyId);
```

- [ ] **Step 4: F1-F4 모두 추가 + PASS 확인**

```ts
it('F2: 명시값 우선', async () => {
  /* dto.companyId=99 → 99 */
});
it('F3: folderId 없음 → null', async () => {
  /* root 업로드 */
});
it('F4: folder.companyId === null (외부웹하드) → file.companyId === null', async () => {
  /* ... */
});
```

```bash
cd webhard-api && pnpm jest src/files/__tests__/files.service.spec.ts -t "task 25 F"
```

Expected: 4 passing (F1-F4).

### Task 2.3: `batchConfirmUpload` 폴더 companyId 상속 + F5

**Files:**

- Modify: `webhard-api/src/files/files.service.ts:287-400`
- Test: `webhard-api/src/files/__tests__/files.service.spec.ts` (F5)

- [ ] **Step 1: F5 failing 테스트**

```ts
describe('FilesService.batchConfirmUpload — companyId 상속 (task 25 F5)', () => {
  it('F5: 항목 5개 (3개 cid=42 폴더, 2개 cid=null 폴더) → 3개 42, 2개 null + 폴더 조회 1회', async () => {
    const folderA = makeFolder({ id: 'fA', companyId: 42 });
    const folderB = makeFolder({ id: 'fB', companyId: null });
    const prisma = makePrisma({
      webhardFolder: { findMany: jest.fn().mockResolvedValue([folderA, folderB]) },
    });
    let captured: any = null;
    prisma.webhardFile.createMany = jest.fn().mockImplementation(({ data }: { data: any[] }) => {
      captured = data;
      return Promise.resolve({ count: data.length });
    });
    const service = new FilesService(/* ...mocks... */);
    await service.batchConfirmUpload(
      {
        files: [
          { name: '1', originalName: '1', size: 1, mimeType: 'x', key: 'k', folderId: 'fA' },
          { name: '2', originalName: '2', size: 1, mimeType: 'x', key: 'k', folderId: 'fA' },
          { name: '3', originalName: '3', size: 1, mimeType: 'x', key: 'k', folderId: 'fA' },
          { name: '4', originalName: '4', size: 1, mimeType: 'x', key: 'k', folderId: 'fB' },
          { name: '5', originalName: '5', size: 1, mimeType: 'x', key: 'k', folderId: 'fB' },
        ],
      } as any,
      { userType: 'admin', userId: 1 } as any
    );
    expect(captured!.map((d: any) => d.companyId)).toEqual([42, 42, 42, null, null]);
    expect((prisma.webhardFolder.findMany as jest.Mock).mock.calls.length).toBe(1);
  });
});
```

- [ ] **Step 2: F5 FAIL 확인 → 수정 → PASS**

`batchConfirmUpload` (line 297-322) 의 `folderAccessMap` 을 `Map<string, { allowed: boolean; companyId: number | null }>` 로 확장 (spec 본문 참조).

`data` 매핑 (line 338-351) 의 `companyId` 라인을 다음으로 교체:

```ts
companyId:
  user.userType === 'admin'
    ? (f.companyId !== undefined
        ? f.companyId
        : (f.folderId ? folderAccessMap.get(f.folderId)?.companyId ?? null : null))
    : effectiveCompanyId,
```

```bash
cd webhard-api && pnpm jest src/files/__tests__/files.service.spec.ts -t "task 25 F5"
```

Expected: PASS.

### Task 2.4: 백필 마이그레이션 SQL + 적용

**Files:**

- Create: `webhard-api/prisma/migrations/{TS}_backfill_webhard_files_company_id/migration.sql`

- [ ] **Step 1: 마이그레이션 디렉토리 + SQL**

타임스탬프 형식 `YYYYMMDDHHMMSS` (예: `20260427160000`):

```bash
mkdir -p webhard-api/prisma/migrations/20260427160000_backfill_webhard_files_company_id
```

`webhard-api/prisma/migrations/20260427160000_backfill_webhard_files_company_id/migration.sql`:

```sql
-- task 25 Bug 1: admin 이 업체 폴더에 업로드한 파일 중 webhard_files.company_id 가 NULL 로
-- 저장된 케이스를 부모 폴더의 company_id 로 백필. idempotent.
UPDATE webhard_files f
SET company_id = wf.company_id
FROM webhard_folders wf
WHERE f.folder_id = wf.id
  AND f.company_id IS NULL
  AND wf.company_id IS NOT NULL
  AND f.deleted_at IS NULL;
```

- [ ] **Step 2: dev 백필 전 카운트 (raw SQL via tsx 스크립트 또는 직접 psql)**

dev DB 에 직접 조회:

```sql
SELECT COUNT(*) AS to_backfill
FROM webhard_files f
JOIN webhard_folders wf ON f.folder_id = wf.id
WHERE f.company_id IS NULL AND wf.company_id IS NOT NULL AND f.deleted_at IS NULL;
```

기록: N 값.

- [ ] **Step 3: dev 백필 적용**

```bash
cd webhard-api && npx prisma migrate deploy
```

Expected: `1 migration applied`.

- [ ] **Step 4: 백필 후 검증**

```sql
SELECT COUNT(*) AS still_null
FROM webhard_files f
JOIN webhard_folders wf ON f.folder_id = wf.id
WHERE f.company_id IS NULL AND wf.company_id IS NOT NULL AND f.deleted_at IS NULL;
-- Expected: 0
```

또한 사용자 화면 폴더 파일 (`9d7a229a-...`) 의 `company_id` 가 4 로 채워졌는지 확인.

- [ ] **Step 5: F8/F9 검증**

F8 (가시성 회복): 회사 사용자 세션으로 admin 페이지 또는 직접 `/api/v1/files?folderId=f78e1ea0-...` 조회 → `기타 테스트.DXF` 응답 포함.

F9 (멱등): 마이그레이션 SQL 을 raw 로 다시 실행 → 0 row affected.

- [ ] **Step 6: prod 백필**

운영자 협조로 Railway shell 또는 prod DATABASE_URL 임시 export 로 `npx prisma migrate deploy` 실행. 동일 검증 SQL.

### Task 2.5: F7 service-level integration — admin 업로드 후 회사 가시성

**Files:**

- Modify: `webhard-api/src/files/__tests__/files.service.spec.ts` (신규 describe block 추가)

(상세 시나리오는 spec 의 F7 참조. service-level integration 으로 in-memory store 시뮬레이션 — `confirmUpload` admin → `getFiles` company 같은 store 에서 결합 검증. e2e 인프라 부재로 service-level 로 대체, 2026-04-28 결정.)

- [ ] **Step 1: 시나리오 작성 + 실행**

```bash
cd webhard-api && pnpm jest src/files/__tests__/files.service.spec.ts -t "task 25 F7"
```

Expected: PASS.

검증 핵심: admin 이 폴더(companyId=42) 에 confirmUpload 한 file 이 같은 폴더 + 같은 companyId 회사 사용자 시각으로 `getFiles` 응답에 포함되는가. Bug 1 fix 의 e2e 의도를 정확히 service-level 로 재현 (`prisma.webhardFile.findMany` mock 이 fileStore 를 `where.folderId` + `where.companyId` 로 필터링).

### Task 2.6: Phase 2 commit

- [ ] **Step 1: stage + commit**

```bash
git add webhard-api/src/files/files.service.ts \
        webhard-api/src/files/__tests__/files.service.spec.ts \
        webhard-api/prisma/migrations/20260427160000_backfill_webhard_files_company_id/
git commit -m "feat(task 25): admin 업로드 시 폴더 companyId 상속 + 1회 백필

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 3 — Bug 3: 미가입 업체 외부 sync 회귀 가드

### Task 3.1: U1/U2/U4 — auto-contact.service.spec.ts

(spec 의 U1/U2/U4 시나리오 참조. mock prisma 로 미가입 업체 케이스 시뮬.)

- [ ] **Step 1: 테스트 작성 + 실행**

```bash
cd webhard-api && pnpm jest src/integration/orders/__tests__/auto-contact.service.spec.ts -t "task 25 U"
```

Expected: 3 passing.

### Task 3.2: U3 — contact-folder-sync.service.spec.ts

- [ ] **Step 1: spec 위치 확인 + 테스트 작성**

```bash
find webhard-api/src/contacts -name "*folder-sync*" -type f
```

- [ ] **Step 2: U3 작성 + 실행**

```bash
cd webhard-api && pnpm jest src/contacts -t "task 25 U3"
```

### Task 3.3: U5 — folders.service.spec.ts (+ getFolderTree 차단 강화)

> **Scope expansion (2026-04-28)**: U5 첫 실행 FAIL 후 회귀 가드만으로 invariant 6 미충족이 드러나 `getFolderTree` / `getChildFolders` 회사 가시성 필터 강화 (`companyVisibilityFilter` helper) 를 본 task 에 추가. U5b admin 회귀 가드 추가.

- [x] **Step 1: spec 위치 확인 + U5 테스트 작성 (red)**

```bash
find webhard-api/src/folders -name "folders.service.spec*" -type f
```

위치: `webhard-api/src/folders/folders.service.spec.ts` (코로케이션, `__tests__/` 아님). 첫 실행 FAIL 결과로 코드 수정 필요 판단.

- [x] **Step 2: 차단 강화 코드 변경 — `folders.service.ts`**

`getFolderTree` (line 221) + `getChildFolders` (line 276) 의 회사 분기 where 를 `companyVisibilityFilter(user.companyId)` helper 로 일원화. helper 가 `name in EXTERNAL_WEBHARD_FOLDERS` (root) OR `path startsWith /<root>/` (descendants) 두 조건을 OR 로 묶어 차단. admin 분기는 무영향.

- [x] **Step 3: U5 + U5b PASS 확인**

```bash
cd webhard-api && pnpm jest src/folders -t "task 25 U5"
```

Expected: 2 passing (U5 회사 차단 + U5b admin 노출 보존).

- [x] **Step 4: 회귀 검증**

```bash
cd webhard-api && pnpm jest src/folders && npx tsc --noEmit
```

Expected: 102/102 PASS, 0 type errors.

### Task 3.4: Phase 3 commit

- [ ] **Step 1: stage + commit**

```bash
git add webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts \
        webhard-api/src/contacts/contact-folder-sync.service.spec.ts \
        webhard-api/src/folders/folders.service.spec.ts \
        webhard-api/src/folders/folders.service.ts \
        docs/specs/features/webhard-visibility-and-external-inquiry-fix.md \
        docs/superpowers/plans/2026-04-27-webhard-visibility-and-external-inquiry-fix.md
git commit -m "test(task 25): 미가입 업체 외부 sync 회귀 가드 (U1-U5) + getFolderTree 차단 강화

- U1/U2/U4 (auto-contact), U3 (contact-folder-sync), U5/U5b (folders) 회귀 가드 추가.
- getFolderTree / getChildFolders 회사 가시성 필터를 companyVisibilityFilter helper 로 일원화 — name 매칭(root) + path startsWith(descendants) 두 조건 OR 차단. admin 분기 무영향.
- spec invariant 6 + 변경 이력 동기화.

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 4 — E2E + docs sync

### Task 4.1: A7 service-level integration — 대성목형 alias 즉시 적용 시나리오

`webhard-api/src/companies/folder-alias.service.spec.ts` 에 `task 25 A7` describe 추가. 테스트 격리: mock prisma 에 시드 (`대성목형(test-XXX)` 폴더 + companyId=null contact 3건) → `createApprovedAlias` 직접 호출 → companyId/폴더 이동 검증.

```bash
cd webhard-api && pnpm jest src/companies/folder-alias.service.spec.ts -t "task 25 A7"
```

### Task 4.2: E2E-1 service-level integration 통합 시나리오

미가입 업체 신규 sync 시 `외부웹하드/{미가입업체}/문의/...` 자동 생성 검증. `webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts` 또는 별도 `.integration-spec.ts` 에 `task 25 E2E-1` describe 추가.

```bash
cd webhard-api && pnpm jest src/integration/orders/__tests__/auto-contact.service.spec.ts -t "task 25 E2E-1"
```

### Task 4.3: docs sync

**Files:**

- Modify: `docs/changelog/CHANGELOG.md`
- Modify: `docs/features-list.md`
- Modify: `docs/specs/features/external-sync-company-folder.md` (운영 절차 cross-link)
- Modify: `docs/specs/features/contact-webhard-folder.md` (cross-link)
- Modify: `docs/specs/api/endpoints/integration.md` 또는 `nestjs-endpoints.md` (신규 endpoint 명세)

- [ ] **Step 1: CHANGELOG 추가 (한 섹션)**

```markdown
## 2026-04-27 — task 25: 웹하드 가시성 회복 + 외부 폴더명 alias 매핑 + 미가입 업체 문의 폴더 자동화

### Bug Fix

- Bug 1: admin 이 업체 폴더에 업로드한 파일이 업체 사용자에게 보이지 않던 문제 — `FilesService` 3개 메서드 정정 + 1회 백필.
- Bug 2: 외부웹하드 폴더명과 가입 업체명이 정규화로도 매칭 안 되는 케이스 — admin 수동 alias endpoint `POST /api/v1/companies/folder-aliases` 도입 + cascadeBackfill 옵션.
- Bug 3: 미가입 업체 외부 sync 통합 회귀 가드 테스트 (코드 변경 없음, 기존 path 동작 확인).

### Spec

- [docs/specs/features/webhard-visibility-and-external-inquiry-fix.md](../specs/features/webhard-visibility-and-external-inquiry-fix.md)
```

- [ ] **Step 2: features-list 추가**

```markdown
- task 25: 웹하드 가시성 회복 + 외부 폴더명 alias 매핑 + 미가입 업체 문의 폴더 자동화 — [spec](specs/features/webhard-visibility-and-external-inquiry-fix.md)
```

- [ ] **Step 3: external-sync-company-folder cross-link + 운영 절차**

운영 절차 섹션 추가:

```markdown
## 운영 절차 — 정규화로 매칭되지 않는 폴더명 (task 25)

`{업체명}({사이즈})`, `{업체명}_old` 등 정규화 후에도 가입 업체와 매칭 안 되는 폴더는 admin 이 수동으로 alias 등록:

POST /api/v1/companies/folder-aliases
{ folderName: "<외부 폴더명>", companyId: <가입 업체 id>, cascadeBackfill: true }

→ 즉시 가입 업체 폴더로 매핑 + 기존 contact 들 일괄 이동.

상세: docs/specs/features/webhard-visibility-and-external-inquiry-fix.md §정책 — Bug 2.
```

- [ ] **Step 4: API endpoint spec 추가**

`docs/specs/api/endpoints/integration.md` (또는 적절한 파일) 에 `POST /companies/folder-aliases` 명세 추가 (request/response/auth/error codes).

- [ ] **Step 5: docs commit**

```bash
git add docs/changelog/CHANGELOG.md docs/features-list.md \
        docs/specs/features/external-sync-company-folder.md \
        docs/specs/features/contact-webhard-folder.md \
        docs/specs/api/endpoints/integration.md
git commit -m "docs(task 25): CHANGELOG + features-list + cross-link + API spec

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Phase 5 — 최종 검증

### Task 5.1: 전체 테스트 + 타입 체크 + lint

- [ ] **Step 1: webhard-api 단위 + 통합 전체**

```bash
cd webhard-api && pnpm test
```

(e2e 인프라 부재 — 2026-04-28 결정으로 단위/통합 테스트로 통일. e2e 인프라 도입은 후속 task 로 분리.)

- [ ] **Step 2: 타입 체크**

```bash
cd /c/Users/jaehy/OneDrive/Desktop/dev/projects/yjlaser/yjlaser_website && npx tsc --noEmit 2>&1 | grep -E "error|Error" | head -20 ; echo "---tsc-end---"
```

- [ ] **Step 3: lint**

```bash
pnpm lint
```

- [ ] **Step 4: dev DB 최종 검증 SQL**

`.env.local` DB 직접 조회:

```sql
-- Bug 1: 백필 잔여 0
SELECT COUNT(*) FROM webhard_files f JOIN webhard_folders wf ON f.folder_id = wf.id
WHERE f.company_id IS NULL AND wf.company_id IS NOT NULL AND f.deleted_at IS NULL;

-- Bug 2: 대성목형 alias 매핑 적용 확인
SELECT * FROM company_folder_aliases WHERE folder_name = '대성목형(2265-1295)';
SELECT COUNT(*) FROM contacts WHERE company_name = '대성목형(2265-1295)' AND company_id IS NULL;
-- Expected: 0 (모두 대성목형 id=4 로 이동됨)
```

### Task 5.2: 사용자 검증 요청 + PR 작성

- [ ] **Step 1: localhost 에서 사용자 시나리오 재현 요청**

사용자에게:

1. admin 으로 대성목형 폴더 (`f78e1ea0-...`) 에 새 파일 업로드 → 회사 세션에서 가시 확인.
2. 외부 sync 로 `대성목형(2265-1295)` 신규 contact 생성 → `/대성목형/문의/...` 트리에 자동 통합 확인.
3. 미가입 업체 외부웹하드 폴더에 칼선의뢰/file 시드 → `외부웹하드/{미가입업체}/문의/...` 자동 생성 확인.

- [ ] **Step 2: PR 작성**

```bash
gh pr create --base master --head feat/task-25-webhard-fix \
  --title "task 25: 웹하드 가시성 회복 + 외부 폴더명 alias 매핑 + 미가입 업체 문의 폴더 자동화" \
  --body "$(cat <<'EOF'
## Summary
- Bug 1: admin 업로드 시 폴더 companyId 상속 + 1회 백필
- Bug 2: admin 수동 alias 매핑 endpoint POST /api/v1/companies/folder-aliases + 대성목형 즉시 적용
- Bug 3: 미가입 업체 외부 sync 통합 회귀 가드 (테스트만)

Spec: docs/specs/features/webhard-visibility-and-external-inquiry-fix.md
Plan: docs/superpowers/plans/2026-04-27-webhard-visibility-and-external-inquiry-fix.md

## Test plan
- [ ] webhard-api 단위 테스트 전체 PASS
- [ ] webhard-api 단위/통합 테스트 (F7, A7, E2E-1 service-level) PASS
- [ ] 타입체크 + lint 통과
- [ ] 사용자 시나리오 재현 검증 (admin 업로드 가시성, 대성목형 통합, 미가입 업체 문의 폴더)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## 검증 체크리스트 (요약)

| Phase | 검증 항목                                                   | 통과 신호                 |
| ----- | ----------------------------------------------------------- | ------------------------- |
| 1     | A1-A6 단위 PASS, 대성목형 즉시 적용 OK                      | jest + DB 조회            |
| 2     | F1-F9 단위 + F7 service-level integration PASS, 백필 잔여 0 | jest + SQL                |
| 3     | U1-U5/U5b 단위 PASS + getFolderTree 차단 강화 코드 통합     | jest                      |
| 4     | A7 + E2E-1 + docs commit                                    | jest + git log            |
| 5     | 전체 test + tsc + lint, prod DB 검증                        | 4종 모두 PASS + 사용자 OK |
