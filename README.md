# YJ Laser 통합 웹 플랫폼

유진레이저목형(YJ Laser)의 통합 웹 플랫폼. 레이저 목형 제조 회사의 홈페이지, 관리자 대시보드, 거래처 대시보드, ERP 시스템, 웹하드를 하나의 프로젝트에서 운영한다.

---

## 1. 프로그램 개요

유진레이저목형은 박스 지기구조(패키징) 전문 제조업체로, 2004년 설립되어 레이저 목형, 칼선, 박스 설계 등의 서비스를 제공한다. 이 프로젝트는 해당 업체의 비즈니스 전반을 디지털화한 통합 웹 플랫폼이다.

### 플랫폼 구성 요소

| 구성 요소            | 경로                                   | 설명                                                                 |
| -------------------- | -------------------------------------- | -------------------------------------------------------------------- |
| **홈페이지**         | `/`                                    | 회사 소개, 포트폴리오, 문의 접수                                     |
| **관리자 대시보드**  | `/admin`                               | 문의 관리, 예약 관리, 포트폴리오 관리, ERP, 웹하드 관리, 시스템 설정 |
| **거래처 대시보드**  | `/company`                             | 거래처별 주문 현황, 도면 수정 요청, 웹하드 접근, 청구서              |
| **ERP 시스템**       | `/erp` (모바일), `/admin/erp` (관리자) | 현장 작업 관리, 칸반 보드, 기계 관리, 작업자 관리                    |
| **웹하드**           | `/webhard`                             | 파일 업로드/다운로드, 폴더 관리, 거래처별 파일 공유                  |
| **LGU+ 동기화 도구** | 별도 CLI                               | 외부 LGU+ 웹하드의 파일을 자체 웹하드로 양방향 동기화                |

### 서브 프로젝트 구조

```
yjlaser_website/
├── (루트)                     # Next.js 15 프론트엔드 + API Routes
├── webhard-api/               # NestJS 백엔드 (웹하드 + ERP API)
└── lguplus-webhard-sync/      # LGU+ 웹하드 동기화 CLI 도구
```

---

## 2. 주요 기능별 상세 설명

### 2.1 홈페이지

공개 웹사이트로, 회사 소개와 서비스를 외부에 알리는 역할을 한다.

**주요 페이지:**

| 페이지     | 경로         | 설명                                                                                   |
| ---------- | ------------ | -------------------------------------------------------------------------------------- |
| 메인       | `/`          | Hero 섹션, 박스 전개도 3D 애니메이션, 작업 공정 소개, 포트폴리오 하이라이트, 견적 문의 |
| 회사 소개  | `/about`     | 회사 소개(IntroTab), 연혁(HistoryTab), 설비 현황(FacilityTab), 작업 공정(ProcessTab)   |
| 포트폴리오 | `/portfolio` | 제작 사례 갤러리, 분야별 필터, 상세 페이지(`/portfolio/[id]`)                          |
| 블로그     | `/blog`      | 게시글 목록 및 상세(`/blog/[id]`)                                                      |
| 공지사항   | `/notice`    | 공지사항 목록 및 상세(`/notice/[slug]`)                                                |
| 견적 문의  | `/contact`   | 도면 첨부 가능한 문의 폼, 파일 업로드(R2), 이메일/Slack 알림 발송                      |
| 회원가입   | `/register`  | 거래처 회원가입 (관리자 승인 후 활성화)                                                |
| 로그인     | `/login`     | 관리자/거래처 통합 로그인, 아이디 찾기, 비밀번호 찾기                                  |

**기술적 특징:**

- Hero 섹션: Three.js(`@react-three/fiber`, `@react-three/drei`)로 3D 박스 전개도 애니메이션 구현
- 스크롤 애니메이션: `framer-motion`, `gsap`, `lenis` 기반 부드러운 스크롤 인터랙션
- 포트폴리오 페이지: 항상 라이트 모드(`data-portfolio-page="true"`)
- SEO 최적화: 메타데이터, Open Graph, JSON-LD(Organization), `sitemap.ts`, `robots.ts`
- 이미지 최적화: Next.js Image 컴포넌트, AVIF/WebP 포맷, sharp 기반 최적화

**소스 코드 위치:**

- 메인 페이지: `src/app/page.tsx`
- 홈 섹션 컴포넌트: `src/components/home/` (HeroBoxSection, BoxNetSection, ProcessSection, PortfolioSection, InquirySection)
- 회사 소개: `src/app/about/`
- 포트폴리오: `src/app/portfolio/`
- 레이아웃: `src/app/layout.tsx`

---

### 2.2 관리자 대시보드

관리자 전용 영역으로, 모든 비즈니스 데이터를 관리한다. `/admin` 경로 하위에 위치하며, 세션 쿠키 기반 인증이 필요하다.

**주요 기능:**

| 기능            | 경로                   | 설명                                                             |
| --------------- | ---------------------- | ---------------------------------------------------------------- |
| 대시보드        | `/admin`               | 통계 카드(문의/예약/접속자), 오늘의 예약, 현재 접속자, 긴급 알림 |
| 문의 관리       | `/admin/contacts`      | 접수된 문의 목록, 상태 변경, 공정 단계 관리, 수정 요청           |
| 예약 관리       | `/admin/bookings`      | 방문 예약 관리, 가용 시간 설정                                   |
| 거래처 관리     | `/admin/companies`     | 거래처 목록, 승인/비활성화, 웹하드 접근 제어                     |
| 포트폴리오 관리 | `/admin/portfolio`     | 포트폴리오 등록/수정/삭제, 이미지 업로드(R2)                     |
| 게시글 관리     | `/admin/posts`         | 블로그/공지사항 작성(Lexical 에디터)                             |
| ERP 관리        | `/admin/erp`           | ERP 대시보드, 칸반 보드, 작업자/기계 관리                        |
| 공정 현황 보드  | `/admin/process-board` | 실시간 작업 공정 현황 보드                                       |
| 웹하드 관리     | `/admin/webhard`       | 전체 웹하드 파일/폴더 관리, 활동 로그                            |
| 동기화 모니터   | `/admin/sync-monitor`  | LGU+ 웹하드 동기화 상태 모니터링, 이벤트 로그                    |
| 마이그레이션    | `/admin/migration`     | 기존 데이터 마이그레이션 도구                                    |
| 시스템          | `/admin/system`        | 시스템 설정, 로그 관리                                           |
| 피드백          | `/admin/feedback`      | 사용자 피드백 관리                                               |

**기술적 특징:**

- Suspense 경계를 사용한 점진적 로딩 (TTFCP 개선)
- 다크 모드 지원 (next-themes)
- 실시간 데이터 갱신 (Supabase Realtime + React Query invalidation)
- 활동 로그 자동 기록 (`src/lib/activity-logger.ts`)

**소스 코드 위치:**

- 관리자 페이지: `src/app/(admin)/admin/`
- 관리자 레이아웃 컴포넌트: `src/app/(admin)/components/`
- 관리자 API: `src/app/api/admin/`

---

### 2.3 거래처 대시보드

거래처(고객사) 전용 영역으로, 자사의 주문 현황 확인 및 파일 관리가 가능하다. `/company` 경로 하위에 위치한다.

**주요 기능:**

| 기능     | 경로                 | 설명                                                  |
| -------- | -------------------- | ----------------------------------------------------- |
| 대시보드 | `/company/dashboard` | 주문 현황 요약, 공정 단계별 진행 상황, 수정 요청 내역 |
| 프로필   | `/company/profile`   | 업체 정보 수정, 담당자 정보, 배송지 관리              |
| 청구서   | `/company/billing`   | 전자세금계산서 발행 (서비스 준비중)                   |
| 피드백   | `/company/feedback`  | 서비스 피드백 제출                                    |

**거래처 대시보드 데이터 구조:**

- `contacts` 테이블에서 해당 거래처의 주문(문의) 내역 조회
- 각 주문의 공정 단계(`process_stage`): 접수 -> 도면 확인 -> 제작 -> 검수 -> 출하
- 수정 요청: 도면 수정 파일 첨부, 수정 이력 관리(`revision_request_history`)
- 배송 정보: 택배/퀵/직접수령 선택, 배송지/수령인 정보

**기술적 특징:**

- 서버 컴포넌트에서 세션 검증 후 데이터 프리페치
- 거래처별 데이터 격리 (company_name 기반 필터링)
- 웹하드 데이터 프리페치 (`CompanyPrefetch`)

**소스 코드 위치:**

- 거래처 페이지: `src/app/company/`
- 거래처 레이아웃: `src/app/company/layout.tsx`
- 거래처 API: `src/app/api/company/`
- 거래처 컴포넌트: `src/app/company/_components/`

---

### 2.4 ERP 시스템

현장 작업 관리 시스템으로, 두 가지 인터페이스를 제공한다.

#### 2.4.1 관리자용 ERP (`/admin/erp`)

관리자가 작업을 생성/배정/모니터링하는 데스크탑 중심 인터페이스.

- **ERP 대시보드** (`/admin/erp/dashboard`): 칸반 보드 + 통계 사이드바 (작업자별 통계, 기계별 통계, 최근 완료 작업)
- **작업 관리** (`/admin/erp/tasks`): 작업 생성/수정/삭제, 드래그 앤 드롭 정렬, 상태별 필터
- **작업자 관리** (`/admin/erp/workers`): 작업자 등록 (이름 + 4자리 PIN), 역할 설정(field_worker/supervisor/manager)
- **공정 현황 보드** (`/admin/process-board`): 전체 공정 진행 현황의 실시간 보드 뷰

**작업(Task) 데이터 모델:**

- `title`: 작업명
- `taskType`: 작업 유형 (drawing/sample/laser/cutting/inspection/delivery)
- `status`: 상태 (pending/in_progress/completed/cancelled)
- `priority`: 우선순위 (urgent/normal/low)
- `machineId`: 배정된 기계
- `assignedTo`: 배정된 작업자
- `estimatedDuration`/`actualDuration`: 예상/실제 소요 시간(분)

#### 2.4.2 현장 작업자용 ERP (`/erp`) - 모바일

현장 작업자가 모바일에서 자신의 작업을 확인하고 상태를 변경하는 인터페이스.

- **로그인** (`/erp/login`): 이름 + 4자리 PIN 기반 간편 인증
- **작업 목록** (`/erp/tasks`): 오늘의 작업 목록, 리스트/칸반 뷰 전환, 상태 변경 (시작/완료)
- **공정 현황** (`/erp/process`): 작업자 시점의 공정 진행 현황
- **오프라인 지원** (`/erp/offline`): 네트워크 불안정 시 기본 동작

**인증 방식 (ERP 전용):**

- 별도의 `erp-session` 쿠키 사용 (관리자/거래처 세션과 분리)
- Zustand 스토어(`useErpMobileStore`)로 작업자 세션 클라이언트 관리
- bcryptjs로 PIN 해시 비교

**소스 코드 위치:**

- 관리자 ERP: `src/app/(admin)/admin/erp/`
- 모바일 ERP: `src/app/erp/`
- ERP 타입: `src/app/(admin)/admin/erp/_lib/types.ts`
- ERP hooks: `src/app/erp/_lib/hooks.ts`, `src/app/(admin)/admin/erp/_lib/hooks.ts`
- NestJS ERP 모듈: `webhard-api/src/erp/` (tasks, workers, machines, dashboard)

---

### 2.5 웹하드

클라우드 기반 파일 관리 시스템. 관리자와 거래처 모두 접근 가능하며, 거래처별 파일 격리를 지원한다.

**주요 기능:**

- 파일 업로드/다운로드 (Presigned URL 기반 직접 R2 업로드, 대용량 파일 멀티파트 지원)
- 폴더 계층 구조 관리 (무한 중첩)
- 파일 검색 (이름, MIME 타입 기반)
- 휴지통 (소프트 삭제 + 복원)
- 파일 공유 (토큰 기반 공유 링크)
- 배지 카운트 (미다운로드 파일 알림)
- 즐겨찾기 폴더
- 사용자 설정 (글꼴 크기, 알림, 기본 다운로드 경로)
- 저장소 사용량 모니터링 (거래처별 할당량 관리)
- 활동 로그 (업로드/다운로드/삭제 기록)
- 일괄 삭제/이동
- DXF 파일 뷰어 (dxf-parser, dxf-viewer)
- PDF 미리보기 (pdfjs-dist)

**거래처별 격리:**

- 거래처 회원가입 승인 시 자동으로 전용 루트 폴더 생성 (`initializeCompanyFolders`)
- `company_id` 기반 데이터 필터링
- 관리자가 거래처별 웹하드 접근 권한 제어 가능 (`webhard_access` 필드)

**소스 코드 위치:**

- 웹하드 UI: `src/app/webhard/` (components/containers, components/presentational, components/context, hooks)
- 웹하드 API Routes (Next.js): `src/app/api/webhard/` (files, folders, upload, download, trash, search, settings, share, storage, badge-counts 등)
- 웹하드 Server Actions: `src/app/actions/webhard.ts`, `src/app/actions/webhard-batch-delete.ts`, `src/app/actions/webhard-move.ts`, `src/app/actions/webhard-folder-upload.ts`
- NestJS 웹하드 모듈: `webhard-api/src/files/`, `webhard-api/src/folders/`, `webhard-api/src/storage/`, `webhard-api/src/trash/`, `webhard-api/src/search/`, `webhard-api/src/settings/`

---

## 3. 시스템 아키텍처

### 전체 아키텍처 다이어그램

```
                     ┌──────────────────────────────────────────┐
                     │           Vercel (프로덕션 배포)            │
                     │                                          │
                     │   Next.js 15 프론트엔드 + API Routes       │
                     │   (포트 3000/개발, 3100/프로덕션)           │
                     │                                          │
                     │   ┌─────────────────────────────────┐    │
                     │   │  홈페이지 (SSR + ISR)             │    │
                     │   │  관리자 대시보드 (SSR)             │    │
                     │   │  거래처 대시보드 (SSR)             │    │
                     │   │  ERP 모바일 (CSR)                 │    │
                     │   │  웹하드 UI (CSR)                  │    │
                     │   │  API Routes (~60개)               │    │
                     │   │  Server Actions (14개)            │    │
                     │   └─────────────────────────────────┘    │
                     └──────────┬──────────────┬────────────────┘
                                │              │
               ┌────────────────┘              └────────────────┐
               ▼                                                ▼
┌──────────────────────────┐              ┌──────────────────────────┐
│   Supabase Cloud         │              │   NestJS API (webhard-api)│
│                          │              │   (포트 4000)              │
│   - PostgreSQL DB        │◄─────────────│                          │
│   - Row Level Security   │  Prisma ORM  │   모듈:                   │
│   - Realtime 구독        │              │   - files (파일 CRUD)     │
│   - RPC 함수             │              │   - folders (폴더 CRUD)   │
│   - Edge Functions       │              │   - storage (R2 연동)     │
│                          │              │   - trash (휴지통)        │
│   주요 테이블:            │              │   - search (검색)        │
│   - companies            │              │   - settings (설정)      │
│   - contacts             │              │   - auth (세션 검증)     │
│   - portfolio            │              │   - erp/tasks            │
│   - activity_logs        │              │   - erp/workers          │
│   - notifications        │              │   - erp/machines         │
│   - bookings             │              │   - erp/dashboard        │
│   - webhard_files (*)    │              │   - health (헬스체크)     │
│   - webhard_folders (*)  │              │                          │
│   - machines (*)         │              │   Global Prefix:         │
│   - tasks (*)            │              │   /api/v1                │
│   - erp_workers (*)      │              └────────────┬─────────────┘
│                          │                           │
│   (*) = Prisma 관리      │                           ▼
└──────────────────────────┘              ┌──────────────────────────┐
                                          │   Cloudflare R2          │
                                          │   (S3 호환 파일 저장소)   │
                                          │                          │
                                          │   버킷: yjlaser          │
                                          │   - webhard/{company}/   │
                                          │   - portfolio/           │
                                          │   - contacts/            │
                                          └──────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│   외부 서비스                                                         │
├─────────────┬──────────────┬──────────────┬─────────────┬────────────┤
│ Sentry      │ Upstash Redis│ Gmail SMTP   │ Inngest     │ Web Push   │
│ (에러 추적  │ (Rate Limit, │ (이메일 알림)│ (백그라운드 │ (브라우저   │
│  + APM)     │  캐싱)       │              │  작업)      │  푸시 알림) │
└─────────────┴──────────────┴──────────────┴─────────────┴────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│   LGU+ 웹하드 동기화 도구 (lguplus-webhard-sync)                      │
│                                                                      │
│   실행 환경: Windows PC (Docker 또는 로컬)                             │
│                                                                      │
│   ┌──────────┐    ┌──────────────┐    ┌──────────────┐               │
│   │ Playwright│───>│ 파일 다운로드  │───>│ 자체 웹하드   │               │
│   │ (브라우저 │    │ (로컬 저장)   │    │ API 업로드   │               │
│   │  자동화)  │    └──────────────┘    │ (R2 + DB)    │               │
│   └──────────┘                        └──────────────┘               │
│                                                                      │
│   - SnapshotSyncWatcher: 전체 동기화 (기본 10분 간격)                   │
│   - UploadHistoryPoller: 업로드 감지 (5초 간격)                        │
│   - API 서버: Fastify (포트 3001, 상태 조회/제어)                      │
│   - SQLite: 동기화 상태 관리                                           │
└──────────────────────────────────────────────────────────────────────┘
```

### 프론트엔드 (Next.js 15)

Next.js 15의 App Router를 사용하며, Server Components를 기본으로 하고 클라이언트 인터랙션이 필요한 경우에만 `'use client'`를 선언한다.

- **렌더링 전략**: SSR(관리자/거래처 대시보드), CSR(웹하드, ERP 모바일), ISR(포트폴리오, 블로그)
- **상태 관리**: React Query v5(서버 상태), Zustand v5(클라이언트 글로벌 상태)
- **실시간 업데이트**: Supabase Realtime 구독 -> React Query 캐시 무효화
- **빌드 도구**: Turbopack (개발/빌드)

### 백엔드 (NestJS - webhard-api)

NestJS 10 기반의 REST API 서버. 웹하드 파일/폴더 관리와 ERP 기능을 담당한다.

- **Global Prefix**: `/api/v1`
- **포트**: 4000 (기본값, `NESTJS_PORT` 환경변수로 변경 가능)
- **ORM**: Prisma Client (Supabase PostgreSQL 공유)
- **인증**: Next.js 세션 쿠키 검증 (`SessionAuthGuard`), 거래처 접근 제어 (`CompanyAccessGuard`)
- **파일 저장**: Cloudflare R2 (Presigned URL 방식)
- **Validation**: class-validator + class-transformer (ValidationPipe)

### 동기화 도구 (lguplus-webhard-sync)

Node.js 기반 CLI 도구로, LGU+ 웹하드의 파일을 자체 웹하드로 자동 동기화한다.

- **아키텍처**: Clean Architecture + Event-Driven
- **브라우저 자동화**: Playwright (Cookie 기반 인증)
- **상태 관리**: SQLite (동기화 이벤트, 파일 매핑)
- **HTTP 서버**: Fastify (상태 조회/제어 API)
- **프로세스 관리**: PM2 또는 Docker

---

## 4. 기술 스택 상세

### 프론트엔드

| 분류            | 기술                               | 버전        | 용도                                        |
| --------------- | ---------------------------------- | ----------- | ------------------------------------------- |
| 프레임워크      | Next.js                            | 15.5.x      | App Router, SSR, API Routes, Server Actions |
| 언어            | TypeScript                         | 5.x         | strict 모드                                 |
| UI 라이브러리   | React                              | 19.2.x      | Server Components + Client Components       |
| 스타일링        | Tailwind CSS                       | 4.x         | 유틸리티 기반 스타일링, 다크 모드           |
| 상태 관리       | React Query                        | 5.x         | 서버 상태 캐싱, 자동 동기화                 |
| 상태 관리       | Zustand                            | 5.x         | 클라이언트 글로벌 상태                      |
| 애니메이션      | Framer Motion                      | 12.x        | 컴포넌트 애니메이션, LazyMotion             |
| 애니메이션      | GSAP                               | 3.x         | 고급 스크롤 애니메이션                      |
| 3D 렌더링       | Three.js / R3F                     | 0.181 / 9.x | 홈페이지 Hero 3D 박스 애니메이션            |
| 스크롤          | Lenis                              | 1.x         | 부드러운 스크롤                             |
| 에디터          | Lexical                            | 0.37.x      | 리치 텍스트 에디터 (게시글 작성)            |
| 차트            | Recharts                           | 3.x         | 대시보드 통계 차트                          |
| 폼              | React Hook Form + Zod              | 7.x / 4.x   | 폼 유효성 검증                              |
| UI 컴포넌트     | Radix UI                           | -           | Dialog, Toast, Slot 등                      |
| 아이콘          | Lucide React, React Icons          | -           | UI 아이콘                                   |
| 파일 뷰어       | dxf-parser, dxf-viewer, pdfjs-dist | -           | DXF/PDF 파일 미리보기                       |
| 가상화          | TanStack Virtual                   | 3.x         | 대용량 리스트 가상 스크롤                   |
| 알림            | Sonner                             | 2.x         | 토스트 알림                                 |
| 테마            | next-themes                        | 0.4.x       | 다크/라이트 모드 전환                       |
| 모니터링        | Sentry                             | 10.x        | 에러 추적, APM                              |
| Rate Limit      | Upstash Redis + Ratelimit          | -           | API 요청 제한                               |
| 이메일          | Nodemailer                         | 7.x         | SMTP 이메일 발송                            |
| 푸시 알림       | web-push                           | 3.x         | 브라우저 푸시 알림(VAPID)                   |
| 백그라운드 작업 | Inngest                            | 3.x         | 이벤트 기반 비동기 작업                     |

### 백엔드 (webhard-api)

| 분류       | 기술                                | 버전 | 용도                              |
| ---------- | ----------------------------------- | ---- | --------------------------------- |
| 프레임워크 | NestJS                              | 10.x | REST API 서버                     |
| ORM        | Prisma Client                       | 6.x  | PostgreSQL 스키마 관리, 쿼리 빌더 |
| 인증       | Passport                            | 10.x | 인증 전략 관리                    |
| 파일 저장  | AWS SDK v3                          | 3.x  | Cloudflare R2 (S3 호환)           |
| 검증       | class-validator + class-transformer | -    | DTO 유효성 검증                   |
| 쿠키       | cookie-parser                       | 1.x  | 세션 쿠키 파싱                    |

### 동기화 도구 (lguplus-webhard-sync)

| 분류            | 기술                | 버전 | 용도                              |
| --------------- | ------------------- | ---- | --------------------------------- |
| 런타임          | Node.js             | 18+  | 실행 환경                         |
| 브라우저 자동화 | Playwright          | 1.x  | LGU+ 웹하드 자동 로그인/파일 탐색 |
| HTTP 클라이언트 | undici, axios       | -    | API 통신                          |
| HTTP 서버       | Fastify             | 4.x  | 상태 조회/제어 API                |
| DB              | better-sqlite3      | 11.x | 동기화 상태 저장                  |
| 파일 감시       | chokidar            | 3.x  | 로컬 파일 시스템 변경 감지        |
| 스케줄러        | node-cron           | 3.x  | 주기적 동기화                     |
| 병렬 처리       | p-queue, bottleneck | -    | 다운로드/업로드 동시성 제어       |
| 로깅            | Winston             | 3.x  | 구조화된 로깅                     |
| CLI             | Commander           | 12.x | CLI 명령어 파싱                   |
| 프로그레스      | cli-progress, ora   | -    | 진행 상황 표시                    |

### 인프라

| 분류            | 서비스                | 용도                        |
| --------------- | --------------------- | --------------------------- |
| 배포            | Vercel                | Next.js 프론트엔드 배포     |
| 데이터베이스    | Supabase (PostgreSQL) | 메인 데이터베이스, Realtime |
| 파일 저장소     | Cloudflare R2         | 파일 저장 (S3 호환)         |
| 캐싱/Rate Limit | Upstash Redis         | 서버리스 Redis              |
| 모니터링        | Sentry                | 에러 추적, 성능 모니터링    |
| 이메일          | Gmail SMTP            | 알림 이메일 발송            |

### 패키지 매니저

- **프론트엔드(루트)**: pnpm
- **webhard-api**: pnpm
- **lguplus-webhard-sync**: npm

---

## 5. 인증/권한 체계

시스템은 세 가지 독립적인 인증 방식을 운영한다.

### 5.1 관리자 인증

```
로그인 폼 → Server Action(loginAction) → 환경변수 자격증명 비교
→ HMAC-SHA256 서명 세션 토큰 생성 → admin-session 쿠키 설정
```

- **자격증명**: 환경변수 기반 정적 계정 (`TEST_ADMIN_USERNAME`, `TEST_ADMIN_PASSWORD`)
- **세션 토큰 형식**: `{랜덤토큰}:{JSON(userType,userId)}.{HMAC-SHA256서명}`
- **세션 만료**: 4시간 (`SESSION_MAX_AGE`)
- **쿠키 옵션**: `httpOnly`, `sameSite: lax`, 프로덕션에서 `secure`
- **타이밍 공격 방지**: `crypto.timingSafeEqual` 기반 서명 검증
- **Rate Limiting**: Upstash Redis 기반 로그인 시도 제한

**소스 코드:**

- 세션 관리: `src/lib/auth/session.ts`
- 보안 유틸: `src/lib/auth/security.ts`
- 관리자 가드: `src/lib/auth/adminGuard.ts`
- Rate Limit: `src/lib/auth/rateLimit.ts`
- 로그인 액션: `src/app/actions/auth.ts`

### 5.2 거래처 인증

```
회원가입 → 관리자 승인 → 로그인 폼 → Supabase companies 테이블 조회
→ bcryptjs 비밀번호 비교 → 동일한 admin-session 쿠키에 userType:'company' 저장
```

- **자격증명**: Supabase `companies` 테이블 (아이디/비밀번호 해시)
- **세션 구분**: 동일한 쿠키 내 `userType` 필드로 `admin`/`company` 구분
- **회원가입 흐름**: 거래처 정보 입력 -> 관리자 승인 대기 -> 승인 후 활성화
- **아이디 찾기/비밀번호 찾기**: 이메일 기반 (`/api/auth/find-id`, `/api/auth/find-password`)

**소스 코드:**

- 회원가입: `src/app/actions/register.ts`
- 회사 관리: `src/app/actions/companies.ts`

### 5.3 ERP 작업자 인증

```
이름 입력 → 4자리 PIN 입력 → NestJS erp/workers API → bcryptjs PIN 해시 비교
→ erp-session 쿠키 설정 + Zustand 스토어에 세션 저장
```

- **자격증명**: `erp_workers` 테이블 (이름 + PIN 해시)
- **쿠키**: 별도의 `erp-session` 쿠키 사용
- **클라이언트 상태**: `useErpMobileStore` (Zustand)
- **역할**: `field_worker`(현장 작업자), `supervisor`(감독자), `manager`(관리자)

**소스 코드:**

- ERP 로그인: `src/app/erp/login/page.tsx`
- ERP 스토어: `src/app/erp/_lib/store.ts`
- 작업자 모듈: `webhard-api/src/erp/workers/`

### 5.4 API 키 인증

외부 서비스(LGU+ 동기화 도구 등)가 NestJS API에 접근할 때 사용.

- **헤더**: `X-API-Key` 또는 `Authorization: Bearer {key}`
- **환경변수**: `MIGRATION_API_KEY`

### 5.5 미들웨어 보호 경로

`middleware.ts`에서 경로별 접근 제어를 수행한다.

| 경로 패턴             | 필요 쿠키                           | 미인증 시 리디렉션 |
| --------------------- | ----------------------------------- | ------------------ |
| `/admin/*`            | `admin-session`                     | `/login`           |
| `/company/*`          | `admin-session` (userType: company) | `/login`           |
| `/erp/*` (login 제외) | `erp-session`                       | `/erp/login`       |

---

## 6. API 구조 개요

### 6.1 Next.js API Routes (`/api/`)

Next.js App Router의 Route Handler 기반 BFF/API다. 브라우저 세션, CSRF, 파일 업로드 UX를 처리한 뒤 NestJS API 또는 외부 서비스 API를 프록시한다. PostgreSQL 데이터 조회/변경은 NestJS API를 경유한다.

**인증 관련:**
| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/auth/find-id` | POST | 아이디 찾기 |
| `/api/auth/find-password` | POST | 비밀번호 찾기 |
| `/api/session/heartbeat` | GET | 세션 유지 하트비트 |
| `/api/erp/session` | POST | ERP 세션 관리 |

**관리자 전용:**
| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/admin/contacts` | GET | 문의 목록 조회 |
| `/api/admin/bookings` | GET/POST | 예약 관리 |
| `/api/admin/bookings/[id]` | PATCH/DELETE | 예약 상세 관리 |
| `/api/admin/feedback/[id]` | PATCH/DELETE | 피드백 관리 |
| `/api/admin/storage` | GET | 저장소 현황 |
| `/api/admin/activity-logs` | GET | 활동 로그 조회 |
| `/api/admin/webhard/activity` | GET | 웹하드 활동 로그 |

**거래처 관련:**
| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/contacts` | GET | 문의 목록 |
| `/api/contacts/[id]` | GET/PATCH/DELETE | 문의 상세 |
| `/api/contacts/[id]/status` | PATCH | 상태 변경 |
| `/api/contacts/[id]/revision-request` | POST | 수정 요청 |
| `/api/companies` | GET | 거래처 목록 |
| `/api/company/profile` | GET/PATCH | 거래처 프로필 |
| `/api/company/address` | GET/POST | 배송지 관리 |
| `/api/company/delivery-companies` | GET/POST | 택배사 관리 |
| `/api/bookings` | GET/POST | 예약 조회/생성 |
| `/api/bookings/available` | GET | 가용 예약 시간 |

**웹하드 관련:**
| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/webhard/files` | GET | 파일 목록 |
| `/api/webhard/files/presigned-url` | POST | Presigned URL 발급 |
| `/api/webhard/files/confirm` | POST | 업로드 완료 확인 |
| `/api/webhard/files/new` | GET | 신규 파일 목록 |
| `/api/webhard/files/mark-downloaded` | POST | 다운로드 확인 표시 |
| `/api/webhard/files/badge-counts` | GET | 미확인 파일 수 |
| `/api/webhard/folders` | GET/POST | 폴더 조회/생성 |
| `/api/webhard/folders/[id]` | PATCH/DELETE | 폴더 수정/삭제 |
| `/api/webhard/upload` | POST | 파일 업로드 |
| `/api/webhard/upload/batch` | POST | 일괄 업로드 |
| `/api/webhard/download` | GET | 파일 다운로드 |
| `/api/webhard/search` | GET | 파일 검색 |
| `/api/webhard/trash` | GET/POST/DELETE | 휴지통 관리 |
| `/api/webhard/batch-delete` | POST | 일괄 삭제 |
| `/api/webhard/share` | GET/POST | 공유 링크 관리 |
| `/api/webhard/share/[token]` | GET | 공유 파일 접근 |
| `/api/webhard/storage` | GET | 저장소 사용량 |
| `/api/webhard/settings` | GET/PATCH | 사용자 설정 |
| `/api/webhard/logs` | GET | 웹하드 활동 로그 |
| `/api/webhard/badge-counts` | GET | 배지 카운트 |

**기타:**
| 경로 | 메서드 | 설명 |
|------|--------|------|
| `/api/portfolio/upload` | POST | 포트폴리오 이미지 업로드 |
| `/api/billing/generate` | POST | 청구서 생성 |
| `/api/billing/invoices` | GET | 청구서 목록 |
| `/api/notifications` | GET/POST | 알림 조회/생성 |
| `/api/push/subscribe` | POST | 푸시 알림 구독 |
| `/api/push/send` | POST | 푸시 알림 발송 |
| `/api/sync/status` | GET | 동기화 상태 |
| `/api/sync/events` | GET | 동기화 이벤트 |
| `/api/sync/stats` | GET | 동기화 통계 |
| `/api/sync/control` | POST | 동기화 제어 |
| `/api/health` | GET | 헬스 체크 |
| `/api/inngest` | POST | Inngest 이벤트 핸들러 |

### 6.2 Next.js Server Actions (`/actions/`)

`'use server'` 디렉티브 기반의 Server Actions. 폼 제출 및 데이터 변경 작업에 사용한다.

| 파일                       | 주요 기능                      |
| -------------------------- | ------------------------------ |
| `auth.ts`                  | 로그인/로그아웃 액션           |
| `register.ts`              | 회원가입, 테스트 계정 생성     |
| `contact.ts`               | 문의 접수                      |
| `contacts.ts`              | 문의 상태 변경, 공정 단계 변경 |
| `companies.ts`             | 거래처 승인/비활성화           |
| `company.ts`               | 거래처 프로필 수정             |
| `feedback.ts`              | 피드백 관리                    |
| `process-board.ts`         | 공정 현황 보드 데이터          |
| `activity-logs.ts`         | 활동 로그 기록                 |
| `webhard.ts`               | 웹하드 파일/폴더 관리          |
| `webhard-batch-delete.ts`  | 웹하드 일괄 삭제               |
| `webhard-move.ts`          | 웹하드 파일/폴더 이동          |
| `webhard-folder-upload.ts` | 폴더 업로드                    |
| `webhard-migrate.ts`       | 웹하드 데이터 마이그레이션     |

### 6.3 NestJS API (`/api/v1/`)

NestJS 기반 REST API. Prisma ORM으로 PostgreSQL과 통신하고, R2 Presigned URL 발급을 담당한다.

**모듈 구조:**

| 모듈             | 경로 프리픽스      | 주요 엔드포인트                                |
| ---------------- | ------------------ | ---------------------------------------------- |
| `FilesModule`    | `/api/v1/files`    | 파일 CRUD, Presigned URL, 다운로드 확인        |
| `FoldersModule`  | `/api/v1/folders`  | 폴더 CRUD, 계층 구조 관리                      |
| `StorageModule`  | `/api/v1/storage`  | 저장소 사용량, 할당량 관리                     |
| `TrashModule`    | `/api/v1/trash`    | 소프트 삭제, 복원, 영구 삭제                   |
| `SearchModule`   | `/api/v1/search`   | 파일/폴더 검색                                 |
| `SettingsModule` | `/api/v1/settings` | 사용자 설정                                    |
| `AuthModule`     | -                  | SessionAuthGuard, CompanyAccessGuard           |
| `ErpModule`      | `/api/v1/erp`      | 하위 모듈: tasks, workers, machines, dashboard |
| `HealthModule`   | `/api/v1/health`   | 서버 상태 체크                                 |
| `PrismaModule`   | -                  | Prisma Client 제공                             |

---

## 7. 파일 저장소 구조 (Cloudflare R2)

Cloudflare R2를 S3 호환 API로 사용한다. AWS SDK v3(`@aws-sdk/client-s3`)로 접근하며, Presigned URL 기반 직접 업로드/다운로드를 지원한다.

### 버킷 구조

```
yjlaser (버킷)
├── webhard/
│   ├── {company_id}/           # 거래처별 파일
│   │   ├── {folder_id}/
│   │   │   └── {uuid}_{filename}
│   │   └── ...
│   └── admin/                  # 관리자 파일
│       └── ...
├── portfolio/                  # 포트폴리오 이미지
│   └── {uuid}_{filename}
├── contacts/                   # 문의 첨부 파일
│   └── {uuid}_{filename}
└── migration/                  # 마이그레이션 파일
    └── ...
```

### 업로드 흐름

```
1. 클라이언트: 업로드 요청 (파일 메타데이터)
2. NestJS API: Presigned URL 발급 (PUT, 1시간 유효)
3. 클라이언트: Presigned URL로 R2에 직접 업로드
4. 클라이언트: 업로드 완료 확인 API 호출
5. NestJS API: DB에 파일 메타데이터 저장 (webhard_files 테이블)
```

### 다운로드 흐름

```
1. 클라이언트: 다운로드 요청 (file_id)
2. NestJS API: Presigned URL 발급 (GET, 1시간 유효) + 다운로드 카운트 증가
3. 클라이언트: Presigned URL로 R2에서 직접 다운로드
```

### 저장소 관리

- **거래처 기본 할당량**: `DEFAULT_STORAGE_LIMIT` (StorageService에서 정의)
- **관리자 할당량**: `ADMIN_STORAGE_LIMIT` (더 큰 할당량)
- **사용량 조회**: 거래처별 사용량 집계, 파일 유형별 분류

**소스 코드:**

- R2 유틸리티: `src/lib/r2/` (upload, download, delete, multipart)
- NestJS Storage: `webhard-api/src/storage/storage.service.ts`

---

## 8. LGU+ 웹하드 동기화 설명

`lguplus-webhard-sync`는 외부 LGU+ 웹하드 서비스의 파일을 자체 웹하드로 양방향 동기화하는 독립 CLI 도구이다.

### 동기화 아키텍처

```
┌─────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│  LGU+ 웹하드     │          │  동기화 엔진       │          │  자체 웹하드       │
│  (외부 서비스)    │◄────────►│  (lguplus-sync)  │────────►│  (NestJS + R2)   │
│                 │  Cookie   │                  │  REST    │                  │
│  - 파일 목록     │  기반     │  - Snapshot동기화 │  API     │  - R2 업로드      │
│  - 파일 다운로드  │  HTTP     │  - History폴링    │          │  - DB 기록        │
│  - 폴더 탐색     │  통신     │  - 상태 관리      │          │  - 폴더 생성      │
└─────────────────┘          │  - 충돌 해결      │          └──────────────────┘
                             │  - 에러 재시도     │
                             └──────────────────┘
```

### 핵심 컴포넌트

| 컴포넌트                | 파일 위치                                    | 역할                                                    |
| ----------------------- | -------------------------------------------- | ------------------------------------------------------- |
| **BidirectionalEngine** | `src/bidirectional/engine.ts`                | 메인 동기화 오케스트레이터                              |
| **SnapshotSyncWatcher** | `src/bidirectional/snapshot-sync-watcher.ts` | 전체 파일 목록 스냅샷 비교 방식 동기화 (기본 10분 간격) |
| **UploadHistoryPoller** | `src/bidirectional/upload-history-poller.ts` | 업로드 이력 폴링으로 새 파일 빠르게 감지 (5초 간격)     |
| **StateManager**        | `src/bidirectional/state-manager.ts`         | SQLite 기반 동기화 상태 저장/조회                       |
| **ConflictResolver**    | `src/bidirectional/conflict-resolver.ts`     | 파일 충돌 해결 전략 (LWW/수동/양쪽 보관)                |
| **LGUPlusApiClient**    | `src/lguplus/api-client.ts`                  | LGU+ 웹하드 HTTP API 클라이언트 (Cookie 기반 인증)      |
| **SelfWebhardClient**   | `src/self-webhard/api-client.ts`             | 자체 웹하드 REST API 클라이언트                         |
| **Uploader**            | `src/self-webhard/uploader.ts`               | 자체 웹하드로 파일 일괄 업로드                          |
| **SyncDashboard**       | `src/cli/sync-dashboard.ts`                  | 터미널 대시보드 UI                                      |
| **PathResolver**        | `src/utils/path-resolver.ts`                 | LGU+ <-> 자체 웹하드 경로 매핑                          |

### 동기화 흐름

```
1. Playwright로 LGU+ 웹하드 브라우저 자동 로그인
2. Cookie 추출 후 HTTP API 클라이언트에 전달
3. SnapshotSyncWatcher: 전체 파일 목록 스냅샷 → 로컬 상태와 비교 → 변경분 감지
4. UploadHistoryPoller: 업로드 이력 API 폴링 → 새 파일 즉시 감지
5. 변경 감지 시 SyncEvent 생성 → 큐에 추가
6. 큐 프로세서: 이벤트별 처리 (다운로드 → 자체 웹하드 업로드)
7. 상태 저장 (SQLite)
8. 관리자 웹 대시보드에서 동기화 상태 모니터링 가능 (/admin/sync-monitor)
```

### 실행 방법

```bash
cd lguplus-webhard-sync

# 의존성 설치
npm install
npx playwright install chromium

# 환경변수 설정
cp .env.example .env
# LGUPLUS_URL, LGUPLUS_USERNAME, LGUPLUS_PASSWORD 등 설정

# 개발 모드
npm run dev

# 빌드 후 실행
npm run build
npm start                    # 기본 모드 (실시간 동기화)
npm start -- --api           # API 서버 활성화 (포트 3001)
npm start -- daemon --api    # 데몬 + API 서버 (Docker용)

# PM2로 서비스 등록
npm run service:install
npm run service:logs
```

### 모니터링

- **CLI 대시보드**: 터미널에서 실시간 동기화 상태 표시
- **HTTP API**: `http://localhost:3001` (Fastify)에서 상태 조회/제어
- **관리자 웹**: `/admin/sync-monitor`에서 동기화 이벤트/통계 확인
- **Next.js API**: `/api/sync/status`, `/api/sync/events`, `/api/sync/stats`, `/api/sync/control`

---

## 9. 데이터베이스 구조 개요

데이터베이스는 Supabase PostgreSQL을 사용하며, 두 가지 방식으로 스키마를 관리한다:

1. **Supabase 관리**: Supabase 대시보드/마이그레이션으로 관리하는 테이블 (contacts, companies, portfolio 등)
2. **Prisma 관리**: `webhard-api/prisma/schema.prisma`로 관리하는 테이블 (webhard\_\*, machines, tasks, erp_workers)

### Prisma 관리 테이블

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│    companies     │     │  webhard_folders  │     │  webhard_files   │
├──────────────────┤     ├──────────────────┤     ├──────────────────┤
│ id (PK, serial)  │◄──┐│ id (PK, uuid)    │◄──┐│ id (PK, uuid)    │
│ company_name     │   ││ name             │   ││ name             │
│ manager_name     │   ││ parent_id (FK) ──┘   ││ original_name    │
│ created_at       │   ││ company_id (FK) ─┘   ││ size (BigInt)    │
│ updated_at       │   ││ path             │   ││ mime_type        │
│                  │   ││ created_at       │   ││ path             │
│                  │   ││ updated_at       │   ││ folder_id (FK) ──┘
│                  │   ││ deleted_at       │   ││ company_id (FK) ─┘
└──────────────────┘   │└──────────────────┘   ││ uploaded_by      │
                       │  self-referencing FK   ││ inquiry_number   │
                       │  (parent → children)   ││ is_downloaded    │
                       │                        ││ created_at       │
                       └────────────────────────┤│ updated_at       │
                                                ││ deleted_at       │
                                                ││ deleted_by       │
                                                │└──────────────────┘
                                                │
┌──────────────────┐   ┌──────────────────────┐│
│ webhard_settings │   │webhard_folder_favorites││
├──────────────────┤   ├──────────────────────┤│
│ user_id (PK)     │   │ user_id (PK)         ││
│ font_size        │   │ folder_id (PK)       ││
│ notifications    │   │ created_at           ││
│ download_path    │   └──────────────────────┘│
│ created_at       │                           │
│ updated_at       │                           │
└──────────────────┘                           │
                                               │
┌──────────────────┐   ┌──────────────────┐    │
│    machines      │   │     tasks        │    │
├──────────────────┤   ├──────────────────┤    │
│ id (PK, uuid)    │◄──│ id (PK, uuid)    │    │
│ name             │   │ contact_id       │    │
│ type             │   │ title            │    │
│  (laser/osi_     │   │ description      │    │
│   bending/knife_ │   │ task_type        │    │
│   bending/sample)│   │  (drawing/sample/│    │
│ status           │   │   laser/cutting/ │    │
│ description      │   │   inspection/    │    │
│ created_at       │   │   delivery)      │    │
│ updated_at       │   │ status           │    │
└──────────────────┘   │  (pending/       │    │
                       │   in_progress/   │    │
┌──────────────────┐   │   completed/     │    │
│   erp_workers    │   │   cancelled)     │    │
├──────────────────┤   │ priority         │    │
│ id (PK, uuid)    │   │  (urgent/normal/ │    │
│ name             │   │   low)           │    │
│ pin_hash         │   │ machine_id (FK) ─┘    │
│ role             │   │ assigned_to      │    │
│  (field_worker/  │   │ started_at       │    │
│   supervisor/    │   │ completed_at     │    │
│   manager)       │   │ estimated_       │    │
│ is_active        │   │   duration       │    │
│ last_login_at    │   │ actual_duration  │    │
│ created_at       │   │ sort_order       │    │
│ updated_at       │   │ memo             │    │
└──────────────────┘   │ created_at       │    │
                       │ updated_at       │    │
                       └──────────────────┘    │
```

### Supabase 관리 테이블 (주요)

| 테이블          | 용도                   | 주요 컬럼                                                                                         |
| --------------- | ---------------------- | ------------------------------------------------------------------------------------------------- |
| `companies`     | 거래처 (Prisma와 공유) | id, company_name, username, password_hash, webhard_access, status                                 |
| `contacts`      | 문의/주문              | id, company_name, name, phone, email, status, process_stage, drawing_type, dimensions, attachment |
| `portfolio`     | 포트폴리오             | id, title, field, images[], description                                                           |
| `bookings`      | 방문 예약              | id, company_name, date, time_slot, status                                                         |
| `activity_logs` | 활동 로그              | id, user_type, user_id, action, details, ip_address                                               |
| `notifications` | 알림                   | id, user_type, user_id, title, content, is_read                                                   |
| `posts`         | 블로그/공지사항        | id, title, content, category, published                                                           |
| `feedback`      | 사용자 피드백          | id, company_id, content, rating                                                                   |

---

## 10. 설치 및 실행 방법

### 사전 요구 사항

- **Node.js**: 18.0.0 이상
- **pnpm**: 8.0.0 이상 (루트 및 webhard-api)
- **npm**: lguplus-webhard-sync 전용

### 10.1 프론트엔드 (Next.js) 설치 및 실행

```bash
# 1. 프로젝트 루트로 이동
cd yjlaser_website

# 2. 의존성 설치
pnpm install

# 3. 환경변수 설정
cp .env.example .env.local
# .env.local 파일을 열어 각 항목 설정 (아래 환경변수 목록 참조)

# 4. 개발 서버 실행 (포트 3000, Turbopack)
pnpm dev

# 4-1. Webpack으로 개발 서버 실행 (Turbopack 문제 시)
pnpm dev:webpack

# 5. 프로덕션 빌드
pnpm build

# 6. 프로덕션 서버 실행 (포트 3100)
pnpm start
```

### 10.2 백엔드 (NestJS webhard-api) 설치 및 실행

```bash
# 1. webhard-api 디렉토리로 이동
cd webhard-api

# 2. 의존성 설치
pnpm install

# 3. Prisma 클라이언트 생성
pnpm prisma:generate

# 4. 개발 서버 실행 (포트 4000, --watch 모드)
pnpm start:dev

# 5. 프로덕션 빌드 및 실행
pnpm build
pnpm start:prod
```

### 10.3 LGU+ 동기화 도구 설치 및 실행

```bash
# 1. lguplus-webhard-sync 디렉토리로 이동
cd lguplus-webhard-sync

# 2. 의존성 설치
npm install

# 3. Playwright Chromium 설치
npx playwright install chromium

# 4. 환경변수 설정
cp .env.example .env
# LGUPLUS_URL, LGUPLUS_USERNAME, LGUPLUS_PASSWORD 등 설정

# 5. 개발 모드 실행
npm run dev

# 6. 빌드 후 실행
npm run build
npm start
```

### 10.4 전체 시스템 동시 실행

```bash
# 루트에서 Next.js + NestJS 동시 실행 (Windows)
pnpm dev:all
```

### 10.5 기타 명령어

```bash
# 코드 품질
pnpm lint              # ESLint 검사
pnpm lint:fix          # ESLint 자동 수정
pnpm format            # Prettier 포맷팅
pnpm format:check      # 포맷 검사만

# 테스트
pnpm test              # Jest 단위 테스트
pnpm test:watch        # 감시 모드
pnpm test:coverage     # 커버리지 리포트

# 타입 체크
npx tsc --noEmit

# 빌드 관련
pnpm build:clean       # .next 삭제 후 빌드
pnpm preview           # 빌드 + 실행
pnpm rebuild:sharp     # sharp 네이티브 모듈 재빌드
```

### 환경변수 전체 목록 (.env.local)

```env
# ===== Supabase =====
NEXT_PUBLIC_SUPABASE_URL=         # Supabase 프로젝트 URL
NEXT_PUBLIC_SUPABASE_ANON_KEY=    # Supabase Anonymous Key
SUPABASE_SERVICE_ROLE_KEY=        # Supabase Service Role Key (서버 전용)

# ===== Cloudflare R2 =====
R2_ACCOUNT_ID=                    # Cloudflare 계정 ID
R2_ENDPOINT=                      # R2 엔드포인트 URL
R2_ACCESS_KEY_ID=                 # R2 액세스 키
R2_SECRET_ACCESS_KEY=             # R2 시크릿 키
R2_BUCKET_NAME=yjlaser            # R2 버킷 이름
R2_PUBLIC_BASE_URL=               # R2 퍼블릭 베이스 URL

# ===== 인증 =====
SESSION_SECRET=                   # 32바이트 세션 시크릿 키
TEST_ADMIN_USERNAME=              # 관리자 아이디
TEST_ADMIN_PASSWORD=              # 관리자 비밀번호
MIGRATION_API_KEY=                # NestJS API 인증 키
USE_SECURE_COOKIES=true           # HTTPS 쿠키 사용 여부

# ===== Sentry =====
NEXT_PUBLIC_SENTRY_DSN=           # Sentry DSN
SENTRY_AUTH_TOKEN=                # Sentry 인증 토큰
SENTRY_ORG=yjlaser                # Sentry 조직
SENTRY_PROJECT=yjlaser            # Sentry 프로젝트

# ===== 이메일 =====
SMTP_HOST=                        # SMTP 서버 호스트
SMTP_USER=                        # SMTP 사용자
SMTP_PASSWORD=                    # SMTP 비밀번호
ADMIN_EMAIL=                      # 관리자 알림 수신 이메일

# ===== Redis =====
UPSTASH_REDIS_REST_URL=           # Upstash Redis URL
UPSTASH_REDIS_REST_TOKEN=         # Upstash Redis 토큰

# ===== 푸시 알림 =====
NEXT_PUBLIC_VAPID_PUBLIC_KEY=     # VAPID 공개 키
VAPID_PRIVATE_KEY=                # VAPID 비밀 키

# ===== NestJS =====
NEXT_PUBLIC_WEBHARD_API_URL=      # NestJS API URL (기본: http://localhost:4000)
DATABASE_URL=                     # PostgreSQL 연결 문자열 (Prisma)
DIRECT_URL=                       # PostgreSQL 직접 연결 (Prisma, connection pooling 우회)
NESTJS_PORT=4000                  # NestJS 포트
CORS_ORIGIN=http://localhost:3000 # CORS 허용 오리진

# ===== 기타 =====
NEXT_PUBLIC_SITE_URL=https://www.yjlaser.net  # 사이트 URL
SLACK_WEBHOOK_URL=                # Slack 알림 웹훅 URL

# ===== LGU+ 동기화 (lguplus-webhard-sync 전용) =====
LGUPLUS_URL=                      # LGU+ 웹하드 URL
LGUPLUS_USERNAME=                 # LGU+ 로그인 아이디
LGUPLUS_PASSWORD=                 # LGU+ 로그인 비밀번호
DOWNLOAD_DIR=                     # 다운로드 폴더 경로
SYNC_INTERVAL_MINUTES=10          # 스냅샷 동기화 간격 (분)
UPLOAD_POLL_INTERVAL_MS=5000      # 업로드 감지 간격 (밀리초)
SELF_WEBHARD_URL=                 # 자체 웹하드 API URL
SELF_WEBHARD_API_KEY=             # 자체 웹하드 API 키
```

---

## 11. 배포 방법

### 11.1 프론트엔드 (Vercel 배포)

프론트엔드는 Vercel에 배포되어 있으며, Git push 시 자동 배포된다.

```bash
# Vercel CLI로 배포 (수동)
npx vercel                 # 프리뷰 배포
npx vercel --prod          # 프로덕션 배포
```

**Vercel 설정:**

- Framework: Next.js (자동 감지)
- Build Command: `pnpm build` (Turbopack)
- Output Directory: `.next`
- Install Command: `pnpm install`
- Node.js Version: 20.x
- 환경변수: Vercel 대시보드에서 `.env.local`의 모든 변수 설정

**배포 주의사항:**

- `sharp` 패키지: `postinstall` 스크립트로 자동 빌드 (`npm rebuild sharp`)
- Sentry: 빌드 시 소스맵 업로드 후 자동 삭제
- 캐싱: 정적 자산은 1년, 빌드 파일은 immutable 캐시 설정

### 11.2 백엔드 (NestJS)

NestJS API는 별도의 서버 또는 Docker 컨테이너에 배포한다.

```bash
# 빌드
cd webhard-api
pnpm build

# 실행
pnpm start:prod
# 또는
node dist/main
```

**프로덕션 환경에서의 고려사항:**

- 프로세스 매니저(PM2 등) 사용 권장
- `CORS_ORIGIN`을 프로덕션 도메인으로 설정
- `DATABASE_URL`에 connection pooling URL 사용

### 11.3 LGU+ 동기화 도구

Windows PC에서 PM2 또는 Docker로 상시 실행한다.

```bash
# PM2로 서비스 등록
npm run service:install

# Docker로 실행 (데몬 모드)
npm run build
node dist/index.js daemon --api
```

### 배포 현황

| 서비스               | 플랫폼         | URL                     |
| -------------------- | -------------- | ----------------------- |
| 웹사이트(프론트엔드) | Vercel         | https://www.yjlaser.net |
| 데이터베이스         | Supabase Cloud | Supabase 대시보드       |
| 파일 저장소          | Cloudflare R2  | R2 대시보드             |
| 에러 모니터링        | Sentry         | sentry.io               |
| Redis 캐시           | Upstash        | upstash.com             |

---

## 12. 다른 프로그램과의 연동 가능성

### 12.1 현재 연동 구조

현재 세 개의 서브 시스템이 다음과 같이 연동되어 있다:

```
Next.js (프론트엔드 + BFF/API)
    │
    ├── NestJS API (HTTP: 웹하드 + ERP + DB 기능)
    │       ├── Supabase/PostgreSQL (Prisma ORM)
    │       └── Cloudflare R2 (AWS SDK: 파일 저장)
    └── Cloudflare R2 (Presigned URL 업로드/다운로드)

lguplus-webhard-sync (독립 CLI)
    ├── LGU+ 웹하드 (Playwright + HTTP: 파일 다운로드)
    └── NestJS API (HTTP: 파일 업로드)
```

### 12.2 API 기반 연동

외부 시스템에서 본 플랫폼과 연동할 수 있는 진입점:

**NestJS API (`/api/v1/`)**

- **인증**: `X-API-Key` 헤더 또는 `admin-session` 쿠키
- **형식**: JSON REST API
- **문서화**: DTO 기반 자동 검증 (class-validator)
- **파일 업로드**: Presigned URL 발급 후 R2 직접 업로드
- **ERP 작업 관리**: 작업 CRUD, 상태 변경, 작업자/기계 관리

**Next.js API Routes (`/api/`)**

- **인증**: 세션 쿠키 또는 API 키
- **동기화 제어**: `/api/sync/control`로 동기화 시작/중지/상태 조회
- **알림**: `/api/push/send`로 푸시 알림 발송
- **Inngest**: `/api/inngest`로 이벤트 기반 백그라운드 작업 트리거

### 12.3 연동 가능한 시나리오

#### 외부 ERP/MES 시스템과 연동

- NestJS의 `/api/v1/erp/tasks` 엔드포인트로 작업 데이터 동기화
- 기계 상태, 작업 진행률, 작업자 배정 정보 양방향 연동
- Inngest 이벤트로 작업 상태 변경 시 외부 시스템에 알림

#### 회계/청구 시스템과 연동

- `/api/billing/` 엔드포인트에 전자세금계산서 발행 시스템 연결 (현재 준비중)
- Supabase의 `contacts` 테이블에서 완료된 주문 데이터를 회계 시스템으로 전달

#### 물류/배송 시스템과 연동

- `/api/company/delivery-companies`로 택배사 정보 관리
- `contacts` 테이블의 `delivery_method`, `delivery_address` 데이터를 물류 API와 연동

#### CRM 시스템과 연동

- Supabase `contacts` 테이블이 CRM 역할 수행
- 주문 상태(`status`), 공정 단계(`process_stage`), 활동 로그(`activity_logs`) 데이터 활용
- 웹훅/Inngest를 통해 상태 변경 시 외부 CRM에 알림

#### 다른 파일 저장소/백업 시스템과 연동

- R2의 S3 호환 API를 활용하여 다른 S3 호환 저장소와 미러링
- `lguplus-webhard-sync`의 아키텍처를 확장하여 다른 외부 웹하드 서비스 동기화 가능
- NestJS의 `StorageService`를 확장하여 다중 저장소 백엔드 지원

#### 모바일 앱과 연동

- 현재 ERP 모바일 인터페이스(`/erp`)가 PWA에 가까운 모바일 웹으로 구현되어 있음
- NestJS API를 모바일 앱(React Native, Flutter 등)의 백엔드로 활용 가능
- Web Push API가 이미 구현되어 있어 모바일 알림 기반이 마련되어 있음

### 12.4 연동 시 주의사항

- **인증**: API 키 기반 인증(`MIGRATION_API_KEY`)을 사용하거나, 별도의 API 키 발급 시스템 구축 필요
- **Rate Limiting**: Upstash Redis 기반 Rate Limiting이 적용되어 있으므로, 대량 API 호출 시 한도 조정 필요
- **CORS**: NestJS의 `CORS_ORIGIN` 설정에 연동 시스템의 도메인 추가 필요
- **데이터 일관성**: DB schema 변경은 NestJS Prisma schema/migration을 기준으로 관리하고, Next.js API Routes는 NestJS API 계약 변화에 맞춰 갱신
- **파일 크기 제한**: Server Actions body size 제한 10GB (`next.config.ts`), NestJS 별도 설정 필요

---

## 부록: 프로젝트 구조 전체 트리

```
yjlaser_website/
├── src/
│   ├── app/
│   │   ├── layout.tsx                    # 루트 레이아웃 (헤더, 푸터, 프로바이더)
│   │   ├── page.tsx                      # 홈페이지
│   │   ├── providers.tsx                 # React Query, ThemeProvider, LazyMotion
│   │   ├── globals.css                   # Tailwind CSS 진입점
│   │   ├── not-found.tsx                 # 404 페이지
│   │   ├── global-error.tsx              # 전역 에러 페이지
│   │   ├── sitemap.ts                    # 사이트맵 생성
│   │   ├── robots.ts                     # robots.txt 생성
│   │   ├── opengraph-image.tsx           # OG 이미지 생성
│   │   │
│   │   ├── (admin)/admin/                # 관리자 대시보드
│   │   │   ├── page.tsx                  #   메인 대시보드
│   │   │   ├── _components/              #   공통 컴포넌트
│   │   │   ├── contacts/                 #   문의 관리
│   │   │   ├── bookings/                 #   예약 관리
│   │   │   ├── companies/                #   거래처 관리
│   │   │   ├── portfolio/                #   포트폴리오 관리
│   │   │   ├── posts/                    #   게시글 관리
│   │   │   ├── erp/                      #   ERP 관리
│   │   │   │   ├── dashboard/            #     칸반보드 + 통계
│   │   │   │   ├── tasks/                #     작업 관리
│   │   │   │   └── workers/              #     작업자 관리
│   │   │   ├── process-board/            #   공정 현황 보드
│   │   │   ├── webhard/                  #   웹하드 관리
│   │   │   ├── sync-monitor/             #   동기화 모니터
│   │   │   ├── migration/                #   마이그레이션
│   │   │   ├── system/                   #   시스템 설정
│   │   │   └── feedback/                 #   피드백 관리
│   │   │
│   │   ├── company/                      # 거래처 대시보드
│   │   │   ├── layout.tsx                #   레이아웃 (세션 검증)
│   │   │   ├── dashboard/                #   대시보드
│   │   │   ├── profile/                  #   프로필 관리
│   │   │   ├── billing/                  #   청구서
│   │   │   └── feedback/                 #   피드백
│   │   │
│   │   ├── erp/                          # ERP 모바일
│   │   │   ├── login/                    #   PIN 로그인
│   │   │   ├── tasks/                    #   작업 목록
│   │   │   ├── process/                  #   공정 현황
│   │   │   ├── offline/                  #   오프라인 모드
│   │   │   ├── _components/              #   공통 컴포넌트
│   │   │   └── _lib/                     #   hooks, store, types
│   │   │
│   │   ├── webhard/                      # 웹하드
│   │   │   ├── page.tsx                  #   메인 (관리자/거래처 분기)
│   │   │   ├── components/               #   UI 컴포넌트
│   │   │   │   ├── containers/           #     컨테이너 컴포넌트
│   │   │   │   ├── presentational/       #     프레젠테이션 컴포넌트
│   │   │   │   └── context/              #     Context Provider
│   │   │   ├── hooks/                    #   커스텀 훅
│   │   │   └── _lib/                     #   유틸리티
│   │   │
│   │   ├── about/                        # 회사 소개
│   │   ├── portfolio/                    # 포트폴리오
│   │   ├── blog/                         # 블로그
│   │   ├── notice/                       # 공지사항
│   │   ├── contact/                      # 견적 문의
│   │   ├── login/                        # 로그인
│   │   ├── register/                     # 회원가입
│   │   │
│   │   ├── api/                          # API Routes
│   │   │   ├── admin/                    #   관리자 API
│   │   │   ├── auth/                     #   인증 API
│   │   │   ├── billing/                  #   청구서 API
│   │   │   ├── bookings/                 #   예약 API
│   │   │   ├── companies/                #   거래처 API
│   │   │   ├── company/                  #   거래처 전용 API
│   │   │   ├── contacts/                 #   문의 API
│   │   │   ├── erp/                      #   ERP API
│   │   │   ├── webhard/                  #   웹하드 API
│   │   │   ├── notifications/            #   알림 API
│   │   │   ├── push/                     #   푸시 알림 API
│   │   │   ├── sync/                     #   동기화 API
│   │   │   ├── portfolio/                #   포트폴리오 API
│   │   │   ├── health/                   #   헬스 체크
│   │   │   ├── inngest/                  #   Inngest 핸들러
│   │   │   ├── session/                  #   세션 API
│   │   │   └── debug/                    #   디버그 API (개발용)
│   │   │
│   │   └── actions/                      # Server Actions
│   │       ├── auth.ts
│   │       ├── register.ts
│   │       ├── contact.ts
│   │       ├── contacts.ts
│   │       ├── companies.ts
│   │       ├── company.ts
│   │       ├── feedback.ts
│   │       ├── process-board.ts
│   │       ├── activity-logs.ts
│   │       ├── webhard.ts
│   │       ├── webhard-batch-delete.ts
│   │       ├── webhard-move.ts
│   │       ├── webhard-folder-upload.ts
│   │       └── webhard-migrate.ts
│   │
│   ├── components/                       # 전역 공유 컴포넌트
│   │   ├── ui/                           #   기본 UI (Button, Modal, Input 등)
│   │   ├── layout/                       #   레이아웃 컴포넌트
│   │   ├── home/                         #   홈페이지 섹션 컴포넌트
│   │   ├── Header.tsx                    #   일반 페이지 헤더
│   │   ├── HomeHeader.tsx                #   홈페이지 헤더
│   │   ├── Footer.tsx                    #   푸터
│   │   ├── MainContent.tsx               #   메인 콘텐츠 래퍼
│   │   ├── SmoothScroll.tsx              #   Lenis 스무스 스크롤
│   │   ├── FloatingButtons.tsx           #   플로팅 버튼
│   │   ├── ErrorBoundary.tsx             #   에러 경계
│   │   └── JsonLd.tsx                    #   구조화 데이터
│   │
│   └── lib/
│       ├── api/                          # API 클라이언트
│       ├── auth/                         # 인증/보안
│       │   ├── session.ts                #   세션 관리
│       │   ├── security.ts               #   토큰 생성
│       │   ├── adminGuard.ts             #   관리자 인증
│       │   └── rateLimit.ts              #   Rate Limiting
│       ├── supabase/                     # Supabase 클라이언트
│       │   ├── client.ts                 #   브라우저 클라이언트
│       │   ├── server.ts                 #   서버 클라이언트
│       │   ├── admin.ts                  #   관리자 클라이언트
│       │   └── realtime-manager.ts       #   Realtime 구독 관리
│       ├── r2/                           # R2 파일 작업
│       ├── react-query/                  # React Query 설정
│       │   └── queryKeys.ts              #   쿼리 키 팩토리
│       ├── hooks/                        # 전역 커스텀 훅
│       ├── types/                        # 전역 타입 정의
│       ├── utils/                        # 유틸리티
│       │   ├── logger.ts                 #   로깅
│       │   ├── errors.ts                 #   에러 클래스
│       │   ├── format.ts                 #   포맷팅
│       │   ├── validation.ts             #   유효성 검증
│       │   ├── geometry.ts               #   네스팅 알고리즘
│       │   ├── processStages.ts          #   공정 단계 정의
│       │   └── constants.ts              #   상수
│       ├── store/                        # Zustand 스토어
│       ├── services/                     # 비즈니스 로직
│       ├── styles.ts                     # 스타일 상수 시스템
│       ├── inngest/                      # Inngest 함수
│       ├── sync/                         # 동기화 관련
│       ├── cache/                        # 캐싱
│       ├── images/                       # 이미지 처리
│       └── activity-logger.ts            # 활동 로그
│
├── webhard-api/                          # NestJS 백엔드
│   ├── src/
│   │   ├── main.ts                       # 엔트리포인트
│   │   ├── app.module.ts                 # 루트 모듈
│   │   ├── prisma/                       # Prisma 모듈
│   │   ├── auth/                         # 인증 모듈
│   │   │   ├── auth.service.ts
│   │   │   ├── guards/                   #   SessionAuthGuard, CompanyAccessGuard
│   │   │   ├── decorators/
│   │   │   └── strategies/
│   │   ├── files/                        # 파일 모듈
│   │   ├── folders/                      # 폴더 모듈
│   │   ├── storage/                      # 저장소 모듈 (R2)
│   │   ├── trash/                        # 휴지통 모듈
│   │   ├── search/                       # 검색 모듈
│   │   ├── settings/                     # 설정 모듈
│   │   ├── health/                       # 헬스 체크
│   │   ├── erp/                          # ERP 모듈
│   │   │   ├── tasks/                    #   작업 관리
│   │   │   ├── workers/                  #   작업자 관리
│   │   │   ├── machines/                 #   기계 관리
│   │   │   └── dashboard/                #   대시보드 통계
│   │   └── common/                       # 공통 DTO
│   └── prisma/
│       └── schema.prisma                 # Prisma 스키마
│
├── lguplus-webhard-sync/                 # LGU+ 동기화 CLI
│   ├── src/
│   │   ├── index.ts                      # 메인 엔트리포인트
│   │   ├── config.ts                     # 환경 설정
│   │   ├── bidirectional/                # 동기화 엔진
│   │   │   ├── engine.ts
│   │   │   ├── snapshot-sync-watcher.ts
│   │   │   ├── upload-history-poller.ts
│   │   │   ├── state-manager.ts
│   │   │   ├── conflict-resolver.ts
│   │   │   └── types.ts
│   │   ├── cli/                          # CLI 인터페이스
│   │   │   ├── index.ts
│   │   │   ├── commands/
│   │   │   └── sync-dashboard.ts
│   │   ├── lguplus/                      # LGU+ API 어댑터
│   │   │   ├── api-client.ts
│   │   │   ├── auth.ts
│   │   │   ├── browser.ts
│   │   │   └── navigator.ts
│   │   ├── self-webhard/                 # 자체 웹하드 어댑터
│   │   │   ├── api-client.ts
│   │   │   ├── uploader.ts
│   │   │   └── mapping.ts
│   │   ├── sync-service/                 # 동기화 서비스
│   │   │   ├── index.ts
│   │   │   ├── manager.ts
│   │   │   ├── api-server.ts
│   │   │   └── types.ts
│   │   ├── sync/                         # 동기화 유틸리티
│   │   └── utils/                        # 공통 유틸리티
│   │       ├── logger.ts
│   │       ├── retry-with-strategy.ts
│   │       ├── error-tracker.ts
│   │       └── path-resolver.ts
│   └── data/                             # 런타임 데이터 (gitignored)
│       ├── sync-state.db
│       └── logs/
│
├── middleware.ts                          # Next.js 미들웨어
├── next.config.ts                        # Next.js 설정
├── package.json                          # 루트 패키지
├── tsconfig.json                         # TypeScript 설정
├── CLAUDE.md                             # Claude Code 개발 규칙
└── .env.local                            # 환경변수 (gitignored)
```

---

_마지막 업데이트: 2026-02-19_
_대상 시스템: Next.js 15.5.x + NestJS 10.x + Prisma 6.x + LGU+ Sync CLI 1.1.0_
