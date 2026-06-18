# Phase 2: Backend 테스트 (backend-tests)

## 사전 준비

먼저 아래 문서를 반드시 읽어라:

- `docs/testing.md` — "순수 로직에 집중" 원칙. mock 양산 금지. 깨지면 치명적인 분기만 커버.
- `docs/specs/features/drawing-workflow.md` §W.1 — 테스트로 검증할 정책의 최종 정의.
- `/tasks/22-contact-webhard-navigate/docs-diff.md` — Phase 0 문서 변경 기록.
- `/tasks/22-contact-webhard-navigate/phase1.md` — Phase 1 이 구현한 내용. 테스트는 이 phase 의 산출물을 검증한다.

그리고 이전 phase 의 작업물을 반드시 확인하라 (코드 파일 직접 읽기):

- `webhard-api/src/folders/_lib/resolve-company-root.util.ts` (신규) — 테스트 대상 유틸.
- `webhard-api/src/folders/folders.service.ts` — `relocateContactFiles` 의 수정된 로직.
- `webhard-api/src/folders/_lib/company-name-match.util.ts` — task 21 기존 유틸, 정규화 매칭에 사용됨.
- `webhard-api/src/contacts/contacts.service.ts` — `webhardFileId` 필드 채움 로직.
- 기존 backend 테스트: `webhard-api/src/folders/folders.service.spec.ts`, `webhard-api/src/contacts/contacts.service.spec.ts` 등 — 패턴(Prisma mock 스타일, testing 구조) 파악.

## 작업 내용

### 1. `webhard-api/src/folders/_lib/resolve-company-root.util.spec.ts` (신규)

4 개 시나리오:

| #   | 케이스                                                           | 기대값                                                                     |
| --- | ---------------------------------------------------------------- | -------------------------------------------------------------------------- |
| 1   | Company 테이블에 등록된 업체                                     | `{ rootFolderId: <uuid>, companyId: <uuid>, reasonCode: undefined }`       |
| 2   | Company 미등록 + `webhard_folders.name` 완전 일치 루트 존재      | `{ rootFolderId: <uuid>, companyId: null, reasonCode: undefined }`         |
| 3   | Company 미등록 + 정규화 매칭으로만 매칭 (예: 공백/특수문자 차이) | `{ rootFolderId: <uuid>, companyId: null }`                                |
| 4   | 모두 실패 (Company 없음, name 매칭도 없음)                       | `{ rootFolderId: null, companyId: null, reasonCode: 'NO_FALLBACK_MATCH' }` |

Prisma client 는 mock. `client.company.findFirst` 와 `client.webhardFolder.findFirst` 호출을 스텁. 각 케이스별 호출 순서 · 호출 횟수 검증(3 단계 fallback 이 순차적으로 시도되는지 확인 차원).

### 2. `webhard-api/src/folders/folders.service.spec.ts` (확장)

기존 파일이 있으면 `describe('relocateContactFiles')` 블록 내에 아래 케이스 **추가**. 없으면 새 파일 생성.

| #   | 케이스                                                                           | 검증 포인트                                                                                   |
| --- | -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| 5   | Company 미등록 가상업체 + `DrawingRevision.webhardFileIds` 존재 → 파일 이동 성공 | **버그 재현 방지**. `webhardFile.update` 가 호출되어 `folderId` 가 `targetFolderId` 로 갱신됨 |
| 6   | 정상 Company 케이스 → 기존 동작 유지                                             | 회귀 방지. 파일 이동 개수 · folderId 갱신 검증                                                |
| 7   | `webhardFileIds` 와 companyId 모두 없음 → `{ movedIds: [] }` 반환                | 엣지 케이스                                                                                   |

`resolveCompanyRoot` 는 실제 유틸을 import 해서 사용하되, Prisma client 는 mock. 케이스 5 가 핵심 — 기존 silent bail-out 이 없어졌는지 확실히 잡아낸다.

### 3. `webhard-api/src/contacts/contacts.service.spec.ts` (확장)

응답 DTO 에 `webhardFileId` 필드가 정확히 채워지는지 검증.

| #   | 케이스                                          | 기대값                                         |
| --- | ----------------------------------------------- | ---------------------------------------------- |
| 8   | DrawingRevision 존재 + `webhardFileIds[0]` 있음 | `response.webhardFileId === webhardFileIds[0]` |
| 9   | DrawingRevision 없음                            | `response.webhardFileId === null`              |
| 10  | DrawingRevision 있지만 `webhardFileIds` 빈 배열 | `response.webhardFileId === null`              |

`findOne` 또는 `findAll` 중 실제로 Phase 1 에서 수정된 메서드를 대상으로 테스트. Prisma mock 으로 DrawingRevision · webhardFileIds 조합을 구성.

### 4. 회귀 검증

```bash
cd webhard-api && pnpm test
```

task 20 · 21 이 남긴 기존 테스트가 모두 통과해야 한다. 특히:

- `ensureInquiryFolder` 관련 기존 테스트
- `webhard-folder-policy-unify` / `webhard-inquiry-folder-gap-fix` 테스트

기존 테스트가 `relocateContactFiles` 의 silent bail-out 에 의존하고 있으면 (예: "Company 없을 때 빈 배열 반환" 을 기대), 해당 테스트의 **기대값을 새 정책에 맞춰 수정**한다. 이때 수정 이유를 테스트 내 주석으로 1 줄 명시:

```ts
// task 22: relocateContactFiles 는 company 미등록 시에도 fallback rootFolder 로 파일 이동 시도
```

기존 테스트 파일 구조 · 네이밍을 유지. 새 테스트는 기존 블록에 자연스럽게 녹이거나 신규 describe 블록 추가.

## Acceptance Criteria

```bash
cd webhard-api && pnpm test
```

모든 테스트 통과. 새 케이스 10 개(#1~#10) 포함.

## AC 검증 방법

위 커맨드를 실행해 모든 테스트 통과 확인. 통과하면 `/tasks/22-contact-webhard-navigate/index.json` 의 phase 2 status 를 `"completed"` 로 변경.

기존 테스트가 깨지면:

- 의도된 정책 변경(silent bail-out 제거)에 의한 것이면 → 기존 테스트 기대값 수정 (이유 주석 필수)
- 의도치 않은 회귀면 → Phase 1 코드 수정 (이 phase 에서는 테스트만 수정하지 말 것. Phase 1 로 되돌아가 근본 원인 수정)

3 회 이상 실패 시 `"error"` + `error_message` 기록.

## 주의사항

- **mock 양산 금지**. docs/testing.md 원칙대로, 접착제 코드가 아닌 **순수 로직과 치명적 분기**만 커버. 예를 들어 `resolveCompanyRoot` 의 3 단계 fallback 순서는 치명적이지만, DTO 필드가 존재하는지 검증하는 수준의 테스트는 타입체크로 커버되므로 중복 금지.
- 케이스 5 (버그 재현 방지) 가 **이번 task 의 핵심 regression test**. 반드시 명확한 assertion 으로 작성. 예: "파일의 folderId 가 targetFolderId 로 갱신되었고 movedIds 배열에 해당 파일 id 포함".
- Prisma mock 패턴은 기존 spec 파일 참고. 새 패턴 만들지 말 것.
- 통합 테스트(실제 DB) 는 이 phase 에서 제외. 단위 테스트만.
- 한글 커밋 메시지: `test(contact-webhard-navigate): phase 2 — backend-tests`.
