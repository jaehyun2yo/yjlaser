# Phase 4: docs-sync-changelog

## 사전 준비

먼저 아래를 **모두** 확인하라:

- `tasks/21-webhard-inquiry-folder-gap-fix/` 하위 전체:
  - `phase0.md` ~ `phase3.md` (실행 프롬프트)
  - `phase0-output.json` ~ `phase3-output.json` (실제 실행 결과)
  - `docs-diff.md` (Phase 0 docs 변경 자동 기록)
- **Phase 1~3 에서 실제 수정된 코드 파일** (반드시 `git diff master..HEAD -- webhard-api/` 로 확인):
  - `webhard-api/src/folders/folders.service.ts`
  - `webhard-api/src/folders/folders.service.spec.ts`
  - `webhard-api/src/folders/_lib/company-name-match.util.ts` (신규)
  - `webhard-api/src/folders/_lib/company-name-match.util.spec.ts` (신규)
  - `webhard-api/src/contacts/_lib/inquiry-filename.util.ts`
  - `webhard-api/src/contacts/_lib/inquiry-filename.util.spec.ts`
  - `webhard-api/src/contacts/contacts.service.ts`
  - `webhard-api/src/contacts/contacts.service.spec.ts`
  - `webhard-api/src/integration/orders/auto-contact.service.ts`
  - `webhard-api/src/integration/orders/__tests__/auto-contact.service.spec.ts` (실제 경로)
- `docs/specs/features/drawing-workflow.md` §W.1 — Phase 0 에서 업데이트된 새 규칙. 실제 구현과 일치하는지 확인.
- `docs/followups/19-webhard-folder-policy-status.md` — Phase 0 에서 추가한 "✅ 해결됨 (task 21)" 섹션.
- `docs/changelog/CHANGELOG.md` — Phase 0 에서 추가한 skeleton. 이 phase 에서 본문 채움.
- `docs/features-list.md` — 이 phase 에서 상태 갱신.

이유: Phase 1~3 의 실제 코드 변경이 Phase 0 docs 와 미묘하게 다를 수 있다 (함수명·시그니처·reason_code 집합·예외 처리 세부). 최종 spec-code sync + CHANGELOG 본문 작성 + features-list 갱신이 이번 phase 의 역할. **docs 를 코드에 맞춘다 — 반대 금지**.

## 작업 내용

### 1. `docs/specs/features/drawing-workflow.md` §W.1 최종 확인·보정

Phase 1~3 구현 코드와 §W.1 기술의 괴리를 찾아 수정:

**확인 체크리스트**:

- `normalizeCompanyName` 함수명·import 경로가 §W.1 기술과 일치하는지.
- 정규화 매칭 규칙 (제거하는 문자 집합) 이 실제 구현과 일치하는지.
- `reason_code` 집합 (`NO_INQUIRY_NUMBER` / `NO_COMPANY_ROOT` / `NO_FALLBACK_MATCH` / `FOLDER_CREATE_FAILED`) 이 실제 코드의 로그 메시지와 일치.
- 경로 1 (웹폼) 의 try/catch 범위가 문서화된 정책과 일치 (best-effort 유지).
- 경로 2·3 (auto-contact) 의 `relocateContactFiles` 호출 조건이 문서와 일치 (`folder && finalInquiryType` 일 때만).
- `buildInquiryFolderName` 의 inquiryNumber-만-반환 동작이 문서에 정확히 기술되어 있는지.
- Phase 1 의 logger 필드명 (`reason_code`, `contactId`, `companyName`, `inquiryNumber`) 이 문서와 일치.

불일치 발견 시 **docs 를 코드에 맞게** 수정.

### 2. `docs/changelog/CHANGELOG.md` 본문 기입

Phase 0 에서 추가된 skeleton (`<!-- Phase 4 에서 본문 채움 -->`) 을 아래 본문으로 교체:

```markdown
### 2026-04-23 — webhard-inquiry-folder-gap-fix (task 21)

**Scope**: task 20 (webhard-folder-policy-unify) 후속. 외부웹하드 동기화 → 자체웹하드 auto-contact 경로에서 발생하던 **문의 폴더 미생성 3개 구멍** 해결.

**Changes**:

- `buildInquiryFolderName` (`webhard-api/src/contacts/_lib/inquiry-filename.util.ts`): `inquiryNumber` 만 있어도 `문의-{O}` 반환 — 미분류 상태 폴더 생성 지원.
- `FoldersService.ensureInquiryFolder`: 업체 루트 fallback 2단계화 — `webhard_folders.name` 완전 일치 실패 시 `normalizeCompanyName` 정규화 매칭 시도.
- 신규 util (`webhard-api/src/folders/_lib/company-name-match.util.ts`): NFKC 정규화 + 공백·특수문자 제거 + 소문자화.
- `FoldersService.ensureInquiryFolder`: null 반환 시 `logger.warn({ reason_code, contactId, companyName, inquiryNumber })` 기록 — reason_code 는 `NO_INQUIRY_NUMBER` / `NO_COMPANY_ROOT` / `NO_FALLBACK_MATCH` / `FOLDER_CREATE_FAILED`.
- `ContactsService.create`: 공개폼 경로의 `!company` 가드 완화 — `webhard_company_mismatch` 알림 병행 + `ensureInquiryFolder` 호출 (best-effort, 실패 시 Contact 유지).
- `AutoContactService.createNewContact` (및 `detectAndCreate`): `finalInquiryType` 확정 여부와 무관하게 `ensureInquiryFolder` 호출. 미분류 상태에서도 `문의-{O}` 폴더 즉시 생성. `relocateContactFiles` 는 `folder && finalInquiryType` 일 때만 호출 (미분류 파일 이동 방지).

**Breaking**: 없음. Prisma 스키마 변경 없음, API 응답 구조 변경 없음, public 함수 시그니처 변경 없음.

**Tests**: `folders.service.spec.ts` P1-4~P1-9 (신규 5 + 회귀 1), `company-name-match.util.spec.ts` P1-util-1~P1-util-5 (신규 5), `inquiry-filename.util.spec.ts` P1-1~P1-3 (신규 1 + 회귀 2+), `contacts.service.spec.ts` P2-1~P2-6 (신규 5 + 회귀 1), `auto-contact.service.spec.ts` P3-6~P3-10 (신규 4 + 회귀 1). 총 신규/회귀 구분은 실제 구현 시점의 ID 에 따름.

**Follow-ups (task 22 이후 후보)**:

- 관리프로그램 DXF 파일 업로드 클라이언트 구현 (`yjlaser_api_client/client.py` 에 `upload_dxf_match` 메서드 추가) — 서버 `POST /integration/dxf-match/upload` 는 이미 구현됨.
- 기존 업체 루트 직하 `문의-{O}` 폴더를 `문의/문의-{O}` 로 옮기는 마이그레이션 스크립트.
- Admin 재시도 UI (webhardWarning 복구 플로우).
- `POST /integration/contacts/auto` (`OrdersService.createAutoContact`) 신규 문의 생성 경로의 폴더 연결 (필요 시).
- task 20 phase 5 followups 에 기재된 §3.1, §3.2, §3.4, §3.5, §3.6, §3.7.
```

skeleton 위치가 task 20 엔트리 아래에 있는 것 확인. 시간 순 유지.

### 3. `docs/features-list.md` 상태 갱신

기존 "webhard-folder-policy-unify" 항목 아래 (혹은 적절한 위치) 에 추가:

```markdown
| webhard-inquiry-folder-gap-fix | 미분류 문의 폴더 생성 + 공개폼 mismatch 가드 완화 + 외부웹하드 가상 업체 fallback 2단계화 + 실패 reason_code 진단 | shipped (task 21) |
```

컬럼 수·구분자는 기존 표 스타일 준수.

### 4. `docs/followups/19-webhard-folder-policy-status.md` 최종 확인·보정

Phase 0 에서 추가된 "✅ 해결됨 (task 21, 2026-04-23)" 섹션이 실제 구현과 일치하는지 확인. 불일치 발견 시 문구 수정 (예: 실제 구현된 reason_code 집합, 정규화 규칙 등).

### 5. 최종 통합 검증

모든 phase 완료 후 전체 빌드 + 테스트 통과 확인. **독립 검증 커맨드는 병렬 실행** (Opus 4.7 자동 팬아웃 안 함 — 단일 assistant 메시지에 다중 Bash 블록으로 동시 발사).

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test && cd webhard-api && pnpm build && pnpm test
```

전부 통과해야 함.

독립적으로 병렬 실행 가능한 항목:

- `pnpm build` (frontend)
- `npx tsc --noEmit` (frontend)
- `pnpm test` (frontend)
- `cd webhard-api && pnpm build` (backend)
- `cd webhard-api && pnpm test` (backend)

단일 assistant 메시지에 각각 별도 Bash 블록으로 **병렬 실행** — 시간 단축.

## AC 검증 방법

위 커맨드 전부 통과 시 `tasks/21-webhard-inquiry-folder-gap-fix/index.json` 의 phase 4 status 를 `"completed"` 로 변경. `/tasks/index.json` 의 task 21 status 는 `scripts/run-phases.py` 가 자동으로 `"completed"` 처리.

실패 시 docs 추가 보정 또는 phase 1~3 회귀 확인. **코드 로직을 docs 에 맞추기 위해 되돌리지 말 것** — docs 를 코드에 맞춘다.

task 19 merge 이후의 pre-existing 회귀 (예: `useTimelineRealtime.test.tsx`, `WorkerDrawingUpload.test.tsx`) 가 다시 발생한다면, task 20 phase 5 note 처럼 "pre-existing, 본 task 무관" 으로 기록하고 별도 fix 책임 이관. 단, 이번 task 변경이 회귀 원인이 아님을 `git diff` 로 증명할 수 있어야 함.

3 회 실패 시 `"error"` + error_message 기록.

## 주의사항

- **코드 변경 금지** — docs only.
- Phase 1~3 구현과 docs 의 불일치가 있으면 **docs 를 코드에 맞게** 수정 (반대 금지).
- task 20 의 CHANGELOG 엔트리, followups 기록은 건드리지 말 것.
- task 20 phase 5 에서 아카이브 처리된 §W.2, §W.3, §W.4 는 건드리지 말 것.
- Prisma migration 생성 금지.
- CHANGELOG 본문은 **실제 구현된 동작 기준** 으로 작성. Phase 0 skeleton 과 내용 불일치 시 실제 구현 우선.
- 독립 검증 커맨드는 병렬 실행 필수 (단일 메시지 다중 Bash).
- Next.js 쪽 (`src/`) 변경 없이도 `pnpm build && npx tsc --noEmit && pnpm test` 는 통과해야 함. 회귀 시 이번 task 무관 여부 확인 (`git diff master..HEAD -- 'src/'` 가 비어있는지) — 비어있으면 pre-existing 회귀로 기록 (task 20 phase 5 선례).
- `/tasks/index.json` task 21 status 는 자동 처리 — 직접 수정 금지.
