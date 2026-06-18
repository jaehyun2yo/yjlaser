# Drawing Workflow (도면 워크플로우)

## 개요

- 목적: 도면이 공정 단계를 거치며 업데이트되는 과정을 한 문의(Contact) 단위로 자동 관리
- 도메인: CRM > 문의 관리 > 도면 워크플로우
- 배경: 도무송 목형 제작 과정에서 도면은 접수 → 도면작업 → 샘플 → 목형의뢰(도면확정) → 현장가공까지 여러 번 수정된다. 기존에는 DrawingRevision 테이블로 이력을 추적하되, 단계별 최신 도면 조회·거래처/Worker 업로드·DXF 자동 매칭·수정요청 통합 등이 부재했다.

## 핵심 요구사항

### A. 상태별 최신 도면 조회

문의 요약에서 현재 processStage에 맞는 최신 도면을 원클릭 다운로드한다.

조회 규칙:

| processStage      | 최신 도면 기준                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------- |
| drawing           | reason=initial 또는 domuson_fit의 최신 revision                                          |
| sample            | reason=sample_revision의 최신 (없으면 이전 단계 fallback)                                |
| drawing_confirmed | processStage=drawing_confirmed의 최신 revision                                           |
| laser ~ creasing  | reason=field_correction 또는 laser_processing의 최신 (없으면 drawing_confirmed fallback) |

다운로드 프록시 `GET /api/v1/contacts/:id/latest-drawing-url` 과 Worker/관리자 문의 카드 다운로드 버튼은 별도 계약을 따른다. 사용자가 "최신 도면 다운로드"를 누르면 현재 공정 기준 필터를 적용하지 않고 마지막으로 업로드된 DrawingRevision(`createdAt DESC`)을 다운로드한다. DrawingRevision이 없으면 `contact.drawingFileUrl`로 fallback한다. Next.js 카드 다운로드 route는 최종 다운로드명을 `문의번호 - 업체명 - 파일명` 형식으로 재구성하며, backend/WebhardFile 단계에서 붙은 `[O]`/`[F]` prefix, 기존 동일 다운로드 prefix, 짧은 `O-001`/`F-001` prefix는 제거한다. Worker 카드의 화면 표시명은 실제 파일명을 변경하지 않고 `업체명 - 파일명`으로만 표시한다.

### B. 통합 타임라인

문의 상세에서 공정 단계 변경, 유형 변경, 업체 변경 같은 Contact 이벤트(`ContactStatusHistory`)와 도면 수정(`DrawingRevision`)을 하나의 시간순 리스트로 표시한다. 서버에서 두 소스를 인터리브하여 단일 배열로 응답한다.

- 각 항목은 `kind: 'status_change' | 'drawing_revision'`으로 구분
- `drawing_revision` 항목은 버전 뱃지·reason 라벨·파일 목록·다운로드 버튼·공개/비공개 뱃지를 인라인 렌더
- `status_change` 항목은 변경 유형(공정/문의유형/업체)과 from→to 값 표시
- 관리자/거래처 공통 컴포넌트를 사용하되, 거래처는 서버에서 필터된 응답만 수신 (클라이언트 필터 금지)
- 거래처 응답에서는 `isPublic=true`인 `drawing_revision`만 포함되며, `actorName`/`actorType`은 관리자 마스킹("YJLaser")으로, `note`는 제거 또는 마스킹된다

### C. 파일명 프리픽스

WebhardFile 자동 생성 / 분류 시점 rename 시, WebhardFile.name 앞에 문의번호를 추가한다.

- 형식: `[{대표번호}] {originalName}` (공통 유틸 `buildInquiryFileName`, phase 1)
- 대표번호는 `workNumber`가 있으면 공정/리비전 단계와 무관하게 현장작업번호(F)를 우선하고, 없을 때만 `inquiryNumber`(O)를 사용한다.
- 기존 파일명에 `[O]` 또는 `[F]` prefix가 이미 있으면 제거한 뒤 선택된 대표번호 하나만 붙인다.
- WebhardFile.originalName 은 유지 (중복 체크용)

### W. 웹하드 자동 저장

전 업로드 경로(LGU+ sync, 웹폼, 거래처 포탈, Worker, DXF 자동 매칭, 관리자 수동, stage_change, 관리자 분류)에서 WebhardFile 은 항상 `{거래처루트}/문의-{inquiryFolderName}/` 하위(납품 완료 시 `{거래처루트}/완료/문의-{inquiryFolderName}/`)에 정착한다. 신규 업로드뿐 아니라 **기존 미분류 파일도 분류 시점에 동일 경로로 자동 이동**한다.

#### W.1 불변 규칙 (현행)

> 2026-04-22 업데이트 — 중간 `문의/` 폴더 삽입 (task 20 webhard-folder-policy-unify). 기존 task 19 의 "업체 루트 직하" 규칙은 사용자가 프로덕션에 적용한 적 없어 본 문서 내에서 바로 교체한다.
> 2026-04-24 업데이트 — company 탐색 정책 통일 (task 22 contact-webhard-navigate). `ensureInquiryFolder` 와 `relocateContactFiles` 가 동일한 3단계 company 탐색 유틸을 공유하도록 통일. `relocateContactFiles` 의 silent bail-out 제거.
> 2026-04-24 업데이트 — Contact 생성/분류 확정/processStage 전환 시 폴더 생성 훅 단일화 (task 23 qa-contact-worker-v1). 미분류→분류 확정 시점에 `ensureInquiryFolder + relocateContactFiles` 시도. 단, Company 미등록 등으로 null 반환 시 생성·분류 단계에서는 warn+skip (UX 회귀 방지), `drawing_confirmed` 전환에서는 명시적 throw. `contact-folder-sync.service.ts` 가 단일 진입점으로 모든 호출처(`ContactsService.create`, `updateInquiryType`, `updateProcessStage`, `AutoContactService.createNewContact`) 를 경유. `updateProcessStage` 에서 `workNumber` 가 이미 존재하더라도 `drawing_confirmed` 전환 순간 폴더 rename(`문의-{O}` → `문의-{O}_{F}`) 은 실행된다 — 현재 `issueWorkNumber=false` 시 rename 을 skip 하는 로직은 **버그** 이며 Phase 5 에서 수정. 폴더명 스키마에 `packageLabel`(inquiry*title) / `filenameFallback`(첫 첨부 파일명) 우선 사용, 둘 다 없으면 현행 `문의-{O}*{F}`유지. 상세 정책은`docs/specs/features/contact-webhard-folder.md`참고.
2026-04-29 업데이트 — 외부웹하드 폴더 통째 이전 + 신규 동기화 routing (task 26). alias 승인 시`migrateExternalFolderTreeToCompany`가 외부 폴더 트리를 가입 업체로 이전 (R2 key 불변 정책 그대로 유지 —`WebhardFile.path`변경 없음,`companyId`/`folderId`만 갱신). 신규 동기화는`getUploadPresignedUrl`의 서버 측 routing 으로 처음부터 업체 경로 PUT — 이때 R2 key 는 PUT 시점의 폴더 위치를 반영하며 이후 폴더 이동에 영향받지 않는다. 상세 정책은`docs/specs/features/external-folder-migration.md` 참고.

**저장 구조:**

```
{업체명 루트폴더}/
├── 칼선의뢰/              ← 기존 template. 거래처 원본 업로드 수신용 (삭제·이동 금지)
├── 목형의뢰/              ← 동일
├── 문의/                  ← [NEW] 중간 루트 (folderKind='template')
│   ├── 문의-{O}/          ← 분류 확정 Contact
│   ├── 문의-{O}_{F}/      ← F 번호 추가 발급 후 rename 결과
│   └── 문의-{O}-1/        ← 분할 Contact (독립 동급)
└── 완료/                  ← 납품 완료 이관 (folderKind='template', lazy 생성)
    └── 문의-{O}_{F}/
```

**불변 규칙:**

- 문의 폴더는 `ensureInquiryFolder(contactId, tx?)` 가 단일 진입점으로 생성·재사용한다. `contactId` 당 1 개. inquiryType 에 따른 template 분기는 **폐기** — task 18 의 `ensureInquiryFolder`(`folders.service.ts:1289`) 가 `inquiryType` null 시 폴더를 만들지 않고 null 을 반환하던 분기 조건은 phase 1 에서 제거된다. `tx` 인자는 호출자가 $transaction 을 확장할 때만 넘기고, 평상시에는 생략한다.
- 문의 폴더의 `parentId` 는 **업체 루트 하위 `문의/` 폴더** 를 가리킨다 (task 19 규칙 "업체 루트 직하" 에서 변경). `ensureInquiryRootFolder(companyId, tx?)` 가 업체별 `문의` 폴더를 lazy 보장한다 (`folderKind='template'`, `name='문의'`). `initializeCompanyFolders` 의 `DEFAULT_FOLDER_TEMPLATE` 에도 `문의` 가 포함되어 신규 업체는 eager 생성, 기존 업체는 lazy 대응.
- 납품 완료 시 `완료/` 폴더의 `parentId` 는 여전히 업체 루트 직하 (중간 `문의/` 아님). `moveInquiryFolderToCompleted` 의 reparent 대상은 업체 루트 하위 `완료/` 로 유지 — 로직 변경 없음.
- O 만 있을 때: 폴더명 `문의-{inquiryNumber}`. O + F 공존: `문의-{inquiryNumber}_{workNumber}` (공통 유틸 `buildInquiryFolderName` 재사용, phase 1 규칙 그대로).
- 파일명 규칙(`[{대표번호}] {originalName}`) 은 공통 유틸 `buildInquiryFileName` 을 사용한다. `workNumber`가 있으면 F 번호를 우선하고, 없을 때만 O 번호를 사용하며, 기존 O/F prefix는 제거 후 하나만 다시 붙인다.
- F 번호 추가 발급 시점에 전용 헬퍼 `renameInquiryFolderForContact(contactId, tx?)` 로 기존 폴더를 **rename** 한다. 호출처: `ContactsService.updateStatus`(production 전환), `updateProcessStage`(workNumber 신규 발번 분기), `updateInquiryType`(workNumber 신규 발번 분기) — 세 경로 모두 `$transaction` 내부에서 workNumber 를 발번한 뒤 `ensureInquiryFolder` + `relocateContactFiles` 호출 직전에 실행된다. DB `WebhardFolder.name` / `path` / `inquiry_number` / `work_number` 만 갱신, `WebhardFolder.id` 와 `WebhardFile.path`(R2 object key) 는 **유지** — 이미 발급된 presigned URL 도 계속 유효.
- 납품 완료(`processStage` 가 `'delivery'` 로 전환) 이벤트에 따라 전용 헬퍼 `moveInquiryFolderToCompleted(contactId, tx?)` 가 해당 문의 폴더의 `parentId` 를 업체 루트 하위 `완료/` 폴더로 변경한다. 호출처: `ContactsService.updateProcessStage` 의 `delivery` 전환 분기 (Best Effort — `try/catch + logger.warn`, 실패해도 stage 전환 자체는 성공 처리). `완료/` 폴더는 필요 시점 lazy 생성 (`folderKind='template'`). R2 key 유지. 이미 `완료/` 하위면 no-op (`parentId` 부모의 `name === '완료'` 검사).
- 원본 도면 + Worker revision 모두 `relocateContactFiles(contactId, targetFolderId, tx?)` 로 해당 Contact 의 모든 `WebhardFile` 을 같은 문의 폴더로 이동한다. `folderId` 만 갱신 — 역시 R2 key 유지.
- 기존 template (`칼선의뢰` / `목형의뢰`) 폴더는 **절대 삭제·이동하지 않는다**. 거래처가 직접 웹하드에 업로드한 원본 도면의 수신 경로로 계속 사용. 이 두 폴더는 `foldersService.initializeCompanyFolders`(`folders.service.ts:526`) + `DEFAULT_FOLDER_TEMPLATE`(`folders.service.ts:474`) 로 업체 초기화 시 자동 생성되며 `folderKind='template'` 로 계속 보장된다.
- **중복 생성 방지**: `POST /contacts/:id/link-webhard-file` 은 이미 존재하는 WebhardFile 을 재사용 — 신규 생성하지 않고 `inquiryNumber` + `folderId` 만 갱신. `createInitialRevision`(source === 'auto_initial') 도 `ContactsService.create` 의 `ensureInquiryFolder + relocateContactFiles` 가 이미 WebhardFile 을 정착시키므로 `DrawingRevision.createRevision` 경로에서는 skip (task 20 phase 2 에서 `registerFilesToWebhard` 삭제 이후에도 동일).
- **Company 탐색 유틸 단일화 (task 22)**: `ensureInquiryFolder` 와 `relocateContactFiles` 는 동일한 3단계 company 탐색 유틸 `resolveCompanyRoot(client, companyName, tx?)` 를 공유한다. 탐색 순서:
  1. `Company` 테이블에서 `companyName` 일치 → 해당 `company_id` 의 루트 `webhard_folders` 조회
  2. `webhard_folders.name` 완전 일치 fallback (task 20, 9be443cc)
  3. `webhard_folders.name` 정규화 매칭 fallback (task 21) — NFKC + 공백/특수문자 제거 + 소문자화
- **`relocateContactFiles` silent bail-out 제거 (task 22)**: 과거 `if (!company) return { movedIds: [] }` 은 제거된다. LGU+ 동기화로 생성된 `company_id=null` 가상 업체(정식 Company row 미등록) 의 도면도 위 fallback rootFolder 를 통해 정상 이동한다.
- 위 유틸은 `webhard-api/src/folders/_lib/resolve-company-root.util.ts` 로 단일 진입점 보장. `ensureInquiryRootFolder` / `ensureInquiryFolder` / `relocateContactFiles` 모두 이 유틸을 사용한다.
- 반환 타입: `{ rootFolderId: string | null, reasonCode?: 'NO_COMPANY_ROOT' | 'NO_FALLBACK_MATCH' }`. 실패 시 `logger.warn` 에 `reasonCode` 기록 (기존 폴더 생성 실패 진단 로그와 동일 필드 규약 — `#### 폴더 생성 실패 진단 (task 21)` 참고).

**Contact 생성 경로별 폴더 동작:**

| #   | 경로             | 트리거                            | inquiryType 확정       | 폴더 생성 동작                                                                                                                                                                                                                                  |
| --- | ---------------- | --------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 웹폼             | `POST /api/v1/contacts`           | create 호출 시 DTO 로  | 트랜잭션 내부 `ensureInquiryFolder + relocateContactFiles` 후, Contact 생성 완료 단계에서 도면/첨부/참고사진을 문의 폴더 `WebhardFile`로 등록한다. 실제 R2 key와 파일 표시명은 재작성하지 않는다.                                               |
| 2   | 웹하드 단건 감지 | `confirmUpload` → `autoContact`   | 폴더 경로 탐색         | 트랜잭션 **밖** `ensureInquiryFolder` (**best-effort** — try/catch + warn, Contact 은 유지). 미분류 상태에서도 `inquiryNumber` 기반 `문의-{O}` 폴더 생성 (task 21). `relocateContactFiles` 는 분류 확정 시(`finalInquiryType` truthy) 에만 호출 |
| 3   | 웹하드 배치 감지 | `batchConfirmUpload`              | 동일                   | 동일 (`AutoContactService.createNewContact` 공통 경로)                                                                                                                                                                                          |
| 4   | 관리프로그램 DXF | `POST /integration/contacts/auto` | 항상 mold_request 고정 | [task 22+ 범위] — 현재 폴더 연결 없음 유지                                                                                                                                                                                                      |
| 5   | 문의 분할        | `POST /contacts/:id/split`        | 부모에서 복사          | 자식별 트랜잭션 내부 `ensureInquiryFolder(childId)` 호출 (strict), 폴더명 `문의-{O}-{i}` (독립 동급). 부모 폴더·파일은 건드리지 않음                                                                                                            |

미분류 Contact (`inquiryType=null`) 는 `inquiryNumber` 가 있을 때 `문의-{O}` 폴더를 생성한다 (task 21). 원본 파일은 `relocateContactFiles` 가 분류 확정 시점에만 이동하므로, 미분류 구간에는 업체 루트에 유지된다.

**WebhardFile 필드:**

- `name`: `[{대표번호}] {originalName}` (`buildInquiryFileName`, phase 1)
- `originalName`: 원본 그대로 유지 (중복 체크용)
- `inquiryNumber`: Contact의 `inquiryNumber`가 있으면 저장하고, 없으면 `workNumber`로 fallback한다. 파일 표시명 prefix 선택 규칙과는 별개로 legacy 컬럼명은 유지한다.
- `companyId`: 서버 세션/Contact 에서 파생 (클라이언트 값 신뢰 금지)
- `folderId`: `ensureInquiryFolder` 가 반환한 `webhard_folders.id`. 폴더 이동/rename 후에도 동일 row 의 `folderId` 만 갱신.

**유입 경로별 동작 (task 21 기준):**

1. **LGU+ sync (auto-contact)**: 기존대로 업체 루트 또는 template 폴더(`칼선의뢰|목형의뢰`)로 미러링. `triggerAutoContact` / `batchTriggerAutoContact` → `AutoContactService.detectAndCreate` → `createNewContact` 끝단에서 `ensureInquiryFolder` 를 **무조건** 호출 (task 21). `inquiryNumber` 만 있어도 업체 루트 하위 `문의/` 폴더 아래에 `문의-{O}/` 생성. `relocateContactFiles` 는 `folder && finalInquiryType` 조건에서만 실행 — 미분류 상태의 파일 이동은 하지 않는다. **best-effort** — Contact 트랜잭션 **밖**에서 try/catch+warn 으로 감싸 개별 실패가 LGU+ 대량 sync 전체를 막지 않는다 (Contact 자체는 성공). 미분류 → 분류 전환 시 파일 이동은 기존 `updateInquiryType` 경로 (task 20 phase 3) 가 처리.
2. **웹 폼 제출 (`POST /api/v1/contacts`)**: Contact 생성 + 초기 `DrawingRevision`(v1) + `ensureInquiryFolder + relocateContactFiles` 를 `$transaction` 내에서 수행한 뒤, Contact 생성 완료 후 도면/첨부/참고사진을 문의 폴더의 `WebhardFile`로 등록한다. 초기 `DrawingRevision`의 파일은 R2 URL로 유지되며, 별도 WebhardFile metadata를 만들어 자체웹하드 문의 폴더에서 파일이 조회되게 한다. 이 단계는 실제 R2 object key나 기존 WebhardFile 표시명을 재작성하지 않는다.
3. **거래처/Worker 업로드** (`company-drawing`, Worker revision): `DrawingRevision` 생성 → `ensureInquiryFolder` → `relocateContactFiles`. 실패 시 응답에 `webhardWarning` 포함 (Revision 레코드 자체는 성공, task 19 규칙 유지). code 후보 `NO_INQUIRY_NUMBER` / `FOLDER_CREATE_FAILED` / `RELOCATE_FAILED`.
4. **F 번호 부여** (`ContactsService.updateStatus` production 분기, `updateProcessStage` workNumber 발번 분기, `updateInquiryType` workNumber 발번 분기): `renameInquiryFolderForContact` 가 기존 `문의-{O}` 폴더를 `문의-{O}_{F}` 로 rename. DB 메타만 갱신 — R2 key 유지.
5. **납품 완료**: `processStage = 'delivery'` 전환 이벤트에 따라 `moveInquiryFolderToCompleted` 가 해당 문의 폴더의 `parentId` 를 업체 루트 하위 `완료/` 폴더로 변경 (중간 `문의/` 아님). `완료/` 는 lazy 생성. R2 key 유지.
6. **관리자 수동 분류** (`inquiryType` 변경): `updateInquiryType` 트랜잭션 내부에서 `ensureInquiryFolder + relocateContactFiles` 수행. 기존 미분류 파일도 그 시점에 `문의/문의-{번호}/` 로 이동.
7. **문의 분할** (`POST /contacts/:id/split`): `splitContact` 트랜잭션 내부에서 자식별 `ensureInquiryFolder(childId)` 호출 (자식 inquiryType 이 있을 때만). 자식 폴더명은 `문의-{부모O}-{i}` — 부모 폴더 옆에 동급으로 배치 (중간 `문의/` 폴더 하위). 부모 폴더·파일·`renameInquiryFolderForContact`·`moveInquiryFolderToCompleted` 모두 건드리지 않음.

#### 미분류 상태에서의 폴더 생성 (task 21)

`inquiryType = null` 인 Contact 라 하더라도, `inquiryNumber` 만 있으면 `문의-{O}` 이름으로 폴더를 즉시 생성한다.

- 이후 분류 확정 + `workNumber` 발급 시점에 `ensureInquiryFolder` 가 기존 폴더를 재활용하여 `문의-{O}_{F}` 로 rename (task 20 기존 로직).
- 외부웹하드 동기화(LGU+) → 자체웹하드 auto-contact 경로에서 업로드되는 도면은 분류 전에도 이 폴더에 누적된다.
- 이유: 미분류 상태에서 추가 업로드되는 도면이 업체 루트에 누적되어 식별 불가능해지는 문제 해소.

#### 업체 루트 매칭 fallback 2단계 (task 21)

업체 루트 폴더 조회는 다음 순서로 시도한다:

1. `Company` 테이블에서 `companyName` 일치 조회 → `company_id` 로 `webhard_folders` 조회
2. (1) 실패 시 `webhard_folders.name` 완전 일치 fallback (task 20, 9be443cc)
3. (2) 실패 시 `webhard_folders.name` 정규화 매칭 fallback (task 21) — NFKC 정규화 + 공백·특수문자 제거 + 소문자화 후 비교
4. 모두 실패 시 null 반환 + `logger.warn` 에 `reason_code` 기록

#### 경로 1 (웹폼) `!company` 가드 완화 (task 21)

경로 1 (웹폼): `Company` 매칭 실패 (`!company`) 시에도 `created.inquiryType` 이 확정되어 있다면 `ensureInquiryFolder` 를 호출한다 (task 21).
내부 2단계 fallback (완전→정규화) 이 가상 업체 루트를 찾아 `문의-{O}` (또는 O+F 조합) 폴더를 생성한다.
`webhard_company_mismatch` 알림은 기존과 동일하게 **먼저** 발송한 뒤 폴더 생성을 시도한다 (변경 없음 + 호출 순서 고정).
폴더 생성 실패 시 Contact 는 유지 (best-effort) — `logger.warn` reason_code 로 추적. 트랜잭션 내부이지만 try/catch 로 예외를 흡수해 Contact INSERT 는 롤백되지 않는다.

> 참고: 웹폼 경로에서 `inquiryType` 이 null 인 미분류 공개 문의는 `ensureInquiryFolder` 호출에서 제외된다 — 해당 공개폼은 분류 전 상태로는 웹하드 파일이 연결되지 않으므로 폴더를 미리 만들 필요가 없고, 분류 확정 시점(`updateInquiryType`)에 기존 로직이 폴더를 확보한다. 미분류 상태에서 폴더를 즉시 만드는 정책은 경로 2·3 (auto-contact) 에만 적용된다.

#### 경로 2·3 (auto-contact) 미분류 처리 (task 21)

경로 2·3 (auto-contact): `finalInquiryType` 확정 여부와 무관하게 `ensureInquiryFolder` 를 호출한다 (task 21).

- 미분류 상태로 생성된 Contact 는 `문의-{O}` 폴더로 즉시 연결.
- 분류 확정 + `workNumber` 발급 시 `ensureInquiryFolder` 가 기존 폴더를 `문의-{O}_{F}` 로 rename (task 20 로직 재활용).
- 단, `relocateContactFiles` 는 **분류 확정 시에만** 호출 (미분류 파일을 엉뚱한 폴더로 옮기지 않도록). 미분류→분류 전환 시 파일 이동은 기존 `updateInquiryType` 경로 (task 20 phase 3) 가 처리.

#### 폴더 생성 실패 진단 (task 21)

전 경로 best-effort 정책. `ensureInquiryFolder` 가 null 반환 시 실패 원인 코드를 `logger.warn` 에 기록한다:

- `NO_INQUIRY_NUMBER`: Contact 에 `inquiryNumber` 없음 (`buildInquiryFolderName` 이 null 반환)
- `NO_COMPANY_ROOT`: Company 매칭 성공했으나 해당 `company_id` 의 루트 폴더 조회·생성 실패
- `NO_FALLBACK_MATCH`: 아래 중 하나.
  - Contact 조회 실패 또는 `companyName` 누락
  - Company 없음 + `webhard_folders.name` 완전 일치·정규화 매칭 모두 실패
- `FOLDER_CREATE_FAILED`: `ensureInquiryRootFolder` 또는 `webhardFolder.create` 예외 (DB 오류)

로그 필드: `{ reason_code, contactId, companyName, inquiryNumber, message }`. `FOLDER_CREATE_FAILED` 는 추가로 `error` 필드 포함. Admin 재시도 UI 는 task 22+ 에 분리.

#### W.2 과거 규칙 (task 18, 참고용 보존)

> 2026-04-20 drawing-consistency (task 18) 에서 확정되었던 규칙. task 19 (2026-04-21) 에서 `문의-` 폴더가 template 폴더(`칼선의뢰|목형의뢰`) 하위가 아닌 업체 루트 직하에 놓이도록 단순화되었다. 과거 규칙 복원이 필요할 때만 참조.

**저장 경로(고정):**

- `{거래처루트(company.name)}/{template폴더: 칼선의뢰|목형의뢰}/문의-{inquiryFolderName}/{파일명}`
- 거래처 루트와 template 폴더(`목형의뢰`, `칼선의뢰`)는 `foldersService.initializeCompanyFolders`(`folders.service.ts:520`) 의 `DEFAULT_FOLDER_TEMPLATE`(`folders.service.ts:468`) 로 보장. template 폴더 이름은 변경하지 않는다.
- `문의-{번호}/` 서브폴더는 phase 4 의 공통 유틸 `ensureInquiryFolder` 가 단일 진입점으로 생성/재사용한다 (`webhard_folders.contact_id` 기준 findFirst → 없으면 create).

**`inquiryFolderName` 규칙(공통 유틸 `buildInquiryFolderName`, phase 1):**

| 입력             | 결과                                                   |
| ---------------- | ------------------------------------------------------ |
| O 만 발급        | `260417-O-002`                                         |
| F 만 발급        | `260420-F-004`                                         |
| O + F 둘 다 발급 | `260417-O-002_260420-F-004` (O 먼저, F 나중 고정 순서) |

분할 문의 suffix `-N`(예: `260417-O-002-1`) 는 번호 자체에 이미 포함되어 있으므로 그대로 사용한다.

**파일명 규칙(공통 유틸 `buildInquiryFileName`, phase 1):**

- 형식: `[{대표번호}] {originalName}` (대괄호 + 공백 1개)
- 대표번호 선택 우선순위:
  1. `workNumber`가 있으면 현장작업번호(F)를 사용
  2. `workNumber`가 없으면 `inquiryNumber`(O)를 사용
  3. 둘 다 없으면 prefix 없이 원본명 그대로
- 기존 파일명에 `[O]` 또는 `[F]` prefix가 이미 있으면 제거한 뒤 선택된 대표번호 하나만 다시 붙인다.

**WebhardFile 필드:**

- `name`: `[{대표번호}] {originalName}`
- `originalName`: 원본 그대로 유지 (중복 체크용)
- `inquiryNumber`: Contact의 `inquiryNumber`가 있으면 저장하고, 없으면 `workNumber`로 fallback한다.
- `companyId`: 서버 세션/Contact 에서 파생 (클라이언트 값 신뢰 금지)
- `folderId`: `ensureInquiryFolder` 가 반환한 `webhard_folders.id`. 폴더 이동 후에도 동일 row 의 `folderId` 만 갱신한다.

**Rename 시점(`문의-{O}` → `문의-{O}_{F}` 단 1회):**

- O 만 있던 문의에 F 가 추가 발급되는 순간만 rename 한다. trigger 위치:
  - `contacts.service.ts:873~889` — processStage 전환으로 workNumber 가 새로 발급될 때
  - `contacts.service.ts:1089~1107` — inquiryType 변경에 따른 workNumber 발급
  - `contacts.service.ts:732~733` — status 가 `production` 으로 진입할 때
- rename 시 `webhard_folders.id` 와 `webhard_files.path`(R2 key) 는 **유지**. 메타(`name`, `path string`, `inquiry_number`, `work_number`) 만 갱신한다.

**R2 key 정책:**

- 폴더 이동/rename 시 R2 object key 는 **변경하지 않는다**. `webhard_files.path` 는 R2 key 의미이므로 그대로 유지하고, 디스플레이 경로는 `webhard_folders.path` + `webhard_files.name` 으로 재구성한다.
- 이미 발급된 presigned URL 도 계속 유효하다.

**중복 생성 방지:**

- `POST /contacts/:id/link-webhard-file` (방법 B): 이미 존재하는 WebhardFile 을 재사용 — 신규 생성하지 않고 `inquiryNumber` + `folderId` 만 갱신한다.
- `createInitialRevision`(source === 'auto_initial'): `ContactsService.registerFilesToWebhard` 가 이미 등록하므로 `DrawingRevision.createRevision` 경로에서는 skip.

**유입 경로별 동작(task 18):**

1. **LGU+ sync (주경로)** — Electron 앱이 LGU+ 원본 경로(`올리기전용/{업체}/...`) 를 자체 웹하드로 미러링한다. 이 시점에는 업체 루트 또는 거래처 안내 서브폴더(`목형의뢰`/`칼선의뢰`) 에 파일이 떨어진다. `triggerAutoContact` 가 `classifyByFolderPath` 로 분류하면 phase 5 훅이 즉시 `ensureInquiryFolder` + `relocateContactFiles` 로 `칼선의뢰|목형의뢰/문의-{번호}/` 서브폴더에 정리한다. 미분류 시 관리자 Notification 발행(phase 6).
2. **웹 폼 제출 (`POST /api/v1/contacts`)** — Contact 생성 + 초기 `DrawingRevision`(v1) 을 phase 3 의 `$transaction` 에서 await 로 함께 생성한다. 분류가 즉시 결정되면 트랜잭션 내에서 `ensureInquiryFolder` 를 호출해 `칼선의뢰|목형의뢰/문의-{번호}/` 에 직배치.
3. **거래처/Worker 도면 업로드** (`company-drawing`, Worker revision) — `DrawingRevision` 생성 → `ensureInquiryFolder` 로 대상 폴더 확보 → `relocateContactFiles` 로 해당 Contact 의 모든 WebhardFile 을 같은 폴더로 통합한다.
4. **관리자 수동 분류** (`inquiryType` 변경) — phase 5 훅이 위 3 과 동일하게 `ensureInquiryFolder + relocateContactFiles` 를 수행한다. 기존 미분류 파일도 그 시점에 비로소 `문의-{번호}/` 로 이동한다.

#### W.3 레거시 안내 — `registerFilesToWebhard` 단일화 (**DEPRECATED — task 20 (2026-04-22) 에서 제거됨**)

`ContactsService.registerFilesToWebhard` 는 task 20 phase 2 에서 **실제 코드에서 삭제되었다**. 과거에는 `ContactsService.create` 내부에서 fire-and-forget 으로 호출되어 폴더명을 `inquiryTitle || 문의-{contactId UUID}` 규칙으로 만들었으나, 웹폼 경로가 `$transaction` 내부에서 `ensureInquiryFolder + relocateContactFiles` 를 strict 로 호출하도록 재설계되면서 호출자가 0 개가 되어 단일화가 완료되었다. 모든 신규 업로드는 §W.1 의 `ensureInquiryFolder + buildInquiryFileName` 단일 경로를 타며, 과거 데이터 보정이 필요하면 `scripts/migrate-webhard-inquiry-folders.ts` 운영 스크립트를 사용한다.

#### W.4 과거 규칙 (참고용 보존)

> 2026-04-16 ~ 2026-04-19 까지 운영되던 과거 정책. 변경 사유는 phase 0 docs-update 참고.

- 저장 경로: `{거래처루트(company.name 기반)}/문의-{workNumber 또는 inquiryNumber}/{workNumber} {originalName}` (template 폴더 미사용, O/F 동시 보유 시 어느 한쪽만 폴더명 반영)
- WebhardFile.name 프리픽스: `{workNumber} {originalName}` (대괄호 없음, 공백 구분)
- `문의-{번호}/` 서브폴더는 `syncRevisionToWebhard` 와 `registerFilesToWebhard` 가 각자 다른 규칙(`workNumber || inquiryNumber` vs `inquiryTitle || 문의-{UUID}`) 으로 생성 → 동일 contact 라도 경로가 갈라지는 회귀가 있었다.
- 미분류 → 분류 전환 시 기존 파일 이동 로직 없음. LGU+ sync 로 업체 루트에 떨어진 파일들이 분류 후에도 루트에 그대로 남아 있었다.
- 예외 및 중복 생성 방지 규칙은 W.1 의 동명 항목으로 이전.

### D. 거래처 도면 업로드 (방법 A + B)

**방법 A**: 거래처 포탈 > 문의 상세 > "도면 업로드" 영역

- 용도 선택: 수정도면 제출(revision_submit) / 목형의뢰(mold_request) / 기타(other)
- 목형의뢰 선택 시 processStage → drawing_confirmed 자동 변경

**방법 B**: 거래처 웹하드 업로드 후 문의 연결 선택

- 업로드 완료 후 "관련 문의 있나요?" UI
- 진행 중인 문의 목록 표시 → 선택 시 연결 (purpose + companyName 포함)

> 업로드 성공 시 WebhardFile 레코드도 자동 생성된다. 저장 위치는 섹션 W 참고. 단 방법 B(이미 업로드된 WebhardFile을 연결)는 신규 생성하지 않고 기존 레코드의 `inquiryNumber`만 갱신한다.

### E. Worker 도면 업로드

Worker 포탈에서 도면 업로드 가능 (actorType: worker).

- Next.js Worker 도면 업로드 proxy는 먼저 `getErpWorkerSession()`을 검증한다.
- NestJS에는 `erp-session`/`csrf-token`만 전달하고 `admin-session`/`company-session` 등 다른 브라우저 쿠키는 전달하지 않는다. 같은 브라우저에서 관리자/업체 대시보드를 함께 사용해도 backend worker guard가 잘못된 세션을 먼저 해석하지 않도록 하기 위한 계약이다.

사유 선택: 도무송 맞춤 / 샘플 수정 / 현장 보정 / 기타

> 업로드 성공 시 WebhardFile 레코드도 자동 생성된다. 저장 위치는 섹션 W 참고.

### F. DXF 자동 매칭

Integration API: 관리프로그램이 DXF 파일을 업로드할 때 파일명에서 workNumber(YYMMDD-F-NNN) 파싱한다.

- 해당 Contact에 DrawingRevision 생성 (reason: laser_processing, source: integration, actorType: external)
- Contact.drawingFileUrl도 업데이트
- 매칭 실패 시 BadRequestException 응답

> 업로드 성공 시 WebhardFile 레코드도 자동 생성된다. 저장 위치는 섹션 W 참고.

### G. 수정요청 통합

기존 revisionRequest\* 필드의 파일 첨부 → DrawingRevision에도 등록 (reason: revision_request).

DrawingRevision 타임라인에서 수정요청 도면도 함께 표시한다.

### H. 관리자 수동 문의 연결

미매칭 Contact에 "기존 문의 연결" 버튼을 제공한다.

- 같은 업체의 활성 문의 목록 → 선택 → 도면 복사 + 원본 삭제

## 타임라인 신뢰성 보장

### Fallback 응답 (A안)

`GET /api/v1/contacts/:id/timeline` 응답이 빈 배열인 경우, 서버는 `contacts` 테이블
자체를 읽어 최소 기본 이벤트를 파생하여 응답한다. 과거 누락분(경로 누락/실패) 및
신규 실패분 모두 UI에 최소한의 정보가 노출되도록 한다.

파생 규칙:

1. `kind: 'status_change'`, `changeType: 'created'` 이벤트 1개를 `contacts.created_at`
   기준으로 생성. `actorType`/`actorName`은 `contacts.source`에 따라:
   - `source='webhard_auto'` → actorType='system', actorName='웹하드 자동생성'
   - `source='admin_manual'` → actorType='admin', actorName='관리자'
   - 기본값 → actorType='system', actorName=null
2. `contacts.drawing_file_url`이 존재하면 `kind: 'drawing_revision'`, `reason: 'initial'`,
   `version: 1` 이벤트 1개 추가. 파일명 fallback: `original_filename` →
   `drawing_file_name` → `'initial-drawing'`.
3. 두 이벤트 모두 `contacts.created_at` 기준 동일 시각.
4. **실제 DB에 한 건이라도 존재하면 fallback 비활성**: 실데이터와 파생 데이터를
   섞지 않는다.

`forCompany=true`일 때도 동일 규칙 적용하되, 기존 마스킹 정책 준수.

### 트랜잭션 보장 (C안)

`contact_status_history` / `drawing_revisions` 기록이 Contact 생성과 함께 원자적으로
보장되도록 개선한다:

- `AutoContactService.createNewContact`: Contact 생성 + `recordChange('created')` +
  `createInitialRevision`을 **단일 Prisma 트랜잭션**에서 수행. 트랜잭션 실패 시
  Contact 생성 자체를 롤백한다.
- Contact 생성 이후 발생하는 변경 이벤트(`recordChange`)는 동기 await. 실패 시
  `Sentry.captureException`으로 에러 보고 + 호출부에 throw. 조용히 warning만 남기지
  않는다.
- 외부 업로드(`createRevision`, `company-drawing`, Worker, DXF)는 개별 요청 단위
  트랜잭션(`prisma.$transaction`) 안에서 `DrawingRevision.create` + `recordChange`
  - `WebhardFile.create`(task 13 syncRevisionToWebhard)를 함께 수행.

### Fire-and-forget 금지

`.catch(err => logger.warn(...))` 또는 `.catch(() => {})` 같은 무음 삼키기 패턴
사용 금지. 어쩔 수 없이 비동기 처리가 필요하면 Inngest 재시도 큐를 사용.

## 매칭 전략 (2단계)

1. 문의번호 파싱 (YYMMDD-O/F-NNN) → 직접 매칭 (100% 안전)
2. fallback: 새 Contact 생성 + 관리자 알림 (수동 연결 대기)

파일명 유사도/단독 문의 추측 매칭은 하지 않는다 (오매칭 방지).

## 새 API 엔드포인트

| Method | Path                                              | Auth    | Description                |
| ------ | ------------------------------------------------- | ------- | -------------------------- |
| GET    | /api/v1/contacts/:id/latest-drawing               | API Key | 현재 단계 기준 최신 도면   |
| POST   | /api/v1/contacts/:id/company-drawing              | Company | 거래처 도면 업로드         |
| POST   | /api/v1/contacts/:id/link-webhard-file            | Company | 웹하드 파일 → 문의 연결    |
| POST   | /api/v1/contacts/:id/merge-drawing-from/:sourceId | Admin   | 수동 문의 연결 (도면 이동) |
| POST   | /api/v1/integration/dxf-match/upload              | API Key | DXF 파일명 기반 자동 매칭  |

## 접근 권한

| 역할    | 통합 타임라인 조회                                               | 도면 업로드     | 문의 연결       | 수동 연결 |
| ------- | ---------------------------------------------------------------- | --------------- | --------------- | --------- |
| admin   | 모든 이력 + 모든 status_change                                   | O               | -               | O         |
| worker  | 모든 이력 (조회만)                                               | O (사유 선택)   | -               | X         |
| company | 서버 필터로 isPublic=true drawing_revision만 + admin 메타 마스킹 | O (자기 문의만) | O (자기 문의만) | X         |

## 데이터 모델 변경

### DrawingRevision 테이블 변경

기존 `drawing_revisions` 테이블을 그대로 사용한다. 변경 사항:

- reason enum에 `revision_request` 추가 (거래처 수정요청 도면 제출)
- actor_type에 `company` 추가 (거래처 업로드)
- 거래처/Worker 업로드 시 source는 기존 `manual` 사용
- **`webhardFileIds String[]` 컬럼 추가** — DrawingRevision↔WebhardFile 링크. 자동 생성된 WebhardFile의 ID 목록을 보관하여 타임라인 다운로드 시 R2 키 조회에 사용. Prisma 마이그레이션 이름: `drawing_revisions_webhard_link`

### WebhardFile 테이블 변경 없음

기존 `webhard_files.name` 필드에 프리픽스를 추가하는 방식으로 처리한다. `originalName` 필드는 이미 존재하며 중복 체크에 사용. 자동 생성 시 `inquiryNumber`/`companyId` 필드는 서버에서 채운다 (섹션 W 참고).

## API 상세

### GET /api/v1/contacts/:id/latest-drawing

현재 processStage 기준으로 최신 DrawingRevision을 반환한다. 해당 단계에 도면이 없으면 이전 단계 순서대로 fallback 탐색한다.

**Response (200):**

```json
{
  "drawing": {
    "id": "uuid",
    "contactId": "uuid",
    "version": 3,
    "processStage": "drawing",
    "reason": "domuson_fit",
    "reasonDetail": null,
    "files": [
      { "url": "...", "name": "도면_v3.dxf", "size": 102400, "mimeType": "application/dxf" }
    ],
    "actorType": "admin",
    "actorName": "관리자",
    "source": "manual",
    "isPublic": false,
    "note": null,
    "createdAt": "2026-04-13T10:00:00.000Z"
  }
}
```

**Response (200, 도면 없음):** `{ "drawing": null }`

### POST /api/v1/contacts/:id/company-drawing

거래처가 도면을 업로드한다. CompanyAccessGuard 인증 필요.

**Request Body:**

| 필드        | 타입     | Required | 설명                                                      |
| ----------- | -------- | -------- | --------------------------------------------------------- |
| purpose     | string   | Y        | revision_submit / mold_request / other                    |
| files       | object[] | Y        | [{ url, name, size, mimeType }] (presigned upload 후 URL) |
| note        | string   | N        | 메모                                                      |
| companyName | string   | Y        | 업체명 (admin은 DTO 값, company는 세션에서 파생)          |

**동작:**

- purpose=mold_request일 때 processStage → drawing_confirmed 자동 변경
- DrawingRevision 생성: actorType=company, source=manual
- reason 매핑: revision_submit → revision_request, mold_request → field_correction, other → other
- Contact.drawingFileUrl도 첫 번째 파일로 업데이트

**Response (201):** 생성된 DrawingRevision 객체

### POST /api/v1/contacts/:id/link-webhard-file

거래처가 웹하드 파일을 기존 문의에 연결한다. CompanyAccessGuard 인증 필요.

**Request Body:**

| 필드        | 타입   | Required | 설명                                   |
| ----------- | ------ | -------- | -------------------------------------- |
| fileId      | string | Y        | WebhardFile ID                         |
| purpose     | string | Y        | revision_submit / mold_request / other |
| companyName | string | Y        | 업체명                                 |

**동작:**

- company-drawing과 동일한 reason 매핑 및 processStage 변경 로직 적용
- WebhardFile.inquiryNumber 업데이트 (연결 표시)

**Response (201):** 생성된 DrawingRevision 객체

### POST /api/v1/contacts/:id/merge-drawing-from/:sourceId

관리자가 sourceId 문의의 도면을 :id 문의로 이동한다.

**동작:**

- sourceId의 DrawingRevision들을 :id로 복사 (version 재계산)
- sourceId의 drawingFileUrl도 :id에 병합
- sourceId를 soft-delete 처리

**Response (200):**

```json
{
  "mergedRevisionCount": 2,
  "sourceDeleted": true
}
```

### POST /api/v1/integration/dxf-match/upload

관리프로그램이 DXF 파일명에서 workNumber를 파싱하여 자동 매칭한다.

**Request Body:**

| 필드      | 타입   | Required | 설명                                                |
| --------- | ------ | -------- | --------------------------------------------------- |
| fileName  | string | Y        | DXF 파일명 (앞부분에서 YYMMDD-F-NNN 패턴 자동 파싱) |
| fileUrl   | string | Y        | 업로드된 파일 URL                                   |
| actorName | string | N        | 프로그램/사용자명 (기본값: "관리프로그램")          |

**동작:**

1. fileName에서 workNumber(YYMMDD-F-NNN) 정규식 파싱
2. Contact.workNumber로 매칭 (soft-deleted 제외)
3. 매칭 성공 → DrawingRevision 생성 (reason: laser_processing, source: integration, actorType: external)
4. Contact.drawingFileUrl 업데이트
5. 매칭 실패 → BadRequestException

**Response (200):**

```json
{
  "matched": true,
  "contactId": "uuid",
  "workNumber": "260413-F-001",
  "revisionVersion": 4
}
```

**에러 (400):**

```json
{
  "matched": false,
  "workNumber": "260413-F-001",
  "error": "해당 workNumber의 문의를 찾을 수 없습니다"
}
```

## 완료 기준

1. [x] reason enum에 revision_request 추가 (DTO + 서비스 검증)
2. [x] GET /contacts/:id/latest-drawing 구현
3. [x] POST /contacts/:id/company-drawing 구현
4. [x] POST /contacts/:id/link-webhard-file 구현
5. [x] POST /contacts/:id/merge-drawing-from/:sourceId 구현
6. [x] POST /integration/dxf-match/upload 구현
7. [x] 웹하드 자동 문의 생성 시 파일명 프리픽스 추가
8. [x] 도면 타임라인 UI (processStage별 그룹핑)
9. [x] 관리자 최신 도면 원클릭 다운로드 UI
10. [x] 거래처 포탈 도면 업로드 UI (방법 A + B)
11. [x] Worker 포탈 도면 업로드 UI
12. [x] 수정요청 도면 DrawingRevision 통합
13. [x] 관리자 수동 문의 연결 UI
14. [x] tsc --noEmit 통과
15. [x] pnpm lint 통과
