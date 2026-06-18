# laser-only-folder-lifecycle (레이저 전용 업체 폴더 라이프사이클 일관성)

> 작성일: 2026-04-30
> 상태: implemented (Phase 1-3) / Phase 4 deferred
> 관련: [laser-only-company-inquiry.md](./laser-only-company-inquiry.md), task 24/26/27 (alias backfill / external husk migration)

## 개요

- 목적: 레이저 전용 업체(`laser_only=true` Company + LaserOnlyMapping)에서 외부웹하드(LGU+) 동기화로 들어온 파일이 매핑 등록 후 정식 업체 폴더로 실제 이전되고, contact 가 그 위치를 가리키며, 작업자의 "레이저완료" 처리 시 inquiry 폴더가 `완료/` 하위로 이동되도록 전체 폴더 라이프사이클을 일관되게 한다.
- 도메인: 외부웹하드 매핑(`folder-alias`), Contact 폴더 동기화(`contact-folder-sync`), Inquiry 폴더 ensure, 레이저 전용 완료 처리.
- 트리거 사례 (대성목형):
  - Company `대성목형` 등록 + LaserOnlyMapping `대성목형(2265-1295)` ↔ `대성목형` 연결 + 외부웹하드 매뉴얼 매핑 `대성목형(2265-1295)` ↔ `대성목형` 등록(cascadeBackfill=true) 모두 완료.
  - 그러나 contact 카드의 path 가 `/외부웹하드/대성목형(2265-1295)` 그대로이고 `대성목형/문의/` 하위에 inquiry 폴더가 생성되지 않음.
  - "재마이그레이션" 결과: `Contact 0건, 폴더 0개, 파일 0개 이동, 외부 husk 유지`.

## 문제 진단

### 결함 1 — `runCascadeBackfill` 의 외부 root lookup silent skip

`webhard-api/src/companies/folder-alias.service.ts:236-244` 의 외부 root lookup 은 path 정확 매칭만 사용한다.

```ts
const externalRoot = await tx.webhardFolder.findFirst({
  where: {
    name: folderName,
    path: `/외부웹하드/${folderName}`,
    deletedAt: null,
  },
});
if (externalRoot) {
  migration = await this.contactFolderSync.migrateExternalFolderTreeToCompany(...);
}
// ← externalRoot null 시 migrate skip + externalRootFound: false 반환
```

주석에도 명시되어 있다:

> alias.folderName 이 실제 WebhardFolder.name 과 정확히 일치해야 매칭 — 공백·괄호·유니코드 차이는 silent skip.

대성목형 케이스에서 매핑 등록 후 `migrateExternalFolderTreeToCompany` 가 호출되지 않아 외부 husk 의 파일/폴더가 정식 업체 폴더로 이전되지 않는다. 운영 UI 의 `externalRootFound=false` 가이드 표시도 표면화되지 못한 상태(또는 매핑 등록 시점 응답이 사라진 후 재진단 곤란).

### 결함 2 — contact.webhardFolderId 갱신 흐름 부재

`relocateAfterAliasApproved` 는 contact 의 `companyId / companyName` 만 갱신하고 `webhardFolderId` 는 건드리지 않는다.

`ensureInquiryFolder` 가 inquiry 폴더를 생성하더라도 contact.webhardFolderId 는 외부 husk 폴더 id 를 계속 가리킨다. 결과:

- WORKER 페이지의 "웹하드에서 열기" 클릭 시 외부 husk 트리로 진입.
- contact 카드의 path 표시도 husk path (`/외부웹하드/대성목형(2265-1295)`) 그대로.

### 결함 3 — `ensureInquiryFolder` 호출 가부 불확실

매핑 등록 시점의 `relocateAfterAliasApproved` 가 분류된 contact 에 대해 `onContactCreated` 를 재호출하므로 이론상 `ensureInquiryFolder` 가 호출되어야 한다. 그러나 결함 1 로 migrate 가 silent skip 된 상황에서 정식 root 의 `문의/` template 폴더가 ensure 되지 않았을 가능성, 또는 `resolveCompanyRoot` 가 외부 husk 와 정식 root 사이에서 모호한 결과를 반환할 가능성이 남는다 — Phase 1 적용 후 잔존 여부를 검증한다.

### 결함 4 — `completeLaserOnlyContact` 에 폴더 이동 호출 누락

`webhard-api/src/contacts/contacts.service.ts:1145-1206` 의 `completeLaserOnlyContact` 는 status='completed' 전환과 timeline 기록만 수행한다. 일반 목형 문의의 `processStage='delivery'` 전환에서 호출하는 `FoldersService.moveInquiryFolderToCompleted(contactId)` 가 누락되어 있다.

레이저 전용 업체에서 작업자가 "레이저완료" 를 눌러도 inquiry 폴더가 `완료/` 하위로 이동되지 않는다.

## 설계

### Phase 1 — 외부 root lookup 강화 (silent skip 차단)

**대상:** `webhard-api/src/companies/folder-alias.service.ts` `runCascadeBackfill` 의 외부 root lookup.

**정책:** 3 단계 fallback. 가장 안전한 path 정확 매칭부터 시도하고, 실패 시 외부웹하드 root 의 직접 자식 중 name 일치 → 정규화 매칭 순으로 확장한다. 한 단계라도 매칭 성공하면 그 폴더로 `migrateExternalFolderTreeToCompany` 를 호출한다.

```ts
// 1차: 기존 path 정확 매칭 (변경 없음 — 가장 안전한 경로 우선)
let externalRoot = await tx.webhardFolder.findFirst({
  where: {
    name: folderName,
    path: `/외부웹하드/${folderName}`,
    deletedAt: null,
  },
  select: { id: true, name: true, path: true, parentId: true },
});

// 2차 fallback: 외부웹하드 root 의 직접 자식 중 name 일치 (공백·괄호 변형 흡수)
if (!externalRoot) {
  const externalParent = await tx.webhardFolder.findFirst({
    where: { name: '외부웹하드', parentId: null, deletedAt: null },
    select: { id: true },
  });
  if (externalParent) {
    externalRoot = await tx.webhardFolder.findFirst({
      where: {
        parentId: externalParent.id,
        name: folderName.trim(),
        deletedAt: null,
      },
      select: { id: true, name: true, path: true, parentId: true },
    });
  }
}

// 3차 fallback: 정규화 매칭 (NFKC + 공백/특수문자 흡수)
if (!externalRoot) {
  const normalized = normalizeCompanyName(folderName);
  if (normalized && externalParent) {
    const candidates = await tx.webhardFolder.findMany({
      where: { parentId: externalParent.id, deletedAt: null },
      select: { id: true, name: true, path: true, parentId: true },
    });
    externalRoot = candidates.find((f) => normalizeCompanyName(f.name) === normalized) ?? null;
  }
}
```

**불변 조건:**

- 매칭 후보가 반드시 `/외부웹하드/` 직속 자식이어야 함 (depth=2). 외부웹하드 트리 안 깊은 위치의 동명 폴더가 false-match 되지 않도록 `parentId = externalParent.id` 조건을 강제한다.
- 1차 매칭 성공 시 2/3차 skip — 안전성 우선.
- 매칭 실패 시 기존과 동일하게 `externalRootFound: false` 응답 + log warn (운영 UI 가이드 유지).

**효과:**

- `대성목형(2265-1295)` 같이 입력값과 실제 폴더명이 미세 차이로 어긋난 케이스가 정상 매칭됨.
- `migrateExternalFolderTreeToCompany` 정상 진입 → 외부 husk 의 자식 폴더/파일이 정식 업체 폴더로 이전됨.
- 외부 husk root 자체는 task 27 정책대로 husk 로 유지 — 회귀 없음.

### Phase 2 — contact.webhardFolderId 갱신

**대상:** `webhard-api/src/folders/folders.service.ts` `ensureInquiryFolder`.

**정책:** inquiry 폴더 생성 직후, contact 의 `webhardFolderId` 가 외부 husk 폴더(또는 외부웹하드 트리 안의 폴더)를 가리키고 있으면 새 inquiry 폴더 id 로 갱신한다. 이미 정식 트리를 가리키면 건드리지 않는다(멱등).

```ts
// 6단계 (생성 직후) 또는 1단계 (existing 반환) 양쪽에 동일 로직 적용
const newOrExisting = created; /* or existing */

const target = await client.contact.findUnique({
  where: { id: contactId },
  select: { webhardFolderId: true },
});
if (target?.webhardFolderId !== newOrExisting.id) {
  // 현재 webhardFolderId 가 외부웹하드 트리 안인지 검사 — husk 가리킴 케이스만 갱신 대상
  const currentFolder = target?.webhardFolderId
    ? await client.webhardFolder.findUnique({
        where: { id: target.webhardFolderId },
        select: { path: true },
      })
    : null;
  const isExternal = currentFolder?.path?.startsWith('/외부웹하드/') ?? true;
  if (isExternal) {
    await client.contact.update({
      where: { id: contactId },
      data: { webhardFolderId: newOrExisting.id },
    });
  }
}
```

**효과:**

- WORKER 페이지의 "웹하드에서 열기" 가 정식 inquiry 폴더로 진입.
- contact 카드 path 표시(현 webhardFolderId 의 path 기반)가 `/대성목형/문의/문의-260430(F-009)` 등 정식 path 로 갱신.

**대안:** `MigrateExternalFolderTreeToCompany` 안에서 외부 husk 를 가리키는 contact 를 일괄 갱신하는 방안도 고려 가능. 그러나 husk root 가 path 변경되지 않으므로(husk 유지) Phase 1 단독으로는 path 갱신이 부족. ensureInquiryFolder 에서 갱신하는 편이 단순.

### Phase 3 — `completeLaserOnlyContact` 폴더 이동 호출 추가

**대상:** `webhard-api/src/contacts/contacts.service.ts:1145-1206` `completeLaserOnlyContact`.

**변경:**

```ts
async completeLaserOnlyContact(id, actor) {
  // ... 기존: status='completed' 업데이트 + timeline 기록 + emit ...

  // [신규] 일반 delivery 와 동일하게 inquiry 폴더를 완료/ 로 이동 — Best Effort
  try {
    await this.foldersService.moveInquiryFolderToCompleted(id);
  } catch (err) {
    this.logger.error(
      `moveInquiryFolderToCompleted failed for contactId=${id}: ${err instanceof Error ? err.message : err}`
    );
  }

  return result;
}
```

**보장 속성:**

- 멱등성: `moveInquiryFolderToCompleted` 자체가 이미 완료/ 하위면 no-op.
- Best Effort: 폴더 이동 실패해도 status 전환은 성공 (작업자 UX 회귀 방지).
- R2 키 불변.
- 일반 목형 문의의 delivery 단계와 동일 정책 → 흐름 일관.

### Phase 4 — 매핑 등록 결과 진단성 보강 (선택)

**대상:** 운영 UI — 매뉴얼 매핑 등록 응답 / 재마이그레이션 응답.

**변경:** `externalRootFound: false` 또는 `movedFolders=0 && movedFiles=0` 시 운영자에게 명시적 경고 메시지("외부 폴더 트리를 찾지 못했습니다. 폴더명 변형 가능성 — 직접 확인 필요."). 응답 데이터는 이미 갖추어져 있으므로 표시 로직만 추가.

Phase 1 적용으로 silent skip 자체가 거의 사라지면 Phase 4 의 우선순위는 낮아진다 — Phase 1~3 종료 후 운영 모니터링 결과로 결정.

## 변경 파일 목록

### 백엔드 (NestJS)

| 파일                                                     | 변경 내용                                                                     | Phase |
| -------------------------------------------------------- | ----------------------------------------------------------------------------- | ----- |
| `webhard-api/src/companies/folder-alias.service.ts`      | `runCascadeBackfill` 의 externalRoot lookup 3-step fallback                   | 1     |
| `webhard-api/src/companies/folder-alias.service.spec.ts` | 신규 fallback 분기 테스트 (path 매칭 실패 → name fallback 성공 등)            | 1     |
| `webhard-api/src/folders/folders.service.ts`             | `ensureInquiryFolder` 끝에 contact.webhardFolderId 갱신 분기                  | 2     |
| `webhard-api/src/folders/folders.service.spec.ts`        | 외부 husk 가리킴 → 정식 폴더 갱신 / 이미 정식 폴더 → no-op 테스트             | 2     |
| `webhard-api/src/contacts/contacts.service.ts`           | `completeLaserOnlyContact` 에 `moveInquiryFolderToCompleted` 호출 (try/catch) | 3     |
| `webhard-api/src/contacts/contacts.service.spec.ts`      | laser_cutting 완료 시 폴더 이동 호출됨 / 실패해도 status 전환 성공 테스트     | 3     |

### 프론트엔드 (Next.js)

| 파일                                                                             | 변경 내용                                                                                   | Phase |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----- |
| (Phase 4 진행 시 위치 식별) 매뉴얼 매핑 등록 / 재마이그레이션 결과 표시 컴포넌트 | `externalRootFound: false` 또는 `movedFolders=0 && movedFiles=0` 시 운영자 경고 표시 (선택) | 4     |

## 테스트 전략

### Jest 단위 테스트 (백엔드)

**Phase 1:**

- E1: path 정확 매칭 성공 시 1차 매칭으로 종료
- E2: path 매칭 실패 + 외부웹하드 root 자식 중 name 일치 → 2차 매칭 성공
- E3: 1/2 차 실패 + 정규화 매칭 성공 → 3차 매칭 성공
- E4: 모두 실패 시 `externalRootFound: false` 반환 (회귀 검증)
- E5: 외부웹하드 트리 깊이 깊은 동명 폴더 false-match 안됨 (parentId 조건 검증)

**Phase 2:**

- F1: contact.webhardFolderId 가 외부웹하드 트리 폴더 → ensureInquiryFolder 후 정식 inquiry 폴더 id 로 갱신
- F2: contact.webhardFolderId 가 이미 정식 inquiry 폴더 → no-op
- F3: contact.webhardFolderId null → inquiry 폴더 id 로 갱신
- F4: ensureInquiryFolder existing 분기에서도 동일 갱신

**Phase 3:**

- H1: laser_cutting 완료 시 `moveInquiryFolderToCompleted(id)` 호출
- H2: 폴더 이동 실패해도 `status='completed'` 결과 반환 (Best Effort)
- H3: inquiry 폴더 없는 contact 도 status 는 정상 변경

### 통합 검증 시나리오

대성목형 케이스 재현:

1. Company `대성목형` 등록 (initializeCompanyFolders 호출 — 정식 root + 4 templates 생성 확인)
2. 외부웹하드 sync 로 `대성목형(2265-1295)` 폴더 + 파일 다수 누적 (`folderKind` 외부 husk 트리)
3. 매뉴얼 매핑 등록 (cascadeBackfill=true)
   - **검증**: 응답의 `externalRootFound: true`, `movedFolders/movedFiles > 0`
4. 외부 husk 자식 폴더/파일이 정식 업체 폴더로 이전 (Phase 1 효과)
5. 분류된 contact 의 inquiry 폴더가 `대성목형/문의/문의-260430(F-009)` 형태로 생성
6. contact.webhardFolderId 가 정식 inquiry 폴더 id 로 갱신 (Phase 2 효과)
7. WORKER 페이지 "웹하드에서 열기" 클릭 → 정식 inquiry 폴더로 진입
8. contact 카드 path 표시가 `/대성목형/문의/문의-260430(F-009)` 형태
9. 작업자 "레이저완료" 클릭 → inquiry 폴더가 `대성목형/완료/문의-260430(F-009)` 로 이동 (Phase 3 효과)

## 호환성 / 위험

- **task 27 husk 정책 유지**: Phase 1 의 fallback 매칭이 외부 husk root 자체는 husk 로 유지 (cascade soft-delete 없음). 신규 sync routing 진입 보장.
- **R2 객체 키 불변**: 모든 Phase 에서 `WebhardFile.path` (R2 key) 는 변경하지 않음. 다운로드 URL 무영향.
- **멱등성**: 모든 Phase 가 멱등. 재실행 안전.
- **일반 목형 문의 무영향**: Phase 3 은 `inquiryType='laser_cutting'` 분기만 변경. 일반 delivery 흐름은 그대로.
- **롤백**: 각 Phase 가 단일 파일/단일 메서드 변경 → 개별 revert 가능.

## 운영자 절차 가이드 (Phase 1 적용 후)

대성목형 케이스 복구 절차:

1. 운영자가 매뉴얼 매핑 페이지에서 등록된 매핑 행 옆 **"재마이그레이션"** 버튼 클릭.
2. 응답에 `movedFolders > 0`, `movedFiles > 0`, `externalRootFound: true` 표시 확인.
3. 좌측 사이드바의 `대성목형` 폴더 진입 → `문의/` 안에 inquiry 폴더(`문의-260430(F-009)` 등) 일괄 생성 확인.
4. 작업현황 페이지 새로고침 → contact 카드 path 가 정식 폴더 경로로 갱신됨.
5. 임의 contact 의 "레이저완료" 시 inquiry 폴더가 `완료/` 하위로 이동.

매핑 삭제 후 재등록도 동일 효과. 단 `relocateAfterAliasApproved` 의 멱등성 (`companyId IS NULL` 필터) 때문에 contact 의 `companyId` 가 이미 채워져 있으면 relocate 단계는 0 — Phase 2 효과는 ensureInquiryFolder 시점 (다음 sync 또는 inquiry 폴더 ensure trigger) 에서 발휘.

## 완료 기준

1. [ ] `runCascadeBackfill` 의 외부 root 3-step fallback lookup 동작 (단위 테스트 E1~E5 통과)
2. [ ] `ensureInquiryFolder` 가 contact.webhardFolderId 외부 husk 가리킴 시 정식 inquiry 폴더 id 로 갱신 (단위 테스트 F1~F4 통과)
3. [ ] `completeLaserOnlyContact` 에서 `moveInquiryFolderToCompleted` 호출 (단위 테스트 H1~H3 통과)
4. [ ] 대성목형 케이스 통합 검증 시나리오 1~9 단계 모두 통과
5. [ ] 일반 목형 문의의 delivery 흐름 회귀 없음 (기존 테스트 그대로 통과)
6. [ ] CHANGELOG.md 에 task 번호와 변경 요약 기록
7. [ ] (선택) Phase 4 운영 UI 진단 메시지 보강

## 미해결 의사 결정

- **Phase 4 시점**: Phase 1~3 운영 모니터링 후 silent skip 사례가 잔존하면 Phase 4 진행 — 현 시점 보류.
- **외부 폴더명 정규화 정책**: Phase 1 의 3차 fallback 인 `normalizeCompanyName` 이 이미 존재 (`webhard-api/src/companies/_lib/`). 동일 함수 재사용. 신규 정규화 정책은 도입 안 함.
- **contact.webhardFolderId 갱신 trigger**: ensureInquiryFolder 에서만 처리할지, 별도의 일괄 백필 메서드를 추가할지. 본 spec 은 ensureInquiryFolder 단일 진입점 정책 유지. 일괄 백필 필요 시 후속 RFC.
