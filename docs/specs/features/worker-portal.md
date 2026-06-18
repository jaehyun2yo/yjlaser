# FEAT-011: Worker Portal — 현장 작업자 전용 작업페이지

## Overview

현장작업자가 `worker.yjlaser.com` 서브도메인으로 접근하여 당일/잔여 작업을 확인하고,
작업 상태를 변경할 수 있는 전용 포털. 관리자는 작업자 등록, IP 접근제어, 로그 수집으로 보안 관리.

## Status: IN_PROGRESS

## Completion Criteria

- [ ] `worker.yjlaser.com` 서브도메인 접속 → `/worker/*` 라우트 매핑
- [ ] IP 화이트리스트 기반 접근 제어 (작업자별 허용 IP 설정)
- [ ] 접근 로그 수집 (로그인 성공/실패, IP, User-Agent)
- [ ] 관리자 IP 관리 UI (CRUD + 로그 조회)
- [x] PIN brute-force 방어 (5회 실패/5분/IP, access log 기반)
- [ ] 당일/잔여 작업 대시보드 (공정별 카운트, 우선순위)
- [ ] 작업 상태 변경 강화 (메모, 이슈 보고)
- [x] 작업 파일 열기 (웹하드 연결) <!-- 구현: WorkerContextMenu 의 "웹하드에서 열기" 메뉴 항목 (task 22 contact-webhard-navigate) -->
- [ ] 관리자 실시간 워크플로우 모니터링
- [ ] 보안 대시보드 (접근 로그, 외부 IP 감지)

## Architecture

### Routing

```
worker.yjlaser.com → middleware.ts → /worker/* routes
yjlaser.com/worker/* → same routes (backward compatible)
```

### Auth Flow

```
Worker → Next /api/erp/session → NestJS PIN Login → signed httpOnly erp-session → Access
                      ↓                 ↓                         ↓
                 forward IP/UA      access_log          getErpWorkerSession guard
```

### DB Schema Changes

#### erp_workers (modify)

```sql
ALTER TABLE erp_workers ADD COLUMN allowed_ips TEXT[] DEFAULT '{}';
```

- Empty array = allow all IPs (no restriction)
- Non-empty = only listed IPs allowed

#### worker_access_logs (new table)

```sql
CREATE TABLE worker_access_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_id UUID REFERENCES erp_workers(id),
  ip_address VARCHAR(45) NOT NULL,
  user_agent TEXT,
  action VARCHAR(30) NOT NULL, -- 'login_success', 'login_failed', 'ip_blocked', 'logout'
  success BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_access_logs_worker ON worker_access_logs(worker_id);
CREATE INDEX idx_access_logs_created ON worker_access_logs(created_at DESC);
CREATE INDEX idx_access_logs_ip ON worker_access_logs(ip_address);
```

### Security Model

| Threat              | Mitigation                             |
| ------------------- | -------------------------------------- |
| PIN brute-force     | Rate limit (5 attempts/5min per IP)    |
| IP spoofing         | X-Forwarded-For + Vercel trusted proxy |
| Session hijack      | httpOnly cookie + IP binding           |
| Unauthorized access | IP whitelist + PIN auth                |
| Data leak           | Company users cannot access /worker/\* |

### Worker session boundary (2026-05-19)

- Browser clients must create Worker sessions through `POST /api/erp/session` with `{ name, pin }`.
- `POST /api/erp/session` forwards the PIN login attempt to NestJS `POST /api/v1/erp/workers/pin-login` and only sets `erp-session` when the backend returns `success=true` with a worker.
- `workerId`/`workerName` request bodies are not session proof and must not create cookies.
- Next.js worker APIs and Server Actions must call `getErpWorkerSession()` before server-to-server NestJS API key calls. Failed verification returns 401 or action failure before touching backend state.
- Worker/admin actor mutation calls to NestJS contacts endpoints must use session cookie authentication instead of API key authentication. NestJS only accepts worker `erp-session` on routes explicitly marked for worker access, rejects API-key requests that claim `actorType='worker'`, and derives the worker actor name from the verified session. Company drawing revision requests remain company-session based and require contact ownership verification before the backend records a `company` actor.
- Worker actor mutation calls must forward only `erp-session` and `csrf-token` to NestJS. Browser sessions can contain stale `admin-session` or `company-session` cookies from another dashboard; forwarding those alongside `erp-session` lets NestJS choose the wrong session before worker verification and can produce `Verified worker session required` 403 errors.
- Worker file/drawing proxy routes (`/api/worker/files`, `/api/worker/files/:id/download`, `/api/worker/drawing-revisions`, `/api/worker/drawing-revisions/upload-urls`) use the same worker-only forwarded cookie scope. They must not pass the raw browser Cookie header to NestJS.
- Worker 로그인은 `erp-session`과 함께 non-httpOnly `csrf-token`을 발급한다. 기존 세션 등으로 csrf cookie가 없는 경우에도 worker Server Action과 worker route proxy는 NestJS upstream 요청에 한해 matching `csrf-token` cookie/header를 생성해 session mutation이 `CSRF token missing`으로 실패하지 않게 한다.
- Worker 메모/이슈 보고는 `POST /api/v1/contacts/:id/notes`를 사용하며, `createdBy`는 클라이언트 body가 아니라 검증된 worker session 이름으로 확정한다. Contacts 응답의 `worker_notes` 내부 항목은 화면 계약에 맞게 `created_by`, `created_at`, `updated_at` snake_case로 내려가야 한다.
- `/api/socket-auth` issues Worker socket tokens only after `getErpWorkerSession()` succeeds.
- Worker pages that fetch process-board data must either have a server-side route guard or React Query `enabled` condition tied to verified/hydrated Worker session state.
- Worker login must not persist raw PIN in localStorage. The durable auth state is the httpOnly `erp-session` cookie.

### PIN brute-force policy (2026-05-13)

- 기준 데이터는 `worker_access_logs`의 `login_failed` action이다.
- 동일 IP에서 최근 5분 동안 실패가 5회 이상이면 `WorkersService.pinLogin`은 worker lookup 전에 차단한다.
- 차단 응답은 `success=false`, `worker=null`, `reason='rate_limited'`, `retry_after_seconds`를 포함한다.
- 잘못된 이름/PIN은 `reason='invalid_credentials'`, IP whitelist 차단은 `reason='ip_blocked'`를 반환한다.
- 실패 로그 metadata에는 `reason`, `failedAttempts`, `retryAfterSeconds`, `attemptedName` 등 진단 가능한 값만 기록하고 PIN 원문은 기록하지 않는다.
- Worker 로그인 화면의 관리자 문의 안내는 최초 진입 시 숨기고, 로그인 실패 후에만 `이름과 PIN을 입력해주세요` 문구 바로 아래와 작업자 이름 입력 영역 위에 표시한다.

### Hardening backlog

Worker portal hardening 범위는 [worker-hardening-roadmap.md](./worker-hardening-roadmap.md)에서 ticket 단위로 관리한다. 남은 큰 축은 subdomain routing, IP whitelist admin UI, access log viewer, security dashboard, 운영 realtime/session auth 검증이다.

## Implementation Phases

### Phase 1: Infrastructure (Security + Routing)

1. Subdomain routing middleware
2. DB schema migration (allowed_ips, access_logs)
3. IP validation + access logging in middleware & API
4. Admin IP management UI

### Phase 2: Worker Page Enhancement

5. Daily/remaining task dashboard
6. Enhanced status change (memo, issue report)
7. Work file viewer (webhard integration)

### Phase 3: Admin Integration

8. Real-time workflow monitoring
9. Security dashboard

## Dependencies

- Vercel domain config: `worker.yjlaser.com` must be added manually
- Existing: Socket.IO (NestJS Gateway), NestJS ERP module, Prisma ORM

## Worker 대시보드 카드 CTA 원칙 (task 16 이후)

- 미분류 카드의 분류 CTA 는 **advance 버튼 자리**(`OfficeContactCard` 오른쪽 버튼 그룹) 를 공용 `InquiryClassifyButtons` 가 대체한다. `OfficeAdvanceButton` 의 기존 `disabled "분류 필요"` 뱃지 fallback 은 제거된다.
- 왼쪽 `InquiryTypeBadge` 는 `mode='label-only'` 로 단일 주황 "미분류" 뱃지만 렌더한다. 상세 UX 계약은 [inquiry-classification-ux.md](./inquiry-classification-ux.md) §8 참조.

## Worker 대시보드 헤더

- Worker 대시보드 상단 헤더 중앙에는 현재 날짜와 시각을 분리해 표시한다.
- 날짜는 `26년 M월 D일 요일` 형식으로 시간 위에 배치하고 큰 볼드 텍스트로 표시한다.
- 시간은 `오전/오후 H시 m분` 형식으로 날짜 아래에 보조 텍스트로 표시한다.
- 헤더 시각은 페이지를 열어둔 상태에서도 분 단위로 자동 갱신한다.
- 좁은 화면에서는 알림, 납품관리, 로그아웃 액션과 겹치지 않도록 현재 시각 표시를 숨긴다.
- 우하단 고정 `새로고침` floating 버튼은 표시하지 않는다.

## Worker 문의 카드 리스트 렌더링

- Worker 대시보드의 사무실/현장 문의 카드 리스트는 최초 20개를 렌더하고, 스크롤 하단 접근 시 20개씩 추가 렌더링한다.
- 탭, 공정 필터, 검색어가 바뀌면 렌더 배치를 초기화하고 현재 조건의 첫 묶음부터 표시한다.
- 새 문의 알림 클릭으로 이동할 카드가 아직 렌더되지 않은 배치에 있으면 해당 카드 위치까지 먼저 렌더한 뒤 스크롤한다.

## Worker 통합 검색

- Worker 대시보드 검색 입력은 현재 선택된 탭만 대상으로 하지 않고 사무실 작업, 현장 작업, 납품관리 대기/완료 건을 함께 검색한다.
- 검색어가 있으면 입력 아래에 결과 드롭다운을 아래로 열리는 애니메이션으로 표시한다.
- 검색 결과 드롭다운은 `ArrowDown`/`ArrowUp`으로 선택 항목을 이동하고, `Enter`로 선택 항목으로 이동하며, `Escape`로 닫을 수 있어야 한다.
- 검색 결과 드롭다운은 처음 12개 항목만 렌더하고, 드롭다운 스크롤 하단 접근 시 다음 12개를 추가 렌더링한다.
- 검색 결과에는 `사무실 작업`, `현장 작업`, `납품관리`, `납품완료` scope label과 업체명-파일명, 문의번호/웹하드 경로 보조 정보를 표시한다.
- 사무실/현장 검색 결과를 클릭하면 검색어를 지우고 해당 탭과 공정 필터로 이동한 뒤 대상 문의 카드를 스크롤·강조한다.
- 납품관리 검색 결과를 클릭하면 `/worker/delivery?tab=pending&highlight={contactId}`로 이동하고 납품 대기 카드가 스크롤·강조된다.
- 납품완료 검색 결과를 클릭하면 `/worker/delivery?tab=completed&highlight={contactId}&search={query}`로 이동하고, 완료 탭에서 날짜 필터에 가려지지 않도록 검색어 기준으로 대상 카드를 조회·스크롤·강조한다.
- 납품완료 검색 이동 대상 카드는 기본 배경과 highlight 배경이 충돌하지 않아야 하며, brand ring과 왼쪽 bar로 명확히 강조한다.
- 납품 완료 이력은 대시보드 검색어가 있을 때만 별도 조회해 통합 검색 소스에 합치며, 서버 검색 조건에 파일명이 없어도 대시보드 공통 검색식으로 파일명을 다시 필터링한다.
- 납품완료 탭의 검색도 서버 검색 조건에만 의존하지 않고 조회된 완료 목록을 업체명/문의번호/작업번호/파일명 기준으로 로컬 필터링해 대시보드 검색 이동 대상이 유지되어야 한다.
- 납품완료 탭에서 URL `highlight` 대상이 현재 검색 결과에 없으면 해당 납품완료 문의를 단건 조회해 렌더 목록에 포함하고, 실제 DOM 렌더 후 스크롤을 재시도해야 한다.

## Worker 확장 영역 로딩

- Worker 문의 카드 확장 타임라인은 좌우로 흐르는 shimmer 스켈레톤을 사용한다.
- Worker 문의 카드 확장 타임라인 스켈레톤은 다른 공용 스켈레톤보다 빠른 highlight와 은은한 pulse를 적용해 로딩 중 반짝이며 움직이는 느낌이 명확해야 한다.
- 납품 완료 목록 초기 로딩은 회전 아이콘 대신 카드형 shimmer 스켈레톤을 표시한다.
- 납품 완료 카드 확장 패널은 타임라인과 납품 증빙 이미지가 모두 준비되기 전까지 전체 스켈레톤을 유지하고, 모든 요소가 준비되면 실제 콘텐츠를 함께 표시한다.

## Worker 긴급 이력

- Worker/Admin 긴급 토글은 현재 검증된 세션 actor를 기준으로 타임라인 이력을 생성한다.
- 긴급 배치 시 `ContactStatusHistory.changeType='urgent_toggle'`, `fromStatus='normal'`, `toStatus='urgent'`로 기록한다.
- 긴급 해제 시 `ContactStatusHistory.changeType='urgent_toggle'`, `fromStatus='urgent'`, `toStatus='normal'`로 기록한다.
- `contacts.is_urgent`/`urgent_at` 업데이트와 `urgent_toggle` 타임라인 기록은 같은 트랜잭션으로 처리되어 둘 중 하나만 반영되는 상태가 없어야 한다.
- Worker/Admin 타임라인은 `toValue='urgent'`를 `긴급 처리`, `toValue='normal'`을 `긴급 해제`로 표시하고, `showActor`가 켜진 화면에서는 `— 작업자명`을 함께 표시한다. 시각은 타임라인 행의 `createdAt`을 사용한다.
- Worker 대시보드에서 긴급 토글이 성공하면 해당 문의의 `contacts.timeline(contactId)` 쿼리를 즉시 invalidate/refetch해 이미 펼쳐진 카드에도 이력이 바로 보여야 한다.
- 기존 데이터처럼 `contacts.is_urgent=true`와 `contacts.urgent_at`만 있고 `urgent_toggle` 이력이 없는 문의는 `urgent_at` 기준 `긴급 처리` fallback 이력을 표시한다. 이 경우 과거 actor를 알 수 없으므로 actorName은 비워 둔다.
- 거래처 세션 타임라인에는 내부 긴급 관리 이력을 노출하지 않는다.

## 도면 업로드 (task 19 이후)

Worker 카드에서 열리는 도면 업로드 모달(`WorkerDrawingUploadModal`)은 공용 `BaseModal` 위에 다음 UX 요구사항을 만족한다. 서버 업로드 자체는 `POST /api/v1/contacts/:id/drawing-revisions` 를 재사용 — Revision 레코드 생성 + WebhardFile 자동 등록. 사유 선택은 메타(reason)로만 기록되며 서버 매핑은 변경 없음.

- **인증 전달**: Next.js Worker 도면 업로드 proxy는 `getErpWorkerSession()` 검증 후 NestJS에 `erp-session`/`csrf-token`만 전달한다. 브라우저에 admin/company 쿠키가 남아 있어도 raw Cookie header를 그대로 전달하지 않아야 한다.
- **드래그드랍**: 파일 선택 영역(드롭존) 에 파일을 드롭하면 `<input type="file">` 선택과 동일한 validate 로직(확장자, 크기)을 통과시켜 업로드한다. 드래그 상태 동안 드롭존에 `data-drag-active` 속성 + `border-[#ED6C00] bg-orange-50` 하이라이트로 시각 피드백을 제공 (동일 영역이 클릭과 드롭 양쪽을 겸한다 — 별도 드롭존 신설 금지).
- **모달 잠금**: 오버레이 클릭 / ESC 키 / `body` scroll lock 은 공용 `BaseModal` 이 자동 처리 — 모달 내부에서 별도 핸들러 추가 금지. 뒤 영역 스크롤·클릭이 차단되어야 한다. `BaseModal` 의 `title` + `subtitle` 슬롯을 사용해 "도면 업로드 / {업체명}" 을 렌더한다.
- **`webhardWarning` 경고**: 업로드 응답에 `webhardWarning` 이 있으면 성공 모달 메시지에 "(웹하드 경고: {message})" 를 append 하여 노출 (`ConfirmModal` 재사용 — 별도 toast 유틸 없음). Revision 레코드 자체는 성공 저장된 상태. code 에 따른 의미 매핑은 `drawing-revision-history.md §7.1` 참고.
- **타임라인 실시간 반영**: 본인 업로드는 mutation onSuccess 에서 `queryClient.refetchQueries({ queryKey: queryKeys.contacts.timeline(contactId), type: 'active' })` + `queryClient.invalidateQueries({ queryKey: queryKeys.contacts.detail(contactId) })` 를 `Promise.all` 로 동시 발사 — 열려 있는 내 카드는 즉시 refetch 되고, 카드 헤더의 최신 revision 번호 등 상세 정보도 재조회된다. 타 사용자 업로드는 카드 레벨 훅 `useTimelineRealtime(contactId, expanded)`(`src/app/worker/_components/useTimelineRealtime.ts`) 가 `contact:drawing_revision_added` 소켓 이벤트를 구독하되 `enabled: expanded` 로 닫힌 카드 N+1 구독을 방지한다. 이벤트 payload 의 `contactId` 가 일치할 때만 같은 refetch 를 트리거. `useContactTimeline` 의 `staleTime` 은 30초 — 닫힌 카드 → 다시 펼치는 경우에도 30초 지난 뒤면 자동 refetch 되므로 장시간 stale 이 누적되지 않는다 (Worker dashboard 레벨 전역 소켓 구독은 기존 그대로 유지).

## 새 문의 알림 (2026-05-12)

- Worker 대시보드 헤더의 `납품관리` 왼쪽에는 새 문의 알림 드롭다운이 있다. 알림 목록은 브라우저 storage에 보존되어 새로고침 후에도 유지되며, `비우기`로 초기화한다.
- 알림 항목은 `readAt` 읽음 상태를 가진다. legacy storage 항목처럼 `readAt`이 없으면 미확인(`readAt=null`)으로 복구한다.
- 미확인 알림 항목은 앞에 `bg-error` 빨간 점과 `animate-ping` 강조 효과를 표시한다. 항목을 클릭해 문의로 이동하면 해당 알림은 읽음 처리되지만 드롭다운은 닫지 않는다. 읽음 항목은 목록에 남되 빨간 점을 숨기고 회사명/파일명을 밝은 회색 텍스트로 표시한다.
- 읽음 처리 직후에는 항목 위치를 유지한다. 새 문의 드롭다운을 닫을 때 storage 목록을 미확인 알림 우선, 확인된 알림 후순위로 재정렬한다.
- `readAt` 기준 3일이 지난 읽음 알림은 페이지 로드 또는 새 문의 드롭다운 close 시점에 storage 목록에서 제거한다. 미확인 알림은 3일이 지나도 제거하지 않는다.
- `모두 확인`은 현재 드롭다운의 모든 알림을 읽음 처리한다. `비우기`만 storage 목록을 제거하고 드롭다운을 닫는다.
- 알림 목록에 남아 있는 미확인 문의 카드만 같은 `bg-error` 빨간 점을 표시한다. 카드 루트 클릭, 카드 액션 클릭, 작업상태 변경, 알림 항목 클릭은 해당 문의 알림을 읽음 처리해 카드의 새 문의 빨간 점을 제거한다.
- 새 문의 알림 목록은 처음 12개만 렌더하고, 스크롤 하단 접근 시 다음 묶음을 추가 렌더링한다.
- 알림 드롭다운은 header/list/empty 상태 모두 넓은 상하좌우 padding을 사용하고 viewport collision 여백도 충분히 둔다.
- `contact:created` 수신 시 Worker process board의 field/office/unclassified 쿼리를 즉시 무효화한다. 알림 표시는 payload만으로 먼저 생성하므로 목록 refetch보다 빠르게 사용자에게 도착 사실을 보여준다.
- 알림 항목 클릭 시 `source='webhard' && inquiry_type=null`은 사무실/미분류, `process_stage`가 `drawing_confirmed|laser|cutting|creasing`이면 현장/해당 공정, 그 외는 사무실/해당 공정 시작 전 또는 사무실 공정 필터로 이동한다.
- 카드 루트는 `worker-contact-{contactId}` id를 제공해야 하며, 알림 클릭 후 해당 요소로 스크롤한다. 이동한 카드는 `border-brand`/`ring-brand`/`bg-brand-light`로 잠시 강조 표시한 뒤 자동 해제한다.
- Worker 문의 카드의 문의번호는 사무실번호와 현장번호가 모두 있을 때만 `O / F` 형식으로 표시한다. 한쪽 번호만 있으면 `/` 자리표시자를 렌더하지 않고 번호만 표시한다.
- Worker 문의 카드의 생성시간은 오른쪽 버튼 그룹에서 다운로드 아이콘 왼쪽에 `26년 5월 12일 오전 10시 57분` 형식의 `text-gray-500` 텍스트로 표시한다.
- Worker 문의 카드 헤더는 기존 flex 구조를 유지하며, 오른쪽 생성시간·아이콘·펼치기 표시의 중심선을 가운데 제목 줄에 맞춘다.
- Worker 문의 카드의 표시 파일명은 화면에서만 `업체명 - 파일명` 형식으로 정리한다. 업체명은 굵은 글씨, 구분자와 파일명은 보통 두께로 표시한다. `inquiry_title`/패키지명은 카드 파일명 라인에 섞지 않고, 실제 WebhardFile.name 또는 R2 key는 변경하지 않는다.
- Worker 문의 카드의 다운로드 파일명은 `문의번호 - 업체명 - 파일명` 형식이다. 기존 파일명에 `[O]`/`[F]` prefix, 같은 다운로드 prefix, 짧은 `O-001`/`F-001` prefix가 이미 있으면 제거하고 한 번만 붙인다.
- Worker 타임라인의 도면 수정 파일 다운로드도 같은 저장명 규칙을 적용한다. `/api/drawing-revisions/:revisionId/download`가 반환한 파일명을 실제 저장명으로 사용해야 하며, presigned R2 URL을 직접 열지 않고 blob 다운로드를 사용해 cross-origin 환경에서도 브라우저가 원본 R2 파일명으로 저장하지 않게 한다.
- Worker 타임라인의 도면 파일 행은 별도 `다운로드` 텍스트 버튼 없이 파일 행 전체가 다운로드 컨트롤로 동작한다. 파일명 뒤에는 다운로드 아이콘 1개만 표시한다.

## Related

- FEAT-004: /worker/tasks (existing)
- FEAT-010: work-management board redesign
- [inquiry-classification-ux.md](./inquiry-classification-ux.md) — 미분류 카드 CTA 정책 (task 16)
