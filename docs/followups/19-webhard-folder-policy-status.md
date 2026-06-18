# 웹하드 폴더 정책 현황 — task 19 이후 스냅샷

**작성일**: 2026-04-22
**작성 맥락**: task 19 (worker-drawing-upload) 완료 + UI 수동 검증 피드백 직후. 웹하드 폴더 정책은 task 19 범위 내에서 기본 구조만 구현되었고, **디테일한 예외 케이스·운영 시나리오는 별도 후속 작업으로 분리**.
**대상 독자**: 다음 세션에서 폴더 정책을 이어받아 작업할 Claude Code / 개발자.

---

## 1. task 19 에서 구현된 현재 규칙

### 폴더 구조 (구현 완료)

```
{업체명}/
├── 칼선의뢰/            ← 기존 template. 거래처 원본 업로드 수신용. 삭제·이동 금지.
├── 목형의뢰/            ← 동일.
├── 문의-{O}/            ← Contact 생성·분류 확정 시 자동 (folderKind='inquiry').
│    ├── (원본 도면 v1)
│    └── (Worker revision v2, v3, …)
├── 문의-{O}_{F}/        ← F 번호 부여 시 위 폴더가 rename 된 결과. R2 key 유지.
└── 완료/                ← 납품 완료 시 이관 대상. 필요 시 lazy 생성 (folderKind='template').
     └── 문의-{O}_{F}/
```

### 코드 포인터

| 동작                                        | 위치                                                                                                                                        |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 문의 폴더 ensure (신규·재사용)              | `webhard-api/src/folders/folders.service.ts` — `ensureInquiryFolder(contactId)`                                                             |
| F 번호 추가 시 rename                       | `webhard-api/src/folders/folders.service.ts` — `renameInquiryFolderForContact(contactId)`                                                   |
| 납품 시 완료 폴더 이관                      | `webhard-api/src/folders/folders.service.ts` — `moveInquiryFolderToCompleted(contactId)`                                                    |
| 업체 초기 폴더 생성 (template)              | `webhard-api/src/folders/folders.service.ts` — `initializeCompanyFolders` + `DEFAULT_FOLDER_TEMPLATE`                                       |
| Contact 훅 (workNumber / processStage 전환) | `webhard-api/src/contacts/contacts.service.ts`                                                                                              |
| revision 업로드 시 파일 relocate            | `webhard-api/src/contacts/drawing-revision.service.ts` — `syncRevisionToWebhard` → `relocateContactFiles`                                   |
| 에러 전파 타입                              | `webhard-api/src/contacts/types/webhard-sync-warning.ts` — `WebhardSyncWarningCode`                                                         |
| 스펙 문서                                   | `docs/specs/features/drawing-workflow.md` §W.1 (§W.2 에 과거 규칙 아카이브)                                                                 |
| DB 스키마                                   | `webhard-api/prisma/schema.prisma` — `WebhardFolder` 의 `contactId` / `inquiryNumber` / `workNumber` / `folderKind` 4 컬럼 (task 18 추가분) |

### 명시적 정책 결정 (task 19 사용자 합의 사항)

1. **마이그레이션 없음** — 기존 rootFolder 또는 구 template (`칼선의뢰` / `목형의뢰`) 에 흩어진 파일은 **건드리지 않는다**. 새 Contact 부터만 새 구조 적용.
2. **reason → inquiryType 서버 매핑 없음** — Worker 모달의 사유 select (`domuson_fit` / `sample_revision` / `field_correction` / `other`) 는 Revision 의 사유 메타로만 기록. `Contact.inquiryType` 은 별도 경로 (Admin 분류 등) 로만 설정됨.
3. **syncRevisionToWebhard 실패 처리** — `.catch` 제거 후 throw 대신 `webhardWarning` 객체 반환 (Best Effort). revision 자체는 성공 유지.
4. **재시도 큐 없음** — 웹하드 동기화 실패 revision 은 수동으로 재업로드 해서 복구. Admin 재시도 버튼 등 별도 UI 추가 안 함 (버그 많아 사용자와 직접 테스트 필요).

---

## 2. 실제 운영 현황 (2026-04-22 관찰)

업체 `(주)신영피앤디` 의 외부웹하드 예시:

```
(주)신영피앤디/
├── dxf방 (1)               ← 출처 불명 — 기존 LGU+ sync 경로?
├── 목형의뢰 (7)            ← 기존 template, 파일 7 개 누적
├── 칼선의뢰                ← 기존 template (빈 상태)
├── 260422_새라올(슬리브+하짝)_목형(유진).ai       ← rootFolder 에 직접 저장됨
├── 260421_새라올(호두정과 단상자+패드)_목형(유진).ai
├── 260421_새라올(드립백 단상자)_목형(유진).ai
├── 260421_새라올(쇼핑백 두쪽바리)_목형(유진).ai
├── 260421 오투블룸 튜터치바디크림 단상자 목형(유진).ai
├── 240318 시드니상사 커피스틱 단상자 수정 목형(유진).ai
├── 260420_쓰크루(뚯집 떡박스 내부패드)_목형(유진).ai
├── 260417_두바이유학생(4구 G형박스)_목형(유진).ai
└── 260417_두바이유학생(5구 G형박스)_목형(유진).ai
```

**관찰 포인트**:

- 파일들이 업체 루트에 직접 쌓여 있음 — `ensureInquiryFolder` 가 적용되기 이전 시점의 파일로 추정 (파일명 패턴: 거래처 원본 업로드 + 관리자 분류 전 상태).
- `문의-{O}/` 또는 `문의-{O}_{F}/` 폴더가 **하나도 없음** — 아직 "새 정책 적용된 신규 문의" 가 해당 업체에 존재하지 않는 상태일 가능성.
- `dxf방` 폴더는 이 프로젝트 스펙에 없는 외부 시스템 (LGU+ 웹하드 계정 고유 폴더?) 으로 보임. 관련 규칙 확인 필요.
- `목형의뢰` 에 7 개 파일 — 거래처가 template 폴더에 직접 업로드한 원본들. task 18 정책상 관리자 분류 후 `문의-{번호}/` 로 이동해야 하지만 실제로는 이동되지 않은 채 누적.

---

## 3. 디테일 작업 후보 (다음 세션 가이드)

### ✅ 해결됨 (task 20, 2026-04-22)

- §3.3 — template 폴더 누적 파일 자동 분류 검증 → task 20 Phase 3 auto-contact-path 에서 해결 (`AutoContactService.createNewContact` 끝단 훅 추가, best-effort).

### ✅ 해결됨 (task 21, 2026-04-23)

- 경로 1 (웹폼) `!company` 가드로 인한 외부웹하드 가상 업체 폴더 미생성 → `inquiryType` 확정 상태에서 `ensureInquiryFolder` 를 호출하도록 가드 완화 + Phase 1 의 2단계 fallback 이 가상 업체 루트를 찾는다. 알림 발송은 기존대로 먼저 수행, 폴더 생성은 try/catch 로 best-effort.
- 경로 2·3 (auto-contact) 미분류 상태 Contact 폴더 미생성 → `inquiryType=null` 이어도 `inquiryNumber` 가 있으면 `문의-{O}` 폴더 즉시 생성. `relocateContactFiles` 는 분류 확정(`finalInquiryType` truthy) 시에만 호출 — 미분류 파일의 엉뚱한 이동 방지.
- 실패 원인 추적 불가 → `logger.warn` reason_code 도입 (`NO_INQUIRY_NUMBER` / `NO_COMPANY_ROOT` / `NO_FALLBACK_MATCH` / `FOLDER_CREATE_FAILED`). 로그 필드 `{ reason_code, contactId, companyName, inquiryNumber, message }` + `FOLDER_CREATE_FAILED` 는 추가 `error`.
- 업체명 불일치 (띄어쓰기·특수문자) 로 인한 가상 업체 루트 미매칭 → `normalizeCompanyName` 정규화 매칭 fallback (NFKC + 소문자화 + `[^a-z0-9가-힣]` 전 제거, 순수 함수 `webhard-api/src/folders/_lib/company-name-match.util.ts`).

### 후속 task 후보 (task 22 이후)

- §3.1 — 기존 파일 정리 마이그레이션 스크립트 (업체 루트 직하 `문의-{O}` → `문의/문의-{O}` 이동 포함)
- §3.2 — dxf방 / 외부 폴더 정책
- §3.4 — F 번호 rename 시 파일명 prefix 재계산
- §3.5 — 완료 폴더 운영 (월별 하위, 취소 복귀, 권한)
- §3.6 — webhardWarning 복구 플로우 / Admin 재시도 UI
- §3.7 — 기존 루트 파일 "원본 도면 v1" 링크 Admin UI
- 관리프로그램 DXF 파일 업로드 클라이언트 구현 (`yjlaser_api_client/client.py` 에 `upload_dxf_match` 메서드 추가 — 서버 `POST /integration/dxf-match/upload` 는 이미 존재)
- `/integration/contacts/auto` (`OrdersService.createAutoContact`) 신규 문의 생성 경로의 폴더 연결 (필요 시)

---

### 3.1 기존 파일 정리 전략

업체 루트·구 template 에 누적된 파일들을 어떻게 처리할지 결정 필요.

- **옵션 A — 영구 방치**: 새 문의만 새 구조 적용. 기존 파일은 운영자가 수동으로 정리.
- **옵션 B — 일괄 마이그레이션 스크립트**: `scripts/migrate-webhard-inquiry-folders.ts` 패턴 참고 (task 18 선례). Contact 의 `inquiryNumber` / `workNumber` 로 소속 추적이 가능한 파일만 이동.
- **옵션 C — 점진적 이동**: 관리자 페이지에서 파일 선택 → "문의로 이동" 버튼. 수동이지만 실수 가능성 최소.

**결정 포인트**: 운영자가 손대기 편한 방향 vs 자동화 수준.

### 3.2 `dxf방` / 기타 외부 폴더 정책

관찰된 `dxf방` 같은 외부 발생 폴더가 다른 업체에도 존재하는지 조사 필요.

- `webhard-api/src/folders/folders.service.ts` 에서 LGU+ sync 경로 처리 로직 재검토.
- `folderKind` 에 새 값 (`external` / `legacy`) 추가 여부 검토.

### 3.3 template 폴더 누적 파일 자동 분류

**✅ 해결됨 (task 20, 2026-04-22)** — Phase 3 auto-contact-path 에서 `AutoContactService.createNewContact` 끝단에 `ensureInquiryFolder + relocateContactFiles` 훅을 추가하여, 거래처가 `칼선의뢰` / `목형의뢰` template 에 직접 업로드한 파일이 `triggerAutoContact` / `batchTriggerAutoContact` 분류 확정 시점에 `문의/문의-{번호}/` 로 자동 이동하도록 연결 완료. 미분류(`finalInquiryType=null`) 는 원위치 유지. best-effort (try/catch+warn) 로 감싸 LGU+ sync 대량 처리 중 개별 실패가 전체를 막지 않는다.

- 테스트: `auto-contact.service.spec.ts` P3-1~P3-5 (cutting_request / mold_request / 미분류 skip / laser-only / best-effort throw 시나리오).
- 수동 분류 경로 (`ContactsService.updateInquiryType`) 는 기존대로 `$transaction` 내부 strict.

### 3.4 F 번호 rename edge case

- **rename 시 하위 파일의 R2 key prefix 가 새 폴더명을 포함하는 경우가 있는지** 검증 필요. task 19 가정: R2 key 는 유지, DB 폴더명만 변경. 실제로 파일명 규칙이 `[{대표번호}] 원본명` 이면 폴더 rename 과 별개로 **파일명 prefix 재계산**도 필요할 수 있음 (task 18 `buildInquiryFileName` 스펙).
- 여러 Contact 분할 (`-N` suffix) 케이스에서 rename 이 어느 폴더에 적용되는지 확인.

### 3.5 완료 폴더 운영 시나리오

- `완료/` 하위가 너무 많아지면 관리 불편 — 연·월별 하위 구조 필요한지 (`완료/2026-04/문의-{O}_{F}/`).
- 완료 취소 (납품 취소) 시 폴더 **원위치 복귀** 로직 필요 여부.
- 완료 폴더 내 파일 수정·삭제 권한 정책 (읽기 전용?).

### 3.6 성공/실패 시나리오 명확화

현재 `WebhardSyncWarningCode` 3 종 (`NO_INQUIRY_NUMBER` / `FOLDER_CREATE_FAILED` / `RELOCATE_FAILED`).

- 각 경우의 복구 절차를 운영 가이드에 명시 필요.
- Admin 페이지에 "웹하드 미연동 Revision 목록" 뷰 필요 여부 (task 19 에서 추가 안 함).

### 3.7 기존 `dxf방` / 업체 루트 파일의 "원본 도면" 취급

신규 Contact 생성 시 `createInitialRevision` 가 v1 을 만드는데, 이 v1 이 업체 루트에 있는 기존 파일을 링크해야 하는 경우 (업로드 전에 이미 존재하는 파일) 처리 로직 확인.

---

## 4. UI 수동 검증 완료/미완료

task 19 PR #13 기준 총 16 체크리스트 중:

| 영역                    | 완료           | 이슈 발견                                                                    |
| ----------------------- | -------------- | ---------------------------------------------------------------------------- |
| 모달 UX (드래그드랍 등) | 일부           | ⚠️ z-index 로 성공/에러 모달 미표시 → **followup 커밋에서 수정** (아래 §5)   |
| 타임라인 실시간         | 일부           | ⚠️ 2 번째까지만 반영, 3 번째 + 미반영 → **followup 커밋에서 수정** (아래 §5) |
| 웹하드 폴더 정책        | 이 문서로 이관 | 상세 시나리오 미검증                                                         |

---

## 5. 이 문서 작성 중 함께 커밋된 수정 (follow-up to task 19)

task 19 수동 검증 직후 이 문서와 함께 아래 프론트 버그 2 건이 수정되었다:

1. **`ConfirmModal` z-index / Portal** — `src/app/worker/_components/ConfirmModal.tsx`
   - Portal 없이 `z-[60]` 으로 렌더링되어 BaseModal (`z-[9999]` via Portal) 에 가려져 성공·에러 모달이 안 보이던 문제.
   - `createPortal(..., document.body)` 로 body 직접 렌더 + `z-[10000]` 으로 상향.
2. **타임라인 3 번째 업로드부터 미반영** — `WorkerDrawingUpload.tsx`, `useTimelineRealtime.ts`
   - `refetchQueries({ type: 'active' })` 가 React Query 내부 dedupe 로 연속 호출 시 누락되는 케이스 추정.
   - `invalidateQueries({ refetchType: 'all' })` 로 변경해 비활성 쿼리까지 refetch 보장.

두 수정 모두 사용자 영향이 큰 UX 버그 — task 19 완료 보고 직후 즉시 수정. 상세 원인·의도는 본 문서 작성 시점의 conversation history 참고.

---

## 6. 다음 세션 시작 방법

1. 이 문서 전체를 읽어 현재 상태 파악.
2. `docs/specs/features/drawing-workflow.md` §W.1 로 확정 규칙 확인.
3. §3 (디테일 작업 후보) 에서 사용자와 우선순위 협의 → 1–2 개 선정.
4. 신규 task 20 또는 task 21 로 `/plan-and-build` 시작.

본 문서는 **현 시점 스냅샷**. 이후 작업이 진행되면 이 문서는 구식이 되므로 **업데이트 또는 archive** 필요.
