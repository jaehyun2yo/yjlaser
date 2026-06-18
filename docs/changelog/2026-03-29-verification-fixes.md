# 프로젝트 심층 검증 + Critical/High 이슈 수정

**날짜**: 2026-03-29
**브랜치**: `fix/verification-critical-issues`
**변경**: 43 files changed, +925 / -404

---

## 검증 방법

tofu-at Agent Teams (8 워커, 2-Phase 병렬 검증)으로 프로젝트 전체를 스캔.
이후 5-worker 팀으로 수정 작업 병렬 수행.

---

## 수정 완료 항목

### 🔴 Critical (3건 — 전부 수정)

| # | 이슈 | 파일 | 수정 내용 |
|---|------|------|----------|
| C1 | TOCTOU Race Condition | `inventory.service.ts` | batch `$transaction([])` → interactive `$transaction(async tx => {})` + atomic `increment`/`decrement` |
| C2 | 루프 내 개별 트랜잭션 | `events.service.ts` | for 루프 전체를 단일 `$transaction` 으로 감싸기 |
| C3 | 포트폴리오 라이트모드 위반 | `src/app/portfolio/layout.tsx` (신규) | `data-portfolio-page="true"` 전체 적용 |

### 🟠 High (7건 — 전부 수정)

| # | 이슈 | 파일 | 수정 내용 |
|---|------|------|----------|
| H1 | 9개 모듈 DTO 미비 | 16개 DTO 신규 + 9개 컨트롤러 수정 | class-validator DTO 생성, inline 타입/Record<string,unknown> 제거 |
| H2 | BigInt(id) try-catch 없음 | 4개 컨트롤러 + `ParseBigIntPipe` 신규 | `ParseBigIntPipe` 적용, 잘못된 ID에 400 응답 |
| H3 | CORS env 불일치 | `events.gateway.ts`, `integration.gateway.ts` | `CORS_ORIGINS \|\| CORS_ORIGIN` 패턴 통일 |
| H5 | socket.io-client 직접 사용 | `useWebhardSocketRealtime.ts` | `useSocketNamespace` 훅으로 전면 교체 |
| H7 | Global Exception Filter 없음 | `main.ts` + `GlobalExceptionFilter` 신규 | 전역 예외 필터 등록, 스택 트레이스 노출 방지 |
| H8 | window.location.reload() | `ContactCardToggle.tsx` | `queryClient.invalidateQueries()` 로 교체 |
| H9 | `as any` Hard Rule 위반 | `workers.service.ts` | `Prisma.ErpWorkerCreateInput` 명시적 타입 적용 |

### 🟡 Medium (2건 — 전부 수정)

| # | 이슈 | 파일 | 수정 내용 |
|---|------|------|----------|
| M2 | raw queryKey 42건 | 15파일 + `queryKeys.ts` | `queryKeys` factory로 전량 교체, 6개 factory 메서드 추가 |
| M4 | parseInt 수동 파싱 | 10개 컨트롤러 | `ParseIntPipe({ optional: true })` / `DefaultValuePipe` 적용 |

### 📄 Spec 업데이트 (4건 — 전부 수정)

| # | 이슈 | 파일 | 수정 내용 |
|---|------|------|----------|
| S1 | prisma-tables.md 19개 모델 누락 | `docs/specs/db/prisma-tables.md` | 36개 전체 모델 문서화 |
| S2 | Feature Spec Supabase 잔재 | 3개 spec 파일 | Supabase Auth/Realtime → NestJS/Socket.IO |
| S3 | CLAUDE.md 부정확 | `CLAUDE.md` | 모델 수 33→36, 환경변수 3개 추가 |
| S4 | API Spec 미등재 | `nestjs-endpoints.md` | 미등재 모듈 엔드포인트 전체 추가 |

---

## 신규 생성 파일 (20개)

```
src/app/portfolio/layout.tsx
webhard-api/src/common/pipes/parse-bigint.pipe.ts
webhard-api/src/common/filters/global-exception.filter.ts
webhard-api/src/bookings/dto/create-booking.dto.ts
webhard-api/src/bookings/dto/update-booking.dto.ts
webhard-api/src/sessions/dto/upsert-session.dto.ts
webhard-api/src/sessions/dto/delete-session.dto.ts
webhard-api/src/feedback/dto/create-feedback.dto.ts
webhard-api/src/feedback/dto/update-feedback.dto.ts
webhard-api/src/activity-logs/dto/create-activity-log.dto.ts
webhard-api/src/share-links/dto/create-share-link.dto.ts
webhard-api/src/share-links/dto/validate-share-link.dto.ts
webhard-api/src/push-subscriptions/dto/upsert-push-subscription.dto.ts
webhard-api/src/push-subscriptions/dto/delete-push-subscription.dto.ts
webhard-api/src/delivery-companies/dto/create-delivery-company.dto.ts
webhard-api/src/delivery-companies/dto/update-delivery-company.dto.ts
webhard-api/src/sync/dto/update-sync-state.dto.ts
webhard-api/src/public-data/dto/create-portfolio.dto.ts
webhard-api/src/public-data/dto/update-portfolio.dto.ts
```

---

## 미완료 (별도 브랜치 추천)

| # | 작업 | 규모 | 이유 |
|---|------|------|------|
| M1 | `dark:` → `@/lib/styles.ts` 마이그레이션 | 204파일, 2,438건 | 대규모 리팩토링, UI 회귀 테스트 필요 |
| M3 | 상대경로 → `@/` 절대 import | 99파일, 155건 | 대규모, 기능 영향 없음 |
| M5 | CSRF 토큰 구현 | 중 | 아키텍처 설계 필요 |
| T1 | 11개 NestJS 모듈 테스트 추가 | 대 | TDD 별도 세션 |
| T2 | R2 lib 4파일 테스트 | 중 | 목킹 설계 필요 |
| T3 | webhard trash/search/share-links 테스트 | 중 | TDD 별도 세션 |
