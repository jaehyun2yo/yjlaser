# Phase 0: docs-update

## 사전 준비

아래 문서들을 반드시 읽고 task 19 이후 현행 규칙과 이번 task 가 바꿀 부분을 정확히 이해하라:

- `tasks/20-webhard-folder-policy-unify/index.json` — 이번 task 의 6 phase 구조, 확정 정책 7 차원, 구조 변경 요약.
- `docs/specs/features/drawing-workflow.md` §W.1 — task 19 에서 확정된 현 규칙: `{업체}/문의-{O}/` (업체 루트 직하). 이 phase 가 **중간 "문의" 폴더 삽입** 구조로 재작성한다.
- `docs/specs/features/drawing-workflow.md` §W.3 — 현재 "레거시 안내 — `registerFilesToWebhard` 단일화 예정" 으로 deprecated 예정 표기. 이번 task 에서 실제로 제거됨을 반영.
- `docs/specs/features/drawing-workflow.md` §W.2, §W.4 — task 18, 이전 규칙 아카이브. **절대 건드리지 않음** — 추적 가능성 보존.
- `docs/followups/19-webhard-folder-policy-status.md` — §3.3 "template 폴더 누적 파일 자동 분류 검증" 이 이번 task 의 Phase 3 에서 해결됨.
- `docs/changelog/CHANGELOG.md` — `[Unreleased]` 블록에 이번 task skeleton 엔트리 추가 (본문은 phase 5).
- `webhard-api/src/folders/folders.service.ts` — 현재 `ensureInquiryFolder` 가 parent 로 rootFolder.id 를 사용. phase 1 에서 중간 "문의" 폴더로 교체됨을 문서에 반영.
- `webhard-api/src/contacts/contacts.service.ts` — 현재 `create` 내부에서 `registerFilesToWebhard` fire-and-forget 호출. phase 2 에서 제거됨을 문서에 반영.
- `webhard-api/src/integration/orders/auto-contact.service.ts` — 현재 `createNewContact` 가 폴더 이동 훅 없음. phase 3 에서 추가됨을 문서에 반영.

이유: phase 0 는 문서만 바꾸지만, 각 phase 가 뒤집을 로직의 현행을 정확히 알아야 "변경 전/후" 를 문서에 명확히 쓸 수 있다.

## 작업 내용

### 1. `docs/specs/features/drawing-workflow.md` §W.1 저장 구조 재작성

§W.1 의 기존 "저장 구조" 블록을 아래로 교체:

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

### 2. §W.1 불변 규칙 갱신

기존 불변 규칙 목록에 아래 3 가지를 추가·수정:

- 문의 폴더의 `parentId` 는 **업체 루트 하위 `문의/` 폴더** 를 가리킨다 (task 19 규칙 "업체 루트 직하" 에서 변경).
- `ensureInquiryRootFolder(companyId, tx?)` 가 업체별 `문의` 폴더를 lazy 보장한다 (`folderKind='template'`, `name='문의'`). `initializeCompanyFolders` 의 `DEFAULT_FOLDER_TEMPLATE` 에도 `문의` 가 포함되어 신규 업체는 eager 생성, 기존 업체는 lazy 대응.
- 납품 완료 시 `완료/` 폴더의 `parentId` 는 여전히 업체 루트 직하 (중간 `문의/` 아님). `moveInquiryFolderToCompleted` 의 reparent 대상은 업체 루트 하위 `완료/` 로 유지 — 로직 변경 없음.

### 3. §W.1 "Contact 생성 경로별 폴더 동작" 신규 섹션 추가

§W.1 내 sub-section 으로 아래 표를 추가:

| #   | 경로             | 트리거                            | inquiryType 확정       | 폴더 생성 동작                                                                |
| --- | ---------------- | --------------------------------- | ---------------------- | ----------------------------------------------------------------------------- |
| 1   | 웹폼             | `POST /api/v1/contacts`           | create 호출 시 DTO 로  | 트랜잭션 내부 `ensureInquiryFolder + relocateContactFiles` (strict)           |
| 2   | 웹하드 단건 감지 | `confirmUpload` → `autoContact`   | 폴더 경로 탐색         | 확정 시만 `ensureInquiryFolder + relocateContactFiles`, 미분류는 원위치 유지  |
| 3   | 웹하드 배치 감지 | `batchConfirmUpload`              | 동일                   | 동일 (공통 경로)                                                              |
| 4   | 관리프로그램 DXF | `POST /integration/contacts/auto` | 항상 mold_request 고정 | [task 21 범위] — 현재 폴더 연결 없음 유지                                     |
| 5   | 문의 분할        | `POST /contacts/:id/split`        | 부모에서 복사          | 자식별 `ensureInquiryFolder(childId)` 호출, 폴더명 `문의-{O}-{i}` (독립 동급) |

미분류 Contact (`inquiryType=null`) 는 **폴더 생성하지 않음**. 원본 파일은 업체 루트 또는 template 에 유지.

### 4. §W.3 레거시 "task 20 에서 제거됨" 표기 강화

§W.3 헤더 줄에 "**DEPRECATED — task 20 (2026-04-22) 에서 제거됨**" 명시. 본문에 `registerFilesToWebhard` 가 실제 코드에서 삭제되었음을 추가.

### 5. `docs/followups/19-webhard-folder-policy-status.md` 갱신

- §3.3 항목 상단에 "**✅ task 20 (2026-04-22) Phase 3 auto-contact-path 에서 해결 예정**" 표기 추가 (phase 5 에서 "해결됨" 으로 확정).
- 다른 후보 (§3.1, §3.2, §3.4, §3.5, §3.6, §3.7) 는 건드리지 않는다 — 이번 task 범위 아님.

### 6. `docs/changelog/CHANGELOG.md` skeleton 추가

`[Unreleased]` 블록 아래에 헤더만 추가:

```
### 2026-04-22 — webhard-folder-policy-unify (task 20)

Phase 5 에서 내용 기입.
```

### 7. docs-diff 자동 생성

`scripts/run-phases.py` 가 phase 0 완료 직후 `scripts/gen-docs-diff.py` 를 실행하여 `tasks/20-webhard-folder-policy-unify/docs-diff.md` 를 자동 생성한다. 수동 작성 금지.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

문서만 수정 — 코드 영향 없음. 통과 시 OK.

## AC 검증 방법

위 커맨드 통과 시 `tasks/20-webhard-folder-policy-unify/index.json` 의 phase 0 status 를 `"completed"` 로 변경. 3 회 실패 시 `"error"` + `"error_message"` 필드로 기록.

## 주의사항

- §W.2 (task 18 과거 규칙) 와 §W.4 (이전 규칙) 는 **삭제 금지** — 추적 가능성 보존.
- §W.1 의 기존 task 19 규칙을 별도 섹션으로 아카이브하지 말고, §W.1 내에서 "**2026-04-22 업데이트 — 중간 `문의/` 폴더 삽입**" 같은 한 줄 주석으로 변경 이력만 남긴다 (아카이브 이유: task 19 규칙은 사용자가 프로덕션에 적용한 적 없으므로 이력 보존 불필요).
- code 변경 금지. Phase 0 는 docs only.
- followups §3.3 외 다른 후보 (§3.1, §3.4 등) 건드리지 않는다.
- CHANGELOG `[Unreleased]` 의 다른 task 엔트리 건드리지 않는다.
- `docs/specs/api/nestjs-endpoints.md`, `docs/specs/db/prisma-tables.md` 는 이번 phase 에서 수정 불필요 — `WebhardFolder` 스키마·API 응답 타입 변경 없음. phase 5 에서 "Side Effects" 명시가 필요하면 그때 갱신.
