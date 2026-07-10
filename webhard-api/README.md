# Webhard API (NestJS)

웹하드 기능을 위한 NestJS 백엔드 API 서버입니다.

<!-- Railway auto-deploy 설정 복구 트리거 확인 (2026-04-21) -->

## 기술 스택

- **Framework**: NestJS 11
- **Database**: PostgreSQL (Supabase) + Prisma ORM
- **Storage**: Google Drive (신규 웹하드 파일) + Cloudflare R2 (포트폴리오/레거시 호환)
- **Authentication**: 세션 쿠키 기반 인증 (기존 Next.js 앱과 호환)

## 설치 및 실행

### 1. 의존성 설치

```bash
cd webhard-api
pnpm install
```

### 2. 환경 변수 설정

Next.js 루트의 `.env.local`을 먼저 사용합니다. 일반 개발에서는 `webhard-api/.env`를 만들지 않습니다. 로딩 순서는 `../.env.local` → `../.env` → `.env.local` → `.env`입니다.

```env
# Database (Supabase)
DATABASE_URL="postgresql://..."

# Session (메인 앱과 동일한 값 사용)
SESSION_SECRET="..."

# Google Drive webhard storage
GOOGLE_SERVICE_ACCOUNT_JSON="..."
GOOGLE_DRIVE_SHARED_DRIVE_ID="..."

# R2 Storage (portfolio/legacy compatibility)
R2_ACCOUNT_ID="..."
R2_ENDPOINT="..."
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET_NAME="..."
R2_PUBLIC_BASE_URL="..."

# App
NESTJS_PORT=4000
CORS_ORIGINS="http://localhost:3000"
```

### 3. Prisma 클라이언트 생성

```bash
pnpm prisma:generate
```

### 4. 개발 서버 실행

```bash
pnpm start:dev
```

서버가 `http://localhost:4000`에서 실행됩니다.

## API 엔드포인트

### Files API (`/api/v1/files`)

| Method | Endpoint               | 설명                           |
| ------ | ---------------------- | ------------------------------ |
| GET    | `/files`               | 파일 목록 (페이지네이션, 정렬) |
| GET    | `/files/search`        | 파일 검색                      |
| POST   | `/files/presigned-url` | 업로드 URL 생성                |
| POST   | `/files/batch/upload`  | 배치 업로드 URL 생성           |
| POST   | `/files/confirm`       | 업로드 완료 확인               |
| GET    | `/files/:id/download`  | 다운로드 URL                   |
| PATCH  | `/files/:id/rename`    | 이름 변경                      |
| PATCH  | `/files/:id/move`      | 이동                           |
| DELETE | `/files/:id`           | 삭제 (휴지통)                  |
| POST   | `/files/batch/delete`  | 배치 삭제                      |
| POST   | `/files/batch/move`    | 배치 이동                      |

### Folders API (`/api/v1/folders`)

| Method | Endpoint              | 설명                  |
| ------ | --------------------- | --------------------- |
| GET    | `/folders`            | 폴더 목록             |
| GET    | `/folders/tree`       | 폴더 트리             |
| GET    | `/folders/:id`        | 폴더 상세 + 하위 파일 |
| POST   | `/folders`            | 폴더 생성             |
| PATCH  | `/folders/:id/rename` | 이름 변경             |
| PATCH  | `/folders/:id/move`   | 이동                  |
| DELETE | `/folders/:id`        | 삭제                  |

### Trash API (`/api/v1/trash`)

| Method | Endpoint             | 설명          |
| ------ | -------------------- | ------------- |
| GET    | `/trash`             | 휴지통 목록   |
| GET    | `/trash/count`       | 휴지통 개수   |
| POST   | `/trash/:id/restore` | 복원          |
| DELETE | `/trash/:id`         | 영구 삭제     |
| DELETE | `/trash`             | 휴지통 비우기 |

### Health API (`/api/v1/health`)

| Method | Endpoint  | 설명           |
| ------ | --------- | -------------- |
| GET    | `/health` | 서버 상태 확인 |

## 인증

기존 Next.js 앱과 동일한 세션 쿠키(`admin-session`)를 사용합니다.
CORS 설정에서 credentials를 허용하여 쿠키 전송이 가능합니다.

### 권한 체계

- **Admin**: 모든 폴더/파일 접근 가능
- **Company**: 본인 업체 폴더 + 공용 폴더(company_id = null) 접근 가능

## 프로젝트 구조

```
webhard-api/
├── src/
│   ├── main.ts                 # 애플리케이션 진입점
│   ├── app.module.ts           # 루트 모듈
│   ├── auth/                   # 인증 모듈
│   │   ├── auth.module.ts
│   │   ├── auth.service.ts     # 세션 검증 로직
│   │   ├── guards/             # 인증 가드
│   │   └── decorators/         # 커스텀 데코레이터
│   ├── prisma/                 # Prisma 모듈
│   ├── storage/                # Google Drive 신규 웹하드 + R2 레거시/포트폴리오 호환
│   ├── files/                  # 파일 API
│   ├── folders/                # 폴더 API
│   ├── trash/                  # 휴지통 API
│   ├── health/                 # 헬스체크
│   └── common/                 # 공통 DTO
├── prisma/
│   └── schema.prisma           # Prisma 스키마
├── package.json
├── nest-cli.json
├── tsconfig.json
└── Dockerfile
```

## Docker 배포

```bash
# 빌드
docker build -t webhard-api .

# 실행
docker run -p 4000:4000 --env-file .env webhard-api
```

## 개발 명령어

```bash
pnpm start:dev      # 개발 모드 (watch)
pnpm build          # 프로덕션 빌드
pnpm start:prod     # 프로덕션 실행
pnpm prisma:studio  # Prisma Studio 실행
```

## 프론트엔드 연동

Next.js 프론트엔드에서 이 API를 사용하려면:

1. 환경 변수 추가:

```env
NEXT_PUBLIC_WEBHARD_API_URL=http://localhost:4000
```

2. API 클라이언트 사용:

```typescript
import { getFiles, createFolder } from '@/lib/api/webhard-api-client';

// 파일 목록 조회
const { files, total } = await getFiles({ folderId: '...' });

// 폴더 생성
const folder = await createFolder('새 폴더', parentId);
```
