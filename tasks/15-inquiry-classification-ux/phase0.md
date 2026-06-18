# Phase 0: docs-update

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `docs/specs/features/drawing-workflow.md` — 문의 workflow와 inquiry_type의 역할
- `docs/specs/features/contact-split.md` — Contact 모델 확장 사례
- `docs/specs/features/worker-portal.md` — Worker 대시보드 UX
- `docs/specs/features/design-system.md` — UI/스타일 규칙
- `docs/specs/db/prisma-tables.md` — Contact 모델 필드 (inquiry_type, status, created_at 등)
- `docs/specs/api/nextjs-routes.md` + `docs/specs/api/nestjs-endpoints.md` — `PATCH /api/contacts/[id]/inquiry-type` 기존 명세

코드 레퍼런스:

- `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` — 현재 미분류 드롭다운 배지 (admin + worker 공용)
- `src/app/(admin)/admin/contacts/_components/ContactCardHeader.tsx` — `formatCreatedAt` 함수 (Phase 1에서 utils로 이동 예정)
- `src/app/worker/_components/OfficeContactCard.tsx` — 사무실 작업자 카드 (생성시간 미표시)
- `src/app/worker/_components/StaffContactCard.tsx` — 현장 작업자 카드 (생성시간 미표시)
- `src/app/worker/_components/WorkerContextMenu.tsx` — 기존 long-press 메뉴
- `src/app/api/contacts/[id]/inquiry-type/route.ts` — 기존 PATCH API (유지)

## 작업 내용

이 task 전체의 설계 의도를 담은 feature spec을 신규 작성한다. 코드 변경은 이후 phase에서 진행되므로, 이 phase에서는 **문서만** 수정한다.

### 파일 신규 생성

`docs/specs/features/inquiry-classification-ux.md`

아래 섹션을 포함하라:

1. **배경 / 문제**
   - 기존 미분류 카드는 "미분류" 드롭다운 배지 → 2단계 클릭으로 분류해야 함
   - 분류 후 재분류 UI가 상세 페이지에만 있어 카드 목록에서 바로 수정 불가
   - Worker OfficeContactCard/StaffContactCard에 문의 생성시간 미표시로, 접수 시점 파악 어려움

2. **변경 요구사항**
   - 미분류 카드: 카드 헤더의 배지 자리에 **인라인 `[칼선의뢰] [목형의뢰]` 2버튼** 표시 (1-click 분류)
     - pulse 애니메이션 유지로 주의 환기
     - 2버튼이 헤더 1줄에 못 들어가면 wrap 허용 (의도된 동작)
     - admin `ContactCard`와 worker `OfficeContactCard`에 공용 적용 (`InquiryTypeBadge` 수정)
   - 분류된 카드: 기존 읽기 전용 배지 유지. 재분류는 **우클릭(데스크톱) / long-press(모바일) 컨텍스트 메뉴**로 진행
   - 재분류 시 status도 함께 변경됨(`cutting_request → drawing`, `mold_request → confirmed`). 단, `status !== 'received'`인 경우 **반드시 confirm 모달로 경고**
   - Worker 카드(OfficeContactCard / StaffContactCard)에 **문의 생성시간 표시**
     - 포맷: `3/23 오전 9시 3분` (기존 admin과 동일)
     - 위치: 업체명 아랫줄의 `webhard_folder_path` 옆, 작은 글씨 (`text-[10px]` 내외)

3. **UX 세부**
   - 미분류 버튼 색상: 칼선의뢰=파랑(`BADGE.info` 계열), 목형의뢰=초록(`BADGE.success` 계열)
   - 컨텍스트 메뉴는 Admin/Worker 각자 별도 컴포넌트로 유지 (공용화 안 함)
     - Admin: `src/app/(admin)/admin/contacts/_components/ContactContextMenu.tsx` 신규
     - Worker: 기존 `WorkerContextMenu.tsx`에 재분류 섹션 확장
   - 미분류 카드는 컨텍스트 메뉴 불필요 (인라인 버튼이 동일 기능) → 미분류 상태에서는 우클릭 메뉴 열지 않음

4. **API / 데이터 모델**
   - **변경 없음**. 기존 `PATCH /api/contacts/[id]/inquiry-type` 재사용
   - `VALID_INQUIRY_TYPES = ['cutting_request', 'mold_request']` 유지

5. **불변 규칙**
   - 분류 후 status 매핑: `cutting_request → drawing`, `mold_request → confirmed` (기존 `InquiryTypeBadge` optimistic 로직과 동일)
   - Worker 대시보드의 "미분류" 서브필터 (`!inquiry_type`) 동작 유지

### 기존 문서 업데이트

- `docs/specs/features/` 내 기존 스펙 중 inquiry_type을 언급하는 파일이 있다면 (`drawing-workflow.md`, `worker-portal.md` 등) **새 UX를 참조하는 한 줄** 추가
- `docs/specs/api/nextjs-routes.md`: `/api/contacts/[id]/inquiry-type` 항목에 "재분류 시 status 동기화 경고 필요" 주석 추가 (변경 없으면 생략)

## Acceptance Criteria

```bash
# 문서만 변경하므로 빌드 검증 불필요. 단, markdown 파일 존재 확인
ls docs/specs/features/inquiry-classification-ux.md
```

## AC 검증 방법

`docs/specs/features/inquiry-classification-ux.md` 파일이 존재하고 위 1~5 섹션이 모두 포함되어 있는지 확인. 확인되면 `/tasks/15-inquiry-classification-ux/index.json`의 phase 0 status를 `"completed"`로 변경하라. 3회 이상 실패 시 `"error"` + `"error_message"` 기록.

## 주의사항

- **코드 파일(`.ts`, `.tsx`, `.prisma`, API route)은 일절 수정하지 마라.** Phase 1~5에서 진행한다.
- 기존 스펙 파일의 내용을 함부로 지우거나 재구성하지 마라. 링크/참조만 추가.
- 이 task의 `docs-diff.md`는 Phase 0 완료 후 `scripts/gen-docs-diff.py`가 자동 생성한다. 직접 작성하지 마라.
