# Phase 6: e2e-tests + docs-sync

## 사전 준비

- `e2e/fixtures/auth.ts`, `e2e/global-setup.ts`, `e2e/helpers/` — 기존 E2E 패턴 재사용.
- `e2e/drawing-timeline.spec.ts` — 기존 타임라인 E2E. locator / fixture 패턴 참조.
- `playwright.config.ts` — baseURL, projects, storageState 설정.
- `webhard-api/prisma/seed.ts` — `seedErpWorkers`, `seedContacts` 존재. S7 용 `is_urgent=true` 1건 추가.
- `docs/changelog/CHANGELOG.md` — [Unreleased] 블록 Phase 0 skeleton 에 최종 문구 기입.
- `docs/specs/features/{inquiry-classification-ux,contact-urgent-ui,drawing-revision-history}.md` — Phase 0 초안과 실제 Phase 1-5 구현 diff 비교 후 미세 조정.
- `docs/specs/api/nextjs-routes.md`, `docs/specs/api/endpoints/integration.md` — 엔드포인트 실구현과 일치 확인.
- `docs/features-list.md` — 파일 존재 시에만 행 추가 (없으면 skip).

## 작업 내용

### 1. Seed 데이터 보강

**파일**: `webhard-api/prisma/seed.ts`

`seedContacts` 내부 contact 배열에 `is_urgent=true` 1건 추가 (idempotent — 이미 있으면 skip):

```ts
{
  // ...기존 패턴의 contact 필드...
  inquiryTitle: '[E2E 긴급 테스트] 테두리 비닐 긴급 작업',
  companyName: '[E2E 긴급] 샘플업체',
  isUrgent: true,
  urgentAt: new Date(),
  source: 'webhard',
  // contact ID 는 upsert 로 deterministic 하게: TEST_URGENT_CONTACT_ID
},
```

기존 seed 상수와 같은 방식으로 ID 상수화 (`TEST_URGENT_CONTACT_ID = '00000000-0000-4000-8000-000000000017'` 등). E2E S7 에서 이 ID 로 locator.

### 2. E2E 스펙 작성

**신규 파일**: `e2e/contact-feedback-pack.spec.ts`

7 시나리오를 `test.describe('contact-feedback-pack', ...)` 안에 각 `test()` 블록으로 구현.

- **S1 (피드백 1)** — classify CTA 에 ring/pulse 없음:
  - admin 로그인 → `/admin/contacts?inquiry_type=unclassified`
  - "미분류" 뱃지 className 에 `ring-orange-300`, `animate-pulse` 부재 assert
  - `[role="group"][aria-label="문의 유형 분류"]` 의 className 에 `gap-2` 포함 assert

- **S2 (피드백 3)** — 분류 이벤트에 actorName 노출:
  - admin 로그인 → 미분류 카드의 "칼선의뢰로 분류" 버튼 클릭
  - 카드 펼침 → 타임라인의 첫(최신) `inquiry_type_change` entry 가 `admin|관리자` 문자열 포함

- **S3 (피드백 4)** — 실시간 timeline 갱신:
  - 2 contexts: `browser.newContext({ storageState: 'e2e/.auth/admin.json' })` + `browser.newContext({ storageState: 'e2e/.auth/worker.json' })`
  - admin 탭: target contact 카드 펼침 → 현재 timeline entry 수 기록
  - worker 탭: 같은 contact 에 도면 v2 업로드 (`DrawingRevisionModal` 경로)
  - admin 탭: 5초 내 timeline entry 수 +1 assert (reload 없이)

- **S4 (피드백 5)** — timeline ASC 정렬:
  - admin 로그인 → contact 펼침
  - `page.getByTestId('timeline-label').allTextContents()` → 첫 entry 가 `문의 접수|created` 키워드, 마지막 entry 가 가장 최신 이벤트 키워드
  - createdAt ASC 증가 검증 (각 entry 옆 날짜 문자열 파싱)

- **S5 (피드백 6)** — worker 카드 다운로드 = 최신 리비전:
  - seed 에서 target contact 에 v2 revision 삽입 (fileName 예측 가능)
  - worker 로그인 → 해당 카드 다운로드 아이콘 클릭 → `page.waitForEvent('download')`
  - `download.suggestedFilename()` 에 v2 키워드 포함, v1 키워드 부재

- **S6 (피드백 7)** — worker session 에서 타임라인 파일 다운로드 200:
  - worker 로그인 → contact 펼침 → 타임라인 FileRow 다운로드 버튼 클릭
  - `page.waitForResponse(r => r.url().includes('/api/drawing-revisions/') && r.url().includes('/download'))` → `response.status() === 200`

- **S7 (피드백 8)** — 긴급 overlay:
  - admin 로그인 → TEST_URGENT_CONTACT_ID 문의로 이동 (검색 or 직접 URL)
  - 카드 루트 className 에 `bg-red-500` 부재 assert
  - `text='긴급'` visible, lucide Siren SVG visible (`svg.lucide-siren` 또는 배지 내부 SVG 개수)

Playwright helpers 신규 (`e2e/helpers/timeline-helpers.ts`) 생성 여부는 재사용 2회 이상 이벤트에서만.

### 3. CHANGELOG 최종 기입

**파일**: `docs/changelog/CHANGELOG.md`

Phase 0 의 skeleton 을 다음 본문으로 교체:

```markdown
### 2026-04-20 — contact-feedback-pack (task 17)

- **변경**: 미분류 분류 CTA 의 `ring-2 ring-orange-300 animate-pulse` 제거. 2버튼 간격 `gap-1 → gap-2`. 시각 소음 완화.
- **변경**: 통합 타임라인 정렬 `DESC → ASC` (오래된 → 최신 순).
- **변경**: 타임라인 분류 이벤트에 작업자명(`actorName`) 상시 노출.
- **신규**: `GET /api/contacts/:id/latest-drawing/download` 엔드포인트. Worker 카드 및 Admin 첨부파일 도면 다운로드가 최신 `DrawingRevision` 파일을 받도록 전환.
- **버그 수정**: `GET /api/drawing-revisions/:id/download` 에 ERP worker 세션 허용. 작업자 타임라인 다운로드 401 해소.
- **변경**: `contact:drawing_revision_added` 등 소켓 이벤트로 펼쳐진 타임라인 실시간 갱신.
- **변경**: 긴급(`is_urgent`) 표시 통일 — Worker 카드 붉은 배경 제거, Admin/Worker 공용 `[Siren + "긴급"]` 붉은 배지 overlay. 카드 배경/border 일반과 동일.
- **영향 파일**: `src/components/contacts/InquiryClassifyButtons.tsx`, `src/app/(admin)/admin/contacts/_components/{InquiryTypeBadge,ContactCardHeader,ContactDetailView}.tsx`, `src/components/ContactTimeline.tsx`, `src/app/worker/_components/{OfficeContactCard,StaffContactCard}.tsx`, `src/app/worker/_lib/downloadFiles.ts`, `src/app/api/contacts/[id]/latest-drawing/download/route.ts` (신규), `src/app/api/drawing-revisions/[revisionId]/download/route.ts`, `src/lib/api/nestjs-server-client.ts`, `src/app/(admin)/admin/contacts/_lib/hooks.ts`, `src/app/worker/dashboard/page.tsx`, `webhard-api/src/contacts/{contact-timeline.service,contacts.controller}.ts`, `webhard-api/prisma/seed.ts`.
```

### 4. 스펙 미세 조정

Phase 1-5 실제 구현과 Phase 0 스펙 비교:

- `inquiry-classification-ux.md` §9 — className diff 실제와 일치?
- `contact-urgent-ui.md` — Siren 아이콘 class, 배지 색 실제와 일치?
- `drawing-revision-history.md` — 신규 API 경로, 응답 스키마 최종.
- `nextjs-routes.md`, `endpoints/integration.md` — 시그니처 일치.

불일치 발견 시 **스펙을 코드 기준으로 수정** (코드는 Phase 6 에서 수정 금지).

### 5. E2E 실행 (수동 검증)

```bash
pnpm dev:all
cd webhard-api && npx prisma db seed
npx playwright test e2e/contact-feedback-pack.spec.ts
```

7 시나리오 pass 확인.

### 6. 통합 게이트

```bash
pnpm build && npx tsc --noEmit && pnpm test && cd webhard-api && pnpm build && pnpm test
```

## Acceptance Criteria

**통합 게이트**:

```bash
pnpm build && npx tsc --noEmit && pnpm test && cd webhard-api && pnpm build && pnpm test
```

**E2E**:

```bash
npx playwright test e2e/contact-feedback-pack.spec.ts
```

위 두 블록 모두 통과 시 phase 6 status `"completed"` + `tasks/index.json` 의 task 17 status `"completed"` 마킹. E2E 가 환경 이슈로 실패 시 (Playwright 브라우저 미설치 등) `"error_message"` 에 "E2E 환경 이슈, 통합 게이트 통과" 를 명시하고 completed 마킹 가능.

## 주의사항

- 이 phase 는 **E2E + docs 동기화** 중심. Phase 1-5 의 코드 로직을 건드리지 말 것 (스펙-코드 불일치 시 스펙 수정).
- Seed 추가는 **idempotent** — 기존 urgent contact 있으면 skip.
- S3 (실시간) 는 race 조심. timeout 5000ms.
- S5 (최신 도면) 는 seed 에서 target contact 에 v2 revision 미리 삽입 필요. `DrawingRevision` 레코드 + `WebhardFile` 레코드 동기화까지 seed 에서 처리.
- S6 에서 worker 로그인 시 seed 된 PIN 사용 (`seedErpWorkers` 결과 참조).
- CHANGELOG 는 **사용자 영향 중심** 간결하게. 파일 리스트는 마지막 "영향 파일" 줄로 모음.
- `docs-diff.md` 는 Phase 0 이후 runner 가 자동 생성 — 추가로 만들지 말 것.
- E2E 실패 시 "실제 구현 버그" 와 "locator/fixture 문제" 를 반드시 구분해서 조치. 구현 버그면 Phase 1-5 로 돌아가 수정 후 재진행 (exception 적으로 허용).
