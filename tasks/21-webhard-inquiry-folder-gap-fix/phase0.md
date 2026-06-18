# Phase 0: docs-update

## 사전 준비

먼저 아래 문서들을 반드시 읽고 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/drawing-workflow.md` §W.1 — task 20 에서 업데이트된 웹하드 폴더 정책 규칙. 이번 task 는 §W.1 을 확장하는 방향.
- `docs/followups/19-webhard-folder-policy-status.md` — task 19/20 후속 추적 문서. task 20 phase 5 에서 "task 21 이후 후보" 로 미뤘던 항목 중 이번 task 가 해결하는 항목 확인.
- `docs/changelog/CHANGELOG.md` — task 20 엔트리 확인. 이번 task 21 엔트리를 동일 형식으로 추가.
- `webhard-api/src/folders/folders.service.ts` — `ensureInquiryFolder`, `ensureInquiryRootFolder` 현재 구현 (특히 `9be443cc` 에서 추가된 name 매칭 fallback).
- `webhard-api/src/contacts/_lib/inquiry-filename.util.ts` — `buildInquiryFolderName` 현재 로직 (inquiryNumber+workNumber 없으면 null 반환 여부 확인).
- `webhard-api/src/contacts/contacts.service.ts` 555-589 라인대 — `!company` 가드 (이번 task 에서 완화할 대상).
- `webhard-api/src/integration/orders/auto-contact.service.ts` — `detectAndCreate` / `createNewContact` 의 `finalInquiryType` 확정 분기.

이유: 이번 task 의 정책 변경 3가지 (미분류 폴더 생성 / mismatch 가드 완화 / fallback 정규화) 가 기존 §W.1 규칙을 어떻게 확장하는지 docs 에 정확히 반영하려면 현재 코드 기준을 파악해야 한다.

## 작업 내용

### 1. `docs/specs/features/drawing-workflow.md` §W.1 확장

§W.1 을 수정·확장한다 (기존 내용 삭제 금지, 추가·보정만).

**1-1. 미분류 상태에서의 폴더 생성 정책 추가**

§W.1 내 적절한 위치에 아래 서브섹션 추가 ("폴더 생성 시점" 관련 섹션 있으면 그 하위에):

```markdown
#### 미분류 상태에서의 폴더 생성 (task 21)

`inquiryType = null` 인 Contact 라 하더라도, `inquiryNumber` 만 있으면 `문의-{O}` 이름으로 폴더를 즉시 생성한다.

- 이후 분류 확정 + `workNumber` 발급 시점에 `ensureInquiryFolder` 가 기존 폴더를 재활용하여 `문의-{O}_{F}` 로 rename (task 20 기존 로직).
- 외부웹하드 동기화(LGU+) → 자체웹하드 auto-contact 경로에서 업로드되는 도면은 분류 전에도 이 폴더에 누적된다.
- 이유: 미분류 상태에서 추가 업로드되는 도면이 업체 루트에 누적되어 식별 불가능해지는 문제 해소.
```

**1-2. `ensureInquiryFolder` fallback 2단계화**

§W.1 의 "업체 루트 매칭" 규칙을 아래와 같이 확장:

```markdown
업체 루트 폴더 조회는 다음 순서로 시도한다:

1. `Company` 테이블에서 `companyName` 일치 조회 → `company_id` 로 `webhard_folders` 조회
2. (1) 실패 시 `webhard_folders.name` 완전 일치 fallback (task 20, 9be443cc)
3. (2) 실패 시 `webhard_folders.name` 정규화 매칭 fallback (task 21) — NFKC 정규화 + 공백·특수문자 제거 + 소문자화 후 비교
4. 모두 실패 시 null 반환 + `logger.warn` 에 `reason_code` 기록
```

**1-3. 공개폼 `!company` 가드 완화**

§W.1 의 "경로 1 (웹폼) 정책" 부분에 아래 내용 추가:

```markdown
경로 1 (웹폼): `Company` 매칭 실패 시에도 `ensureInquiryFolder` 를 호출한다 (task 21).
내부 2단계 fallback (완전→정규화) 이 가상 업체 루트를 찾아 `문의-{O}` 폴더를 생성한다.
`webhard_company_mismatch` 알림은 기존과 동일하게 병행 발송 (변경 없음).
폴더 생성 실패 시 Contact 는 유지 (best-effort) — `logger.warn` reason_code 로 추적.
```

**1-4. 경로 2·3 (auto-contact) 미분류 처리 명시**

§W.1 의 "경로 2·3 (auto-contact) 정책" 에 아래 내용 추가:

```markdown
경로 2·3 (auto-contact): `finalInquiryType` 확정 여부와 무관하게 `ensureInquiryFolder` 를 호출한다 (task 21).

- 미분류 상태로 생성된 Contact 는 `문의-{O}` 폴더로 즉시 연결.
- 분류 확정 + `workNumber` 발급 시 `ensureInquiryFolder` 가 기존 폴더를 `문의-{O}_{F}` 로 rename (task 20 로직 재활용).
- 단, `relocateContactFiles` 는 **분류 확정 시에만** 호출 (미분류 파일을 엉뚱한 폴더로 옮기지 않도록). 미분류→분류 전환 시 파일 이동은 기존 `updateInquiryType` 경로 (task 20 phase 3) 가 처리.
```

**1-5. 실패 진단 정책**

§W.1 하단에 새 서브섹션 추가:

```markdown
#### 폴더 생성 실패 진단 (task 21)

전 경로 best-effort 정책. `ensureInquiryFolder` 가 null 반환 시 실패 원인 코드를 `logger.warn` 에 기록한다:

- `NO_INQUIRY_NUMBER`: Contact 에 `inquiryNumber` 없음 (`buildInquiryFolderName` 이 null 반환)
- `NO_COMPANY_ROOT`: Company 매칭 성공했으나 해당 `company_id` 의 루트 폴더 조회·생성 실패
- `NO_FALLBACK_MATCH`: Company 없음 + `webhard_folders.name` 완전 일치·정규화 매칭 모두 실패
- `FOLDER_CREATE_FAILED`: `ensureInquiryRootFolder` 또는 `webhardFolder.create` 예외 (DB 오류)

로그 필드: `{ reason_code, contactId, companyName, inquiryNumber }`. Admin 재시도 UI 는 task 22+ 에 분리.
```

### 2. `docs/followups/19-webhard-folder-policy-status.md` 업데이트

**2-1. "✅ 해결됨 (task 21)" 섹션 추가**

task 20 phase 5 에서 추가된 "✅ 해결됨 (task 20)" 섹션 바로 아래에 아래 내용 추가:

```markdown
### ✅ 해결됨 (task 21, 2026-04-23)

- 경로 1 (웹폼) `!company` 가드로 인한 외부웹하드 가상 업체 폴더 미생성 → `ensureInquiryFolder` 호출 허용 + 2단계 fallback 강화로 해결.
- 경로 2·3 (auto-contact) 미분류 상태 Contact 폴더 미생성 → `inquiryType=null` 이어도 `문의-{O}` 폴더 즉시 생성.
- 실패 원인 추적 불가 → `logger.warn` reason_code 도입 (NO_INQUIRY_NUMBER / NO_COMPANY_ROOT / NO_FALLBACK_MATCH / FOLDER_CREATE_FAILED).
- 업체명 불일치 (띄어쓰기·특수문자) 로 인한 가상 업체 루트 미매칭 → `normalizeCompanyName` 정규화 매칭 fallback.
```

**2-2. 남은 후속 후보 목록 갱신**

task 20 phase 5 에서 작성된 "후속 task 후보 (task 21 이후)" 목록 중 **이번 task 가 해결한 항목이 있다면 제거하고**, 아래 항목은 **여전히 task 22+ 후보로 남김**:

```markdown
### 후속 task 후보 (task 22 이후)

- §3.1 — 기존 파일 정리 마이그레이션 스크립트 (업체 루트 직하 `문의-{O}` → `문의/문의-{O}` 이동 포함)
- §3.2 — dxf방 / 외부 폴더 정책
- §3.4 — F 번호 rename 시 파일명 prefix 재계산
- §3.5 — 완료 폴더 운영 (월별 하위, 취소 복귀, 권한)
- §3.6 — webhardWarning 복구 플로우 / Admin 재시도 UI
- §3.7 — 기존 루트 파일 "원본 도면 v1" 링크 Admin UI
- 관리프로그램 DXF 파일 업로드 클라이언트 구현 (`yjlaser_api_client/client.py` 에 `upload_dxf_match` 메서드 추가 — 서버 `POST /integration/dxf-match/upload` 는 이미 존재)
- `/integration/contacts/auto` (`OrdersService.createAutoContact`) 신규 문의 생성 경로의 폴더 연결 (필요 시)
```

### 3. `docs/changelog/CHANGELOG.md` skeleton 추가

`[Unreleased]` 섹션에 task 21 skeleton 을 추가 (본문은 Phase 4 에서 채움):

```markdown
### 2026-04-23 — webhard-inquiry-folder-gap-fix (task 21)

<!-- Phase 4 에서 본문 채움 -->
```

task 20 엔트리 **아래** 에 배치 (시간 순).

### 4. 다른 docs 파일 수정 여부

- `docs/features-list.md`: 이번 phase 에서 **수정 금지** — Phase 4 에서 상태 갱신.
- `docs/specs/api/nestjs-endpoints.md`: API 스펙 변경 없음 — 수정 불필요.
- `docs/specs/db/prisma-tables.md`: Prisma 스키마 변경 없음 — 수정 불필요.

## Acceptance Criteria

Phase 0 는 docs-only. 빌드·타입체크는 현 상태에서 깨지지 않아야 한다:

```bash
npx tsc --noEmit
```

## AC 검증 방법

위 커맨드 통과 시 `tasks/21-webhard-inquiry-folder-gap-fix/index.json` 의 phase 0 status 를 `"completed"` 로 변경.

3 회 실패 시 `"error"` + `"error_message"`.

## 주의사항

- **코드 수정 금지** — 이 phase 는 순수 docs 작업.
- `docs/specs/features/drawing-workflow.md` 의 §W.2, §W.3, §W.4 (task 20 phase 5 에서 아카이브 처리된 부분) 는 **건드리지 말 것**.
- task 19, task 20 의 기존 CHANGELOG 엔트리, followups 기록은 **건드리지 말 것** — 이번 task 21 섹션만 추가.
- `docs/features-list.md` 는 이번 phase 에서 수정 금지 — Phase 4 전용.
- `docs-diff.md` 는 phase 0 완료 후 `scripts/gen-docs-diff.py` 가 자동 생성 — 직접 작성 금지.
- 기존 §W.1 본문의 분기·조건을 **삭제하지 말고 추가·보정** 만.
