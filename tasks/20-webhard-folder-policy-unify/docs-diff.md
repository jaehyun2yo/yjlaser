# docs-diff: webhard-folder-policy-unify

Baseline: `491e4f7`

## `docs/changelog/CHANGELOG.md`

```diff
diff --git a/docs/changelog/CHANGELOG.md b/docs/changelog/CHANGELOG.md
index 92c6cd05..de6abfba 100644
--- a/docs/changelog/CHANGELOG.md
+++ b/docs/changelog/CHANGELOG.md
@@ -2,6 +2,10 @@

 ## [Unreleased]

+### 2026-04-22 — webhard-folder-policy-unify (task 20)
+
+Phase 5 에서 내용 기입.
+
 ### 2026-04-21 — worker-drawing-upload (task 19)

 **Worker 도면 업로드 UX 개선 + 웹하드 폴더 정책 재설계**
```

## `docs/followups/19-webhard-folder-policy-status.md`

```diff
diff --git a/docs/followups/19-webhard-folder-policy-status.md b/docs/followups/19-webhard-folder-policy-status.md
index 4a8d98d1..03203b92 100644
--- a/docs/followups/19-webhard-folder-policy-status.md
+++ b/docs/followups/19-webhard-folder-policy-status.md
@@ -95,6 +95,8 @@

 ### 3.3 template 폴더 누적 파일 자동 분류

+**✅ task 20 (2026-04-22) Phase 3 auto-contact-path 에서 해결 예정**
+
 거래처가 `칼선의뢰` / `목형의뢰` template 에 직접 업로드한 파일이 `triggerAutoContact` → `문의-{번호}/` 로 이동하는 로직이 **실제 동작하는지** 재확인.

 - `auto-contact.service.ts:classifyByFolderPath` + `folders.service.ts:ensureInquiryFolder` 연결 검증.
```

## `docs/specs/features/drawing-workflow.md`

```diff
diff --git a/docs/specs/features/drawing-workflow.md b/docs/specs/features/drawing-workflow.md
index e5ba946a..5520d055 100644
--- a/docs/specs/features/drawing-workflow.md
+++ b/docs/specs/features/drawing-workflow.md
@@ -43,26 +43,29 @@ WebhardFile 자동 생성 / 분류 시점 rename 시, WebhardFile.name 앞에

 전 업로드 경로(LGU+ sync, 웹폼, 거래처 포탈, Worker, DXF 자동 매칭, 관리자 수동, stage_change, 관리자 분류)에서 WebhardFile 은 항상 `{거래처루트}/문의-{inquiryFolderName}/` 하위(납품 완료 시 `{거래처루트}/완료/문의-{inquiryFolderName}/`)에 정착한다. 신규 업로드뿐 아니라 **기존 미분류 파일도 분류 시점에 동일 경로로 자동 이동**한다.

-#### W.1 불변 규칙 (task 19 규칙 — 현행)
+#### W.1 불변 규칙 (현행)
+
+> 2026-04-22 업데이트 — 중간 `문의/` 폴더 삽입 (task 20 webhard-folder-policy-unify). 기존 task 19 의 "업체 루트 직하" 규칙은 사용자가 프로덕션에 적용한 적 없어 본 문서 내에서 바로 교체한다.

 **저장 구조:**

```

{업체명 루트폴더}/
-├── 칼선의뢰/ ← 기존 template. 업체가 원본 도면 직접 업로드 시 구분용 (삭제·이동 금지)
-├── 목형의뢰/ ← 동일
-├── 문의-{O}/ ← Contact 분류 확정 시 자동 생성 (folderKind='inquiry')
-│ ├── [O] 원본.DXF
-│ └── [O] rev2.DXF
-├── 문의-{O}\_{F}/ ← F 번호 추가 발급 시 위 폴더가 rename 된 결과
-└── 완료/ ← 납품 완료 문의 이관 대상 (folderKind='template', lazy 생성)

-     └── 문의-{O}_{F}/
  +├── 칼선의뢰/ ← 기존 template. 거래처 원본 업로드 수신용 (삭제·이동 금지)
  +├── 목형의뢰/ ← 동일
  +├── 문의/ ← [NEW] 중간 루트 (folderKind='template')
  +│ ├── 문의-{O}/ ← 분류 확정 Contact
  +│ ├── 문의-{O}\_{F}/ ← F 번호 추가 발급 후 rename 결과
  +│ └── 문의-{O}-1/ ← 분할 Contact (독립 동급)
  +└── 완료/ ← 납품 완료 이관 (folderKind='template', lazy 생성)

* └── 문의-{O}\_{F}/

```

**불변 규칙:**

- 문의 폴더는 `ensureInquiryFolder(contactId, tx?)` 가 단일 진입점으로 생성·재사용한다. `contactId` 당 1 개. inquiryType 에 따른 template 분기는 **폐기** — task 18 의 `ensureInquiryFolder`(`folders.service.ts:1289`) 가 `inquiryType` null 시 폴더를 만들지 않고 null 을 반환하던 분기 조건은 phase 1 에서 제거된다. `tx` 인자는 호출자가 $transaction 을 확장할 때만 넘기고, 평상시에는 생략한다.
-- 문의 폴더의 `parentId` 는 업체 루트 폴더(또는 납품 완료 시 루트 하위 `완료/`) 를 직접 가리킨다. template 폴더(`칼선의뢰` / `목형의뢰`) 경유 없음.
+- 문의 폴더의 `parentId` 는 **업체 루트 하위 `문의/` 폴더** 를 가리킨다 (task 19 규칙 "업체 루트 직하" 에서 변경). `ensureInquiryRootFolder(companyId, tx?)` 가 업체별 `문의` 폴더를 lazy 보장한다 (`folderKind='template'`, `name='문의'`). `initializeCompanyFolders` 의 `DEFAULT_FOLDER_TEMPLATE` 에도 `문의` 가 포함되어 신규 업체는 eager 생성, 기존 업체는 lazy 대응.
+- 납품 완료 시 `완료/` 폴더의 `parentId` 는 여전히 업체 루트 직하 (중간 `문의/` 아님). `moveInquiryFolderToCompleted` 의 reparent 대상은 업체 루트 하위 `완료/` 로 유지 — 로직 변경 없음.
- O 만 있을 때: 폴더명 `문의-{inquiryNumber}`. O + F 공존: `문의-{inquiryNumber}_{workNumber}` (공통 유틸 `buildInquiryFolderName` 재사용, phase 1 규칙 그대로).
- 파일명 규칙(`[{대표번호}] {originalName}`) 은 공통 유틸 `buildInquiryFileName` 을 그대로 사용 — 변경 없음. 상세 규칙은 §W.2 파일명 규칙 항목 참조.
- F 번호 추가 발급 시점에 전용 헬퍼 `renameInquiryFolderForContact(contactId, tx?)` 로 기존 폴더를 **rename** 한다. 호출처: `ContactsService.updateStatus`(production 전환), `updateProcessStage`(workNumber 신규 발번 분기), `updateInquiryType`(workNumber 신규 발번 분기) — 세 경로 모두 `$transaction` 내부에서 workNumber 를 발번한 뒤 `ensureInquiryFolder` + `relocateContactFiles` 호출 직전에 실행된다. DB `WebhardFolder.name` / `path` / `inquiry_number` / `work_number` 만 갱신, `WebhardFolder.id` 와 `WebhardFile.path`(R2 object key) 는 **유지** — 이미 발급된 presigned URL 도 계속 유효.
@@ -71,6 +74,18 @@ WebhardFile 자동 생성 / 분류 시점 rename 시, WebhardFile.name 앞에
- 기존 template (`칼선의뢰` / `목형의뢰`) 폴더는 **절대 삭제·이동하지 않는다**. 거래처가 직접 웹하드에 업로드한 원본 도면의 수신 경로로 계속 사용. 이 두 폴더는 `foldersService.initializeCompanyFolders`(`folders.service.ts:526`) + `DEFAULT_FOLDER_TEMPLATE`(`folders.service.ts:474`) 로 업체 초기화 시 자동 생성되며 `folderKind='template'` 로 계속 보장된다.
- **중복 생성 방지**: `POST /contacts/:id/link-webhard-file` 은 이미 존재하는 WebhardFile 을 재사용 — 신규 생성하지 않고 `inquiryNumber` + `folderId` 만 갱신. `createInitialRevision`(source === 'auto_initial') 도 `ContactsService.registerFilesToWebhard` 가 이미 등록하므로 `DrawingRevision.createRevision` 경로에서는 skip.

+**Contact 생성 경로별 폴더 동작:**
+
+| #   | 경로             | 트리거                            | inquiryType 확정       | 폴더 생성 동작                                                                |
+| --- | ---------------- | --------------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
+| 1   | 웹폼             | `POST /api/v1/contacts`           | create 호출 시 DTO 로  | 트랜잭션 내부 `ensureInquiryFolder + relocateContactFiles` (strict)           |
+| 2   | 웹하드 단건 감지 | `confirmUpload` → `autoContact`   | 폴더 경로 탐색         | 확정 시만 `ensureInquiryFolder + relocateContactFiles`, 미분류는 원위치 유지  |
+| 3   | 웹하드 배치 감지 | `batchConfirmUpload`              | 동일                   | 동일 (공통 경로)                                                              |
+| 4   | 관리프로그램 DXF | `POST /integration/contacts/auto` | 항상 mold_request 고정 | [task 21 범위] — 현재 폴더 연결 없음 유지                                     |
+| 5   | 문의 분할        | `POST /contacts/:id/split`        | 부모에서 복사          | 자식별 `ensureInquiryFolder(childId)` 호출, 폴더명 `문의-{O}-{i}` (독립 동급) |
+
+미분류 Contact (`inquiryType=null`) 는 **폴더 생성하지 않음**. 원본 파일은 업체 루트 또는 template 에 유지.
+
**WebhardFile 필드:**

- `name`: `[{대표번호}] {originalName}` (`buildInquiryFileName`, phase 1)
@@ -150,9 +165,9 @@ WebhardFile 자동 생성 / 분류 시점 rename 시, WebhardFile.name 앞에
3. **거래처/Worker 도면 업로드** (`company-drawing`, Worker revision) — `DrawingRevision` 생성 → `ensureInquiryFolder` 로 대상 폴더 확보 → `relocateContactFiles` 로 해당 Contact 의 모든 WebhardFile 을 같은 폴더로 통합한다.
4. **관리자 수동 분류** (`inquiryType` 변경) — phase 5 훅이 위 3 과 동일하게 `ensureInquiryFolder + relocateContactFiles` 를 수행한다. 기존 미분류 파일도 그 시점에 비로소 `문의-{번호}/` 로 이동한다.

-#### W.3 레거시 안내 — `registerFilesToWebhard` 단일화 예정
+#### W.3 레거시 안내 — `registerFilesToWebhard` 단일화 (**DEPRECATED — task 20 (2026-04-22) 에서 제거됨**)

-현재 `ContactsService.registerFilesToWebhard`(`contacts.service.ts:2661~`) 는 폴더명을 `inquiryTitle || 문의-{contactId UUID}` 규칙으로 만든다. 이 규칙은 phase 4 이후 **폐기 예정**이며, 별도 RFC 로 `registerFilesToWebhard` 와 `syncRevisionToWebhard` 를 단일 경로(`ensureInquiryFolder + buildInquiryFileName`) 로 통합한다. 그 전까지는 신규 업로드는 새 규칙, 과거 데이터는 phase 7 의 `migrate-webhard-inquiry-folders.ts` 운영 스크립트로 일괄 정리한다.
+`ContactsService.registerFilesToWebhard` 는 task 20 phase 2 에서 **실제 코드에서 삭제되었다**. 과거에는 `ContactsService.create` 내부에서 fire-and-forget 으로 호출되어 폴더명을 `inquiryTitle || 문의-{contactId UUID}` 규칙으로 만들었으나, 웹폼 경로가 `$transaction` 내부에서 `ensureInquiryFolder + relocateContactFiles` 를 strict 로 호출하도록 재설계되면서 호출자가 0 개가 되어 단일화가 완료되었다. 모든 신규 업로드는 §W.1 의 `ensureInquiryFolder + buildInquiryFileName` 단일 경로를 타며, 과거 데이터 보정이 필요하면 `scripts/migrate-webhard-inquiry-folders.ts` 운영 스크립트를 사용한다.

#### W.4 과거 규칙 (참고용 보존)

```
