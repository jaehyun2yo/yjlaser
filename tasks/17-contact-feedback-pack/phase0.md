# Phase 0: docs-update

## 사전 준비

먼저 아래 문서·코드를 반드시 읽어 전체 아키텍처와 설계 의도를 이해하라:

- `docs/specs/features/inquiry-classification-ux.md` — task 15/16 결과물. §3.1 색상 토큰과 §5 불변 규칙 3번 (pulse/ring 유지) 을 task 17 에서 **폐기 전환**한다. §8(task 16) 아래 §9(task 17) 섹션을 이어 붙인다.
- `docs/specs/features/drawing-revision-history.md` — 리비전 선택 규칙이 이미 있다. 신규 `/api/contacts/:id/latest-drawing/download` 가 `getLatestForCurrentStage` 규칙을 재사용함을 추가.
- `docs/specs/api/nextjs-routes.md` — 신규 Next.js 라우트 + 기존 `drawing-revisions/:id/download` 인증 허용 범위 갱신.
- `docs/specs/api/endpoints/integration.md` — NestJS 신규 엔드포인트 `GET /contacts/:id/latest-drawing-url` 엔트리 추가.
- `docs/specs/db/prisma-tables.md` — Contact `is_urgent`/`urgent_at` 필드 이미 존재. **스키마 변경 없음** 을 명시.
- `docs/changelog/CHANGELOG.md` — `[Unreleased]` 블록. 이번 task skeleton 만 추가, 최종 문구는 Phase 6 에서.
- `src/app/(admin)/admin/contacts/_components/InquiryTypeBadge.tsx` (line 74-128), `src/components/contacts/InquiryClassifyButtons.tsx` (line 30-34) — Phase 1 에서 제거할 `ring-2 ring-orange-300 ring-offset-1 animate-pulse` 위치.
- `src/components/ContactTimeline.tsx` — Phase 2 의 ASC 정렬 + compact 모드 actorName 노출 대상.
- `webhard-api/src/contacts/contact-timeline.service.ts` (line 140, 144, 223, 324-330) — Phase 2 ASC 전환 대상.
- `webhard-api/src/contacts/drawing-revision.service.ts` (line 341-381 `getLatestForCurrentStage`) — Phase 4 신규 API 의 근간.
- `src/app/worker/_components/{OfficeContactCard,StaffContactCard}.tsx` — Phase 5 urgent 배경 제거 대상.
- `src/app/(admin)/admin/contacts/_components/ContactCardHeader.tsx` — Phase 5 긴급 배지 overlay 추가 위치.

## 작업 내용

### 1. `docs/specs/features/inquiry-classification-ux.md` 수정

§3.1 "색상 토큰" 표에서 pulse/ring 항목에 **"task 17 에서 폐기"** 주석 추가. §5 불변 규칙 3번 교체:

> 3. **분류 CTA 및 '미분류' 뱃지는 정적 렌더**. task 17 피드백 이후 pulse/ring 효과는 제거됨. 주의 환기는 tooltip 과 우측 CTA 의 색상 대비(파랑/초록)로 충분.

§8(task 16) 아래에 **§9 "task 17 classify-cta-cleanup"** 섹션 추가:

- ring/pulse 제거 결정 배경 (시각 소음 완화)
- `InquiryClassifyButtons` 2버튼 간격 `gap-1 → gap-2` 변경 근거
- 나머지 변경 (타임라인/긴급/다운로드) 은 **다른 스펙 문서** 에서 관리함을 명시

### 2. **신규** `docs/specs/features/contact-urgent-ui.md` 작성

- §1 개요: `contacts.is_urgent=true` 를 Admin ContactCard / Worker Office·Staff ContactCard 양쪽에서 **동일한 overlay** 로 표시하는 규칙.
- §2 규칙:
  - 카드 컨테이너 background / border 는 변경하지 않는다 (기존 `bg-white border border-gray-200`).
  - 긴급 시 header 영역에 `[Siren 아이콘 + "긴급"]` 붉은 배지 1개 최우선 노출. 배지 색: `bg-red-600 text-white`.
  - 사이렌 아이콘: `lucide-react` `Siren`, `w-3 h-3 animate-pulse`. 배지 내부에 아이콘 + 텍스트 순서.
  - 분류 배지, 공정 단계 배지, inquiry_number, 생성시간 등 다른 요소는 긴급 여부와 무관하게 기존 스타일 유지.
  - Worker 카드에 있던 `urgent ? 'bg-red-500'`, `text-white/*`, `bg-white/*` 등 조건부 스타일은 **전부 제거**.
- §3 컴포넌트: 공용 `UrgentBadge` 추출은 3곳 이상 반복되면 결정. 초기는 각 카드에 인라인 렌더.
- §4 불변 규칙:
  1. 긴급 시각화는 **overlay 전용**. 카드 배경·border 변경 금지.
  2. 사이렌 아이콘은 `lucide-react` `Siren` 로 통일. emoji 사용 금지.
  3. `is_urgent=false|null` 시 긴급 요소 전부 미렌더.
- §5 `dark:` 클래스 금지 원칙 재확인.
- §6 참조: `src/app/worker/_components/{OfficeContactCard,StaffContactCard}.tsx`, `src/app/(admin)/admin/contacts/_components/ContactCardHeader.tsx`, Contact 스키마 `is_urgent`/`urgent_at`.

### 3. `docs/specs/features/drawing-revision-history.md` 수정

"최신 도면 선택" 섹션 아래 **"최신 도면 다운로드 API"** 서브섹션 추가:

- 엔드포인트: `GET /api/contacts/:id/latest-drawing/download` (Next.js)
  - 인증: admin-session | company-session | erp-session 중 하나.
  - 내부: NestJS `GET /contacts/:id/latest-drawing-url` → `DrawingRevisionService.getLatestForCurrentStage(contactId)` → presigned URL 반환.
  - 응답: `{ url: string, fileName: string }`. 최신 리비전 없으면 `contact.drawingFileUrl` 조용히 fallback.
- Worker 카드 다운로드 아이콘 + Admin 상세뷰 "첨부 파일 > 도면" 항목 모두 이 API 사용.

### 4. `docs/specs/api/nextjs-routes.md` 수정

- **신규 엔트리**: `GET /api/contacts/[id]/latest-drawing/download` — 인증 3종, 응답 스키마.
- **기존 엔트리 수정**: `GET /api/drawing-revisions/[revisionId]/download` — 인증 허용 범위 "admin|company" → "admin|company|erp". worker 카드 타임라인 파일 다운로드 가능.

### 5. `docs/specs/api/endpoints/integration.md` 수정

신규 엔트리 `GET /api/v1/contacts/:id/latest-drawing-url`:

- 목적, request, response, 에러 케이스 (not found, fallback).
- **ApiKeyGuard 필수** — Next.js 프록시 경유만 허용.

### 6. `docs/changelog/CHANGELOG.md` skeleton

`[Unreleased]` 블록 아래 `### 2026-04-20 — contact-feedback-pack (task 17)` 헤더 + "Phase 6 에서 내용 기입" 한 줄 placeholder.

### 7. docs-diff 는 runner 가 자동 생성

`scripts/run-phases.py` 가 Phase 0 완료 직후 `scripts/gen-docs-diff.py` 실행 — 수동으로 만들지 말 것.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

문서 수정만이므로 빌드/타입체크 통과 시 OK.

## AC 검증 방법

위 커맨드 실행 후 통과하면 `tasks/17-contact-feedback-pack/index.json` 의 phase 0 status 를 `"completed"` 로 변경. 3회 이상 실패 시 `"error"` + `"error_message"`.

## 주의사항

- 이 phase 는 **문서만** 수정. 코드 변경 금지.
- 기존 스펙의 pulse/ring 관련 불변 규칙을 단순 삭제하지 말고 **"task 17 에서 폐기"** 주석 유지 (이유 기록).
- 신규 `contact-urgent-ui.md` 는 `dark:` 클래스 금지 원칙을 본문에 재확인 라인으로 포함.
- CHANGELOG 는 skeleton 까지만. 최종 문구는 Phase 6.
- `docs/specs/db/prisma-tables.md` 는 **변경 없음** — Contact 스키마 수정 없음.
