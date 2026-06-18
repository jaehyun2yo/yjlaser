# Phase 0: docs-update

## 사전 준비

먼저 아래 문서를 반드시 읽어 현재 설계 의도와 실제 운영의 괴리를 이해하라:

- `docs/specs/features/drawing-workflow.md` — 현 §W "웹하드 자동 저장" 의 폴더 규칙이 실제 운영(LGU+ sync path가 주경로, `문의-{번호}/` 서브폴더가 거의 생성되지 않고 민컴 루트에 파일이 직접 쌓임)과 다름. 이 phase 에서 §W 를 **현실 반영으로 전면 재작성** 한다.
- `docs/specs/features/drawing-revision-history.md` — §"WebhardFile 자동 생성 규칙" 에서 prefix 포맷과 폴더 규칙 언급 부분을 신규 공통 유틸(`buildInquiryFileName`, `buildInquiryFolderName`) 기반으로 갱신.
- `docs/specs/db/prisma-tables.md` — `webhard_folders` 섹션에 phase 2 에서 추가될 4 컬럼(`inquiry_number`, `work_number`, `contact_id`, `folder_kind`) 문서화.
- `docs/거래처-웹하드-폴더-안내.md` — 거래처 대상 안내 문서. 거래처가 루트에 올린 파일도 관리자 분류 후 자동 정리된다는 설명을 꼬리에 추가.
- `docs/changelog/CHANGELOG.md` — `[Unreleased]` 블록에 이번 task skeleton 엔트리만 추가 (최종 문구는 phase 9).
- `tasks/18-drawing-consistency/index.json` — 이번 task 의 전체 의도·phase 구조 확인.
- `webhard-api/src/contacts/drawing-revision.service.ts:391~469` — 현재 `syncRevisionToWebhard` 의 서브폴더 생성 로직 (skipInitial 분기 + workNumber 기반 subFolderName). 이 phase 는 **문서 수정만** 하지만, 문서가 반영할 실제 로직을 정확히 이해해야 한다.
- `webhard-api/src/contacts/contacts.service.ts:2661~` — `registerFilesToWebhard` 의 현재 `inquiryTitle || 문의-{contactId UUID}` 규칙. 이 규칙이 phase 4~7 에서 폐기되고 공통 유틸 기반으로 통일됨을 문서화.
- `webhard-api/src/integration/orders/auto-contact.service.ts:382~409` — `updateFileNamePrefix` 의 현재 "공백 구분, workNumber 우선" 로직. 이 역시 공통 유틸로 통일됨을 문서화.
- `webhard-api/src/folders/folders.service.ts:468~583` — `DEFAULT_FOLDER_TEMPLATE`(목형의뢰/칼선의뢰) 및 `initializeCompanyFolders`. 이 템플릿 이름은 그대로 유지한다.

이유: phase 0 는 문서만 다루지만, 다른 phase 의 "변경 전/후" 상태를 문서로 명확히 기술하려면 실제 로직의 현행을 정확히 알아야 한다.

## 작업 내용

### 1. `docs/specs/features/drawing-workflow.md` §W 재작성

기존 §W 를 대체하여 아래 골자를 반영한다:

- **저장 구조(새 규칙)**: `{업체명 루트폴더}/{분류 template폴더: 칼선의뢰|목형의뢰}/문의-{inquiryFolderName}/{파일}`
  - `inquiryFolderName` 규칙 (phase 1 `buildInquiryFolderName` 유틸):
    - O 만 발급: `260417-O-002`
    - F 만 발급: `260420-F-004`
    - 둘 다 발급: `260417-O-002_260420-F-004` (O 먼저, F 나중 고정 순서)
    - 분할 문의 suffix `-N` 는 번호 자체에 이미 포함되어 있으므로 그대로 사용
- **파일명 규칙(새 규칙)**: `[{대표번호}] {원본명}`
  - 대표번호 선택 우선순위: `revision.processStage` → `contact.processStage` → `contact.inquiryType` 기반 fallback
  - FIELD_STAGES(`drawing_confirmed`, `laser`, `cutting`, `creasing`, `delivery`) → workNumber 우선
  - OFFICE_STAGES(`drawing`, `sample`, null) → inquiryNumber 우선
  - `cutting_request` → O, `mold_request`/`laser_cutting` → F (inquiryType fallback)
- **유입 경로별 동작 요약**:
  1. LGU+ sync (주경로): Electron 앱이 LGU+ 원본 경로(`올리기전용/{업체}/...`)를 자체 웹하드로 미러링. 이 시점엔 업체 루트 혹은 거래처 안내 서브폴더(`목형의뢰`/`칼선의뢰`)에 파일이 떨어짐. `triggerAutoContact` 가 `classifyByFolderPath` 로 분류하면 `문의-{번호}/` 서브폴더로 **자동 이동**(phase 5 훅). 미분류 시 관리자 Notification 발행(phase 6).
  2. 웹 폼 제출 (`POST /api/v1/contacts`): Contact 생성 + 초기 DrawingRevision(v1) 트랜잭션(phase 3) + 분류 즉시 시행 시 `ensureInquiryFolder` 호출 → `칼선의뢰|목형의뢰/문의-{번호}/` 로 직배치.
  3. 거래처/Worker 도면 업로드 (`company-drawing`, Worker revision): DrawingRevision 생성 → `ensureInquiryFolder` 로 대상 폴더 확보 → `relocateContactFiles` 로 해당 Contact 의 모든 WebhardFile 을 같은 폴더로 통합.
  4. 관리자 수동 분류 (`inquiryType` 변경): phase 5 훅이 동일한 `ensureInquiryFolder + relocateContactFiles` 수행.
- **Rename 시점**: O 만 있던 문의에 F 가 추가 발급되는 순간(`contacts.service.ts:873~889` processStage 전환, `:1089~1107` inquiryType 변경, `:732~733` status=production) 단 1회 rename. `folderId` 는 유지.
- **R2 key 정책**: 폴더 이동 시 R2 object key 는 **유지**(메타 `folderId`/`path` 만 변경). 이미 발급된 presigned URL 도 계속 유효.
- **`registerFilesToWebhard` 레거시 안내**: `{inquiryTitle || 문의-{UUID}}` 규칙은 **폐기 예정**(phase 4 이후 `ensureInquiryFolder` 로 통일). 별도 RFC 로 `registerFilesToWebhard` 와 `syncRevisionToWebhard` 의 단일화가 진행됨을 병기.

문서 어투는 기존 §W 스타일 유지. 불변 규칙은 새 섹션 "§W.1 불변 규칙" 으로 묶고, 역사적 맥락은 "§W.2 과거 규칙" 으로 이동.

### 2. `docs/specs/features/drawing-revision-history.md` 업데이트

- §"WebhardFile 자동 생성 규칙" (또는 해당 섹션) 에서 "저장 위치" 표의 `name` 컬럼 공식을 `buildInquiryFileName({contact, revision, originalName: file.name})` 호출로 대체한다고 명시. 괄호 포맷 예시: `[260420-F-004] 원본명.DXF`.
- "최신 도면 다운로드 API" 서브섹션 (task 17 에서 추가됨) 끝부분에 한 줄: "파일명은 `buildInquiryFileName` 공통 유틸을 사용해 `/drawing-revisions/:id/download` 와 동일한 포맷을 보장한다."
- reason `initial` 관련 서술에 "문의 생성은 이제 `ContactsService.createContact` 에서도 `$transaction` 내 await 로 `createInitialRevision` 을 호출한다(phase 3). 실패 시 Contact 생성 자체 롤백." 문장 추가.

### 3. `docs/specs/db/prisma-tables.md` — `webhard_folders` 섹션 수정

아래 4 컬럼을 표에 추가 (phase 2 가 실제 마이그레이션 실행):

| Column           | Type        | Notes                                                                 |
| ---------------- | ----------- | --------------------------------------------------------------------- |
| `inquiry_number` | VarChar?    | `문의-{번호}` 폴더에 기록. `folderKind='inquiry'` 일 때만 채워짐      |
| `work_number`    | VarChar?    | 위와 동일. O + F 공존 시 양쪽 모두 기록                               |
| `contact_id`     | UUID?       | `Contact` FK 느슨 연결. `ensureInquiryFolder` 에서 findFirst 키       |
| `folder_kind`    | VarChar(20) | `root` / `template` / `inquiry` / `generic` 중 하나. 기본값 `generic` |

인덱스: `(contact_id)` 추가.

### 4. `docs/거래처-웹하드-폴더-안내.md` 꼬리 추가

기존 "폴더가 없는 경우 업체 폴더에 직접 올려주시면 됩니다" 문구 뒤에 **"관리자 분류 후 자동으로 `칼선의뢰` 또는 `목형의뢰` 하위의 `문의-{번호}` 폴더로 정리됩니다."** 한 줄 추가.

### 5. `docs/changelog/CHANGELOG.md` skeleton

`[Unreleased]` 블록 아래에 헤더만 추가:

```
### 2026-04-20 — drawing-consistency (task 18)

Phase 9 에서 내용 기입.
```

### 6. docs-diff 자동 생성

`scripts/run-phases.py` 가 phase 0 완료 직후 `scripts/gen-docs-diff.py` 를 실행하여 `tasks/18-drawing-consistency/docs-diff.md` 를 자동 생성한다. 수동 작성 금지.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

문서만 수정하므로 타입/빌드 영향 없음. 통과 시 OK.

## AC 검증 방법

위 커맨드 실행 후 통과하면 `tasks/18-drawing-consistency/index.json` 의 phase 0 status 를 `"completed"` 로 변경. 3회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- 이 phase 는 **문서만** 수정. 코드 변경 금지.
- `drawing-workflow.md` §W 의 과거 규칙을 통째로 삭제하지 말고 "§W.2 과거 규칙" 섹션으로 이동하여 보존 (왜 바뀌었는지 추적 가능하게).
- Prisma 스키마 자체는 phase 2 에서 수정. 여기서는 **문서에만** 새 컬럼을 기술.
- 마이그레이션 절차(phase 7 의 `migrate-webhard-inquiry-folders.ts`) 는 spec 본문이 아닌 "운영 가이드" 로 간단히만 언급.
- CHANGELOG 는 skeleton 까지. 상세 변경사항은 phase 9.
- 기존 `docs/거래처-웹하드-폴더-안내.md` 의 "칼선의뢰/목형의뢰 폴더에 직접 올려주시면 자동 접수됩니다" 문구는 유지 (거래처 안내 원칙은 불변).
