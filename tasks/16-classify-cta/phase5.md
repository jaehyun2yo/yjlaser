# Phase 5: docs-sync

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/inquiry-classification-ux.md` — Phase 0 에서 추가된 §8 "후속 리팩토링" 섹션. 이번 phase 에서 코드와 최종 정합 확인 후 필요 시 미세 조정한다.
- `docs/changelog/CHANGELOG.md` — [Unreleased] 섹션 아래 2026-04-20 일자로 이번 task 엔트리를 기록하기 위함.
- `docs/features-list.md` (있으면) — 기능 상태 테이블. `inquiry-classification-ux` 또는 관련 행에 리팩토링 완료를 반영.
- `tasks/16-classify-cta/docs-diff.md` — Phase 0 문서 diff. Phase 5 는 이 diff 에 기록된 스펙 변경이 실제 구현과 일치하는지 **역방향 검증** 한다.
- `tasks/16-classify-cta/phase1~4.md` 와 각 phase 산출물 — 이번 task 에서 변경된 모든 코드 파일. 다음을 커버해야 한다:
  - `src/lib/types/contact.ts` (id: string)
  - `src/lib/hooks/useContactTimeline.ts` (Number() 제거)
  - `src/app/actions/contacts.ts` (getContactTimeline 시그니처)
  - `src/lib/hooks/useClassifyInquiryType.ts` (신규)
  - `src/components/contacts/InquiryClassifyButtons.tsx` (신규)
  - `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` (mode prop)
  - `src/app/(admin)/admin/contacts/_components/ContactCardHeader.tsx` (mode='label-only')
  - `src/app/(admin)/admin/contacts/_components/ContactCardActions.tsx` (분기 추가)
  - `src/app/worker/_components/OfficeContactCard.tsx` (분기 + layout)
  - `src/app/worker/_components/StaffContactCard.tsx` (layout)
  - `src/app/worker/_components/OfficeAdvanceButton.tsx` (disabled fallback 제거)
  - Contact id 연쇄 수정된 모든 caller
  - 추가/수정된 테스트 파일 전체
- `docs/specs/api/nextjs-routes.md` — `PATCH /api/contacts/[id]/inquiry-type` 엔트리. 계약 변경 없음, 주석만 최신화 확인.

## 작업 내용

### 1. 코드 ↔ 스펙 정합 검증 + 미세 조정

**검증 대상**:

- `docs/specs/features/inquiry-classification-ux.md` §8 의 각 소섹션이 **실제 구현과 일치**하는지 확인. 불일치 항목(파일 경로 오타, 시그니처 변경, prop 이름 오차 등)이 있으면 **스펙을 코드 기준으로 수정**한다. 코드가 스펙을 따라야 하는 본질적 항목(예: status 매핑, pulse 유지)은 반대로 코드를 스펙에 맞춘다.
- `InquiryTypeBadge.mode` prop 타입 시그니처, 기본값, `'label-only'` 렌더 결과(주황 "미분류" 뱃지)가 §8 에 정확히 기술되었는지.
- `useClassifyInquiryType` 훅 반환 타입(`classify`, `isPending`, `pendingType`)이 §8 에 명시된 계약과 일치.
- `InquiryClassifyButtons` props(`contact`, `size`, `onStopPropagation`) 및 `size` 기본값 `'md'` 가 §8 과 일치.
- Admin `ContactCardActions` / Worker `OfficeContactCard` 의 CTA 분기 조건(`isUnclassified && status === 'received'` / `!contact.inquiry_type`)이 §8 에 명시된 것과 일치.
- Worker 카드 layout: 첫 줄에 `inquiry_number → formatCreatedAt`, 세 번째 줄에 `webhard_folder_path` 만. Office/Staff 양쪽.
- `Contact.id: string` 정상화 결정이 §8 과 `docs/specs/db/prisma-tables.md` (있으면) 에 반영됐는지.

### 2. `contact-split.md` 참조 갱신 확인

**파일**: `docs/specs/features/contact-split.md`

Phase 0 에서 추가된 "task 16 이후 CTA는 `InquiryClassifyButtons` 공용 컴포넌트 기준" 한 줄이 실제로 존재하는지 확인. 없으면 §"자식에 복사되는 정보" 블록 아래 `inquiryType` 주석 라인 뒤에 추가한다.

### 3. `worker-portal.md` 참조 갱신 확인

**파일**: `docs/specs/features/worker-portal.md`

Phase 0 에서 추가된 "미분류 카드의 분류 CTA 는 advance 버튼 자리를 공용 `InquiryClassifyButtons` 가 대체" 라인 존재 확인. 없으면 Worker 대시보드 카드 섹션에 추가.

### 4. `nextjs-routes.md` 주석 갱신 확인

**파일**: `docs/specs/api/nextjs-routes.md`

`PATCH /api/contacts/[id]/inquiry-type` 엔트리에 "UI 에서 `useClassifyInquiryType` 훅이 이 엔드포인트를 사용" 주석 존재 확인. 없으면 추가. **요청/응답 계약은 변경 없음** — 수정 금지.

### 5. `CHANGELOG.md` 엔트리 추가

**파일**: `docs/changelog/CHANGELOG.md`

`[Unreleased]` 섹션 아래 2026-04-20 일자 블록(없으면 신규) 에 이번 task 항목 추가. 간결하게 사용자 영향 중심으로 기술:

```markdown
## [Unreleased]

### 2026-04-20 — classify-cta 리팩토링 (task 16)

- **변경**: 미분류 문의의 분류 CTA 를 Admin/Worker 공용으로 재배치.
  - 왼쪽 유형 영역은 단일 "미분류" 주황 뱃지(`InquiryTypeBadge mode='label-only'`).
  - 오른쪽 액션 영역에 공용 `[칼선의뢰][목형의뢰]` 2버튼(`InquiryClassifyButtons`) 신규.
  - Worker `OfficeAdvanceButton` 의 "분류 필요" disabled fallback 제거.
- **신규**: 공용 훅 `useClassifyInquiryType`, 공용 컴포넌트 `InquiryClassifyButtons`.
- **수정**: Worker 카드 생성시간이 세 번째 줄 → 첫 번째 줄 `inquiry_number`/`work_number` 다음으로 이동.
- **버그 수정**: `Contact.id` 타입을 `number` → `string` 으로 정정(UUID). `useContactTimeline` 의 `Number(contactId)` 가 NaN 을 유발해 **타임라인이 빈 배열로 반환되던 치명적 버그** 해결 — 카드 펼침 시 타임라인 기록이 실제로 노출된다.
- **영향 파일**: `src/lib/types/contact.ts`, `src/lib/hooks/{useContactTimeline,useClassifyInquiryType}.ts`, `src/app/actions/contacts.ts`, `src/components/contacts/InquiryClassifyButtons.tsx`, `src/app/(admin)/admin/contacts/_components/{InquiryTypeBadge,ContactCardHeader,ContactCardActions}.tsx`, `src/app/worker/_components/{OfficeContactCard,StaffContactCard,OfficeAdvanceButton}.tsx` 외 다수.
```

기존 CHANGELOG 엔트리 포맷(최근 `inquiry-classification-ux` / `timeline-reliability` 등)을 그대로 따라라. 날짜 형식 `2026-04-20` 고정.

### 6. `features-list.md` 상태 갱신 (파일 존재 시)

있으면 `inquiry-classification-ux` 또는 관련 행의 `최근 변경` / `비고` 컬럼에 "task 16 classify-cta 리팩토링 완료 (2026-04-20)" 한 줄 추가.

### 7. 마지막 검증 — 스펙 본문 탐색

Phase 0 이후 코드가 반복 수정되는 과정에서 **스펙과 코드 간 괴리**가 누적될 수 있다. 다음 키워드로 스펙 본문을 재검색하여 남은 불일치 없는지 최종 확인:

```bash
grep -rn "number" docs/specs/features/inquiry-classification-ux.md | grep -i "contact.*id"
grep -rn "분류 필요" docs/specs/features/inquiry-classification-ux.md
grep -rn "disabled" docs/specs/features/inquiry-classification-ux.md | grep -i advance
```

결과에 남아있는 구형 기술(예: `contact.id: number`, advance 버튼의 disabled fallback) 이 있으면 스펙에서 제거 또는 "task 16 에서 제거됨" 주석 추가.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

단일 메시지에 Bash 병렬로 발사. 모두 통과 시 `tasks/16-classify-cta/index.json` 의 phase 5 status 를 `"completed"` 로 변경하고, `tasks/index.json` 의 task 16 status 도 `"completed"` 로 변경하라. 수정 3회 이상 시도해도 실패하면 status 를 `"error"` 로 변경하고 에러 내용을 `"error_message"` 필드로 기록하라.

**문서 전용 phase** 이므로 테스트 회귀가 있다면 이 phase 의 변경과 무관한 것이다 (R2 관련 2건 등 기존 회귀). `error_message` 에 "기존 회귀, 이번 phase 무관" 을 명시해도 completed 마킹 가능.

## 주의사항

- **코드 수정 금지**: 이 phase 는 **문서 동기화 전용**. `src/`, `webhard-api/src/` 코드를 수정하면 안 된다. 단 **스펙과 코드의 실제 동작이 다를 때** 는 스펙을 코드 기준으로 맞추는 방향으로 문서만 수정한다.
- **계약 변경 금지**: `PATCH /api/contacts/[id]/inquiry-type` 엔드포인트의 request/response 계약은 이번 task 에서 변경되지 않았다. API 문서의 주석만 최신화할 것.
- **CHANGELOG 순서**: `[Unreleased]` 블록의 맨 위(가장 최근 날짜 상단)에 추가. 기존 엔트리 순서를 보존.
- **features-list.md 가 없으면 skip**. 파일 생성은 이 phase 의 책임이 아니다.
- **불변 규칙 재확인**: 스펙 §5 (status 매핑, pulse, 컨텍스트 메뉴 미분류 금지 등) 는 이번 task 에서도 모두 유지. §5-7, §5-8 이 Phase 0 에서 추가됐는지 확인.
- **task-level 완료 처리**: Phase 5 completed 마킹과 함께 `tasks/index.json` 의 task 16 `completed_at` 필드도 runner 가 자동 기록하도록 놔둬라. 수동 기록은 시각 불일치 위험.
