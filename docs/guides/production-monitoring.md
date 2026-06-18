# Production Monitoring & Debugging Guide

YJ Laser 통합 웹 플랫폼의 프로덕션 모니터링 및 디버깅 가이드.

---

## 1. 모니터링 아키텍처 개요

```
┌──────────────────────────────────────────────────────────┐
│  Vercel (Next.js Frontend)                               │
│  ├── @sentry/nextjs → Sentry (에러 + Session Replay)    │
│  └── Vercel Function Logs                               │
└──────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  Railway (NestJS Backend)                                │
│  ├── @sentry/nestjs → Sentry (에러 + 트레이싱)         │
│  ├── Railway Logs (구조화 로깅)                         │
│  └── GET /api/v1/health → 업타임 모니터링               │
└──────────────────────────────────────────────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────┐
│  외부 모니터링 서비스                                     │
│  ├── BetterStack/UptimeRobot → health endpoint polling  │
│  └── Sentry Alerts → Slack/Discord/Email 알림           │
└──────────────────────────────────────────────────────────┘
```

---

## 2. Sentry — 에러 추적 & 성능 모니터링

### 이미 구성된 항목

- **프론트엔드**: `@sentry/nextjs` (src/instrumentation.ts에서 초기화)
- **백엔드**: `@sentry/nestjs` (webhard-api/src/instrument.ts에서 초기화)
- **DSN**: `NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN` 환경변수

### Sentry 알림 규칙 설정

Sentry 대시보드 (https://sentry.io) → Project Settings → Alerts에서 설정:

| 규칙             | 조건                        | 액션                  |
| ---------------- | --------------------------- | --------------------- |
| 새 이슈 발생     | New issue created           | Slack/Email 즉시 알림 |
| 에러 급증        | Error count > 10 in 1 hour  | Slack 알림            |
| 성능 저하        | P95 latency > 3s for 10 min | Slack 알림            |
| 미해결 이슈 증가 | Unresolved issues > 5       | 일간 요약 이메일      |

### Slack 연동 방법

1. Sentry → Settings → Integrations → Slack
2. Slack 워크스페이스 연결
3. 알림 채널 선택 (예: #yjlaser-alerts)
4. Alert Rules에서 Slack 액션 추가

### 유용한 Sentry 기능

- **Session Replay**: 사용자 행동을 비디오로 재생 (프론트엔드 전용)
- **Breadcrumbs**: 에러 발생 전 사용자/시스템 행동 추적
- **Performance**: API 응답 시간, DB 쿼리 시간 추적
- **Release Tracking**: 배포 버전별 에러 그룹핑

---

## 3. BetterStack (구 Better Uptime) — 업타임 모니터링

### 설정 방법

1. https://betterstack.com 계정 생성 (무료 티어: 모니터 5개)
2. Monitors → Create Monitor:

| 모니터           | URL                                     | 주기  | 방법 |
| ---------------- | --------------------------------------- | ----- | ---- |
| NestJS API       | `https://api.yjlaser.net/api/v1/health` | 60초  | GET  |
| Next.js Frontend | `https://yjlaser.net`                   | 60초  | GET  |
| WebSocket        | `https://api.yjlaser.net/api/v1/health` | 300초 | GET  |

3. Alerting → 알림 채널 설정:
   - Email (기본)
   - Slack Webhook (선택)
   - SMS (유료)

### 대안: UptimeRobot

- https://uptimerobot.com (무료 티어: 모니터 50개)
- 설정 방식 유사, 5분 간격 모니터링

---

## 4. Railway 로그 활용

### 로그 확인 방법

1. https://railway.app → 프로젝트 선택 → NestJS 서비스
2. Logs 탭 클릭
3. 검색 기능으로 키워드 필터링:
   - `ERROR` — 에러 로그
   - `AuditLog` — API 감사 로그 (엔드포인트, 사용자, 응답 시간)
   - `warn` — 경고 (느린 API, 재시도 등)

### 로그 검색 패턴

```
# 특정 에러 찾기
ERROR CompanyAccessGuard

# 특정 사용자 API 호출 추적
user=company:116

# 느린 API 찾기
Slow NestJS API

# 인증 실패 추적
UnauthorizedException
```

### 로그 집계 (Axiom 연동, 선택사항)

Railway에 Axiom 로그 드레인 추가:

1. https://axiom.co 계정 생성 (무료 티어: 500MB/월)
2. Settings → API Tokens → 토큰 생성
3. Railway → Service → Settings → Log Drains → Axiom 선택
4. Axiom에서 대시보드 생성, 쿼리 실행

---

## 5. Health Endpoint 활용

### 기본 Health Check

```bash
# 기본 상태 확인 (인증 불필요)
curl https://api.yjlaser.net/api/v1/health
# 응답: { "status": "ok", "uptime": 3600, "timestamp": "2026-04-03T..." }
```

### 상세 Health Check

```bash
# 상세 상태 확인 (API Key 필요)
curl -H "X-API-Key: YOUR_API_KEY" \
  https://api.yjlaser.net/api/v1/health/detailed
# 응답: { "status": "ok", "database": { "ok": true, "responseTime": 5 }, "memory": {...} }
```

### 관리자 대시보드

`/admin/integration/health` — 시스템 상태 실시간 모니터링:

- API 서버 상태 + 응답 시간
- DB 연결 상태 + 쿼리 시간
- 메모리 사용량
- 서버 가동 시간

---

## 6. 프로덕션 디버깅 워크플로우

이슈 발생 시 다음 순서로 디버깅:

### Step 1: 증상 확인

- 사용자 리포트 또는 모니터링 알림 확인
- 이슈 유형 분류: 에러? 성능 저하? 접속 불가?

### Step 2: Sentry 대시보드 확인

1. Sentry → Issues → 최근 이슈 확인
2. 이슈 클릭 → 상세 정보:
   - **Breadcrumbs**: 에러 발생 전 사용자 행동
   - **Stack Trace**: 에러 발생 위치
   - **Tags**: 환경, 브라우저, OS 정보
   - **Session Replay** (프론트엔드): 실제 사용자 화면 재생
3. 관련 이슈 그룹핑 확인 (같은 근본 원인인지)

### Step 3: 서버 로그 확인

**NestJS (Railway):**

1. Railway 대시보드 → Logs
2. Sentry에서 확인한 시간대로 필터링
3. 에러 전후 맥락 확인 (같은 시간대의 다른 요청)

**Next.js (Vercel):**

1. Vercel 대시보드 → Functions → Logs
2. API 라우트 에러 확인
3. SSR 에러 확인

### Step 4: DB 상태 확인

```bash
# Prisma Studio로 데이터 확인
cd webhard-api && npx prisma studio

# 또는 직접 SQL
psql $DATABASE_URL -c "SELECT * FROM companies WHERE id = 116;"
```

### Step 5: 로컬 재현

1. 프로덕션 환경변수 복사 (DB URL은 별도 주의)
2. 동일한 사용자 계정으로 테스트
3. 네트워크 탭에서 API 응답 확인
4. 서버 로그에서 상세 에러 확인

### Step 6: 수정 및 배포

1. 로컬에서 수정 + 테스트
2. `npx tsc --noEmit` + `pnpm lint` 통과 확인
3. 커밋 + 푸시
4. Vercel (자동 배포) / Railway (자동 배포) 확인
5. 배포 후 Sentry에서 이슈 해결 확인

---

## 7. 체크리스트: 프로덕션 배포 전

- [ ] Sentry DSN 환경변수 설정 (`SENTRY_DSN`)
- [ ] Health endpoint 동작 확인 (`/api/v1/health`)
- [ ] BetterStack/UptimeRobot 모니터 설정
- [ ] Sentry 알림 규칙 설정 (Slack/Email)
- [ ] Railway 로그 확인 방법 숙지
- [ ] 프로덕션 디버깅 워크플로우 숙지

---

## 8. 도구 접속 링크

| 도구         | URL                     | 용도                     |
| ------------ | ----------------------- | ------------------------ |
| Sentry       | https://sentry.io       | 에러 추적, 성능 모니터링 |
| Railway      | https://railway.app     | NestJS 로그, 배포        |
| Vercel       | https://vercel.com      | Next.js 로그, 배포       |
| BetterStack  | https://betterstack.com | 업타임 모니터링          |
| Axiom (선택) | https://axiom.co        | 로그 집계/분석           |
