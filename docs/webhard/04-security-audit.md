# 웹하드 보안 전수조사 보고서

> 작성일: 2026-03-11
> 최종 검증: 2026-03-11 (코드 레벨 직접 확인 완료)
> 대상: webhard-api (NestJS Backend) 전체 코드
> 기준: OWASP Top 10 2021, NestJS 보안 베스트 프랙티스

---

## 1. 조사 범위

| 영역         | 파일 수 | 조사 항목                      |
| ------------ | ------- | ------------------------------ |
| 인증/인가    | 7       | 세션, API Key, 가드, WebSocket |
| 입력 검증    | 20      | DTO, ValidationPipe, 파라미터  |
| 파일 처리    | 6       | 업로드, 다운로드, 삭제, ZIP    |
| 데이터베이스 | 4       | Prisma, Raw SQL, 인젝션        |
| API 설정     | 2       | CORS, Body 제한, 글로벌 설정   |
| 실시간 통신  | 2       | WebSocket, Socket.IO           |
| 스토리지     | 1       | R2, Presigned URL              |
| 에러 처리    | 전체    | 정보 노출, 로깅                |

---

## 2. 발견 사항 요약

### 심각도 기준

- **CRITICAL**: 즉시 조치 필요, 악용 시 데이터 유출/손상 가능
- **HIGH**: 조기 조치 권장, 보안 우회 가능
- **MEDIUM**: 계획적 조치, 보안 강화 필요
- **LOW**: 개선 권장, 컨벤션/모범 사례 위반
- **INFO**: 참고 사항

| ID  | 심각도       | 항목                                               | 위치                       |
| --- | ------------ | -------------------------------------------------- | -------------------------- |
| S01 | **CRITICAL** | WebSocket EventsGateway 미인증                     | events.gateway.ts          |
| S02 | **HIGH**     | sortBy 필드 미검증 (Prisma injection)              | files.service.ts           |
| S03 | **HIGH**     | 파일명 길이 미검증                                 | file.dto.ts                |
| S04 | **HIGH**     | contentType 미검증                                 | file.dto.ts                |
| S05 | **MEDIUM**   | $executeRawUnsafe 사용                             | files.service.ts:212       |
| S06 | **MEDIUM**   | 세션 쿠키 디버그 로깅                              | session-auth.guard.ts      |
| S07 | **MEDIUM**   | console.error 사용 (정보 노출)                     | storage.service.ts         |
| S08 | **MEDIUM**   | Rate Limiting 미구현                               | main.ts                    |
| S09 | **MEDIUM**   | 폴더 이름 검증 부족                                | folder.dto.ts              |
| S10 | **LOW**      | CORS 환경변수 혼용                                 | main.ts, events.gateway.ts |
| S11 | **LOW**      | Presigned URL 재사용 방지 없음                     | storage.service.ts         |
| S12 | **LOW**      | 성능 메트릭 무인증                                 | storage.controller.ts      |
| S13 | **INFO**     | API Key 해시 알고리즘                              | api-key.service.ts         |
| S14 | **INFO**     | 세션 만료 시간 없음                                | auth.service.ts            |
| S15 | **HIGH**     | multipart/initiate body.key 미검증 (경로 탈출)     | files.controller.ts:203    |
| S16 | **MEDIUM**   | multipart/presign partNumber 범위 미검증           | files.controller.ts:215    |
| S17 | **MEDIUM**   | downloadZip fileIds 배열 크기 제한 없음            | files.controller.ts:183    |
| S18 | **MEDIUM**   | IntegrationGateway 쿠키 로깅 (부분 노출)           | integration.gateway.ts:40  |
| S19 | **LOW**      | getBatchDeleteStats folderIds 쿼리 파라미터 미검증 | folders.controller.ts:68   |

---

## 3. 상세 분석

### S01 [CRITICAL] WebSocket EventsGateway 미인증

**위치**: `webhard-api/src/events/events.gateway.ts`

**현재 코드**:

```typescript
@WebSocketGateway({
  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:3000').split(','),
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection {
  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
    // 인증 없음 — 누구나 연결 가능
  }

  @SubscribeMessage('subscribe:folder')
  handleSubscribeFolder(client: Socket, folderId: string) {
    client.join(`folder:${folderId || 'root'}`);
    // 인증 없이 모든 폴더의 실시간 이벤트 수신 가능
  }
}
```

**위험**:

- 인증되지 않은 사용자가 WebSocket에 연결하여 실시간 파일/폴더 변경 이벤트 수신 가능
- 파일 생성/삭제/이동 정보, 폴더 구조 변경 정보 노출
- folderId를 조작하여 모든 폴더의 이벤트 수신 가능

**참고**: `IntegrationGateway`는 쿠키/API Key 인증이 구현되어 있음 (동일 패턴 적용 가능)

**수정 방안**:

```typescript
async handleConnection(client: Socket) {
  try {
    const cookie = client.handshake.headers.cookie;
    let authenticated = false;

    if (cookie) {
      const adminMatch = cookie.match(/admin-session=([^;]+)/);
      if (adminMatch) {
        const user = this.authService.verifySession(adminMatch[1]);
        if (user) {
          authenticated = true;
          (client as Socket & { userData: SessionUser }).userData = user;
        }
      }
    }

    if (!authenticated) {
      this.logger.warn(`Unauthenticated WebSocket connection rejected: ${client.id}`);
      client.disconnect();
      return;
    }
  } catch {
    client.disconnect();
  }
}
```

---

### S02 [HIGH] sortBy 필드 미검증 (Dynamic Property Access)

**위치**: `webhard-api/src/files/files.service.ts:795-804`

**현재 코드**:

```typescript
private mapSortField(sortBy: string): string {
  const fieldMap: Record<string, string> = {
    created_at: 'createdAt',
    date: 'createdAt',
    name: 'name',
    size: 'size',
    updated_at: 'updatedAt',
  };
  return fieldMap[sortBy] || 'createdAt'; // fallback은 있지만...
}

// 사용처:
orderBy: { [this.mapSortField(sortBy)]: sortOrder } // 동적 프로퍼티 키
```

**위험**:

- `sortBy` DTO에서 `@IsString()` 검증만 수행 — 어떤 문자열이든 허용
- 매핑 실패 시 'createdAt' fallback이 있어 SQL injection은 아니지만, Prisma가 알 수 없는 필드를 받으면 에러 발생 가능
- `sortOrder`도 `'asc' | 'desc'` 타입이지만 DTO에서 `@IsString()`만 검증

**수정 방안**:

```typescript
// file.dto.ts에 검증 추가
export class GetFilesQueryDto {
  @IsOptional()
  @IsIn(['created_at', 'date', 'name', 'size', 'updated_at'])
  sortBy?: string = 'created_at';

  @IsOptional()
  @IsIn(['asc', 'desc'])
  sortOrder?: 'asc' | 'desc' = 'desc';
}
```

---

### S03 [HIGH] 파일명 길이 미검증

**위치**: `webhard-api/src/files/dto/file.dto.ts`

**현재 코드**:

```typescript
export class RenameFileDto {
  @IsString()
  name: string; // 길이 제한 없음
}

export class ConfirmUploadDto {
  @IsString()
  name: string; // 길이 제한 없음

  @IsString()
  originalName: string; // 길이 제한 없음

  @IsString()
  key: string; // 길이 제한 없음 (R2 경로)

  @IsString()
  mimeType: string; // 길이 제한 없음
}
```

**위험**:

- 극도로 긴 파일명으로 DB 저장 시 문제 발생 가능 (PostgreSQL text 제한은 1GB이지만)
- 극도로 긴 key 값으로 R2 API 호출 시 예기치 않은 동작
- 메모리 기반 DoS 가능성 (극단적 경우)

**수정 방안**:

```typescript
export class RenameFileDto {
  @IsString()
  @MaxLength(500)
  @MinLength(1)
  name: string;
}

export class ConfirmUploadDto {
  @IsString()
  @MaxLength(1000)
  key: string;

  @IsString()
  @MaxLength(500)
  @MinLength(1)
  name: string;

  @IsString()
  @MaxLength(500)
  originalName: string;

  @IsString()
  @MaxLength(200)
  mimeType: string;
}
```

---

### S04 [HIGH] contentType 미검증

**위치**: `webhard-api/src/files/dto/file.dto.ts:104`

**현재 코드**:

```typescript
export class CreatePresignedUrlDto {
  @IsString()
  contentType: string; // 어떤 MIME 타입이든 허용
}
```

**위험**:

- 악의적인 contentType으로 Presigned URL 발급 가능
- 실행 가능한 파일 타입 (application/x-executable 등) 업로드 가능
- R2에 저장된 파일이 CDN을 통해 서빙될 경우, 브라우저에서 실행될 수 있음

**수정 방안**:

```typescript
// 허용 MIME 타입 화이트리스트 또는 블랙리스트
const BLOCKED_MIME_TYPES = [
  'application/x-executable',
  'application/x-sh',
  'application/x-shellscript',
  'text/html', // XSS 방지
];

export class CreatePresignedUrlDto {
  @IsString()
  @MaxLength(200)
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/)
  contentType: string;
}

// 서비스에서 추가 검증
if (BLOCKED_MIME_TYPES.includes(dto.contentType)) {
  throw new BadRequestException('This file type is not allowed');
}
```

---

### S05 [MEDIUM] $executeRawUnsafe 사용

**위치**: `webhard-api/src/files/files.service.ts:212`

**현재 코드**:

```typescript
await this.prisma.$executeRawUnsafe(
  `INSERT INTO "webhard_files" (...) VALUES ($1::uuid, $2, $3, ...)`,
  id, dto.name, dto.originalName, size, dto.mimeType, dto.key, ...
);
```

**분석**:

- Parameterized query 사용 중 ($1, $2, ...) → SQL injection 방지됨
- 그러나 `$executeRawUnsafe` 함수는 Prisma 보안 가이드에서 주의 권장
- `$executeRaw` (tagged template literal)로 전환하면 더 안전

**수정 방안**:

```typescript
await this.prisma.$executeRaw`
  INSERT INTO "webhard_files"
  ("id", "name", "original_name", "size", "mime_type", "path",
   "folder_id", "company_id", "uploaded_by", "inquiry_number",
   "is_downloaded", "created_at", "updated_at")
  VALUES (${id}::uuid, ${dto.name}, ${dto.originalName}, ${size},
          ${dto.mimeType}, ${dto.key}, ${dto.folderId ?? null}::uuid,
          ${effectiveCompanyId}, ${uploadedBy}::bigint,
          ${dto.inquiryNumber ?? null}, ${false}, ${now}, ${now})
`;
```

---

### S06 [MEDIUM] 세션 쿠키 디버그 로깅

**위치**: `webhard-api/src/auth/guards/session-auth.guard.ts:21-30`

**현재 코드**:

```typescript
this.logger.debug(
  `Auth check: cookieHeader=${!!cookieHeader}, hasCookies=${hasCookies}, hasSessionCookie=${!!sessionCookie}`
);

if (cookieHeader && !sessionCookie) {
  this.logger.debug(
    `Cookie header present but session not found. Available cookies: ${Object.keys(request.cookies || {}).join(', ')}`
  );
}

// ...
this.logger.debug(`Session verification failed for cookie: ${sessionCookie?.substring(0, 20)}...`);
```

**위험**:

- 세션 쿠키 값의 첫 20자를 로그에 출력
- 쿠키 이름 목록을 로그에 출력
- 로그 수집 시스템이 있으면 세션 정보 유출 가능
- 프로덕션에서 debug 로그가 활성화되면 위험

**수정 방안**:

```typescript
// 프로덕션에서는 최소한의 정보만 로깅
this.logger.debug(`Auth check: hasSession=${!!sessionCookie}`);

if (!user) {
  this.logger.debug('Session verification failed');
  // 쿠키 값을 로그에 절대 포함하지 않음
}
```

---

### S07 [MEDIUM] console.error 사용 (정보 노출 + 컨벤션 위반)

**위치**: `webhard-api/src/storage/storage.service.ts` (7개소)

**현재 코드**:

```typescript
console.error('Failed to generate upload presigned URL:', error);
console.error('Failed to generate download presigned URL:', error);
console.error('Failed to delete file:', error);
console.error('Failed to delete files batch:', error);
console.error('Failed to initiate multipart upload:', error);
console.error('Failed to generate multipart presigned URL:', error);
console.error('Failed to complete multipart upload:', error);
```

**추가 위치**: `webhard-api/src/main.ts:67`

```typescript
console.log(`Webhard API is running on: http://localhost:${port}/api/v1`);
```

**위험**:

- `error` 객체에 R2 자격증명, 내부 경로 등 민감 정보 포함 가능
- 프로젝트 컨벤션 위반 (Logger 사용 필수)
- 구조화된 로깅 미지원

**수정 방안**: 모든 `console.error` → `this.logger.error`, `console.log` → `this.logger.log` 전환

---

### S08 [MEDIUM] Rate Limiting 미구현

**위치**: `webhard-api/src/main.ts` (전체 애플리케이션)

**현재 상태**: Rate limiting 관련 설정 없음.

**위험**:

- Presigned URL 대량 발급 요청 → R2 API 남용
- 배치 confirm 반복 호출 → DB 부하
- 검색 API 반복 호출 → Full scan 부하 (P1 최적화 전)
- 인증 실패 반복 → 브루트 포스 공격

**수정 방안**:

```typescript
// @nestjs/throttler 사용
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';

// app.module.ts
ThrottlerModule.forRoot([{
  ttl: 60000,  // 1분
  limit: 100,  // 100 요청/분
}])

// 특정 엔드포인트에 더 엄격한 제한
@Throttle({ default: { limit: 10, ttl: 60000 } }) // 10 요청/분
@Post('presigned-url')
async getPresignedUrl(...) {}
```

---

### S09 [MEDIUM] 폴더 이름 검증 부족

**위치**: `webhard-api/src/folders/dto/folder.dto.ts:74`

**현재 코드**:

```typescript
export class CreateFolderDto {
  @IsString()
  name: string; // 길이 제한, 특수문자 검증 없음
}

export class RenameFolderDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  newName?: string;
}
```

**위험**:

- 경로 구분자 포함 가능 (`../`, `/`, `\`)
- 제어 문자 포함 가능 (`\x00`, `\n`)
- 극도로 긴 이름 가능
- 빈 문자열 허용 가능 (공백만 포함)

**수정 방안**:

```typescript
export class CreateFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(255)
  @Matches(/^[^\/\\:*?"<>|]+$/, { message: 'Folder name contains invalid characters' })
  name: string;
}
```

---

### S10 [LOW] CORS 환경변수 혼용

**위치**:

- `main.ts:36`: `CORS_ORIGINS` (복수) 우선, `CORS_ORIGIN` (단수) fallback
- `events.gateway.ts:29`: `CORS_ORIGIN` (단수)만 사용
- `integration.gateway.ts:18`: `CORS_ORIGIN` (단수)만 사용

**위험**:

- WebSocket Gateway가 `CORS_ORIGINS`를 무시하고 `CORS_ORIGIN`만 참조
- 관리자가 `CORS_ORIGINS`만 설정하면 WebSocket CORS 미적용
- 일관되지 않은 CORS 정책

**수정 방안**: 모든 곳에서 동일한 CORS 설정 유틸리티 사용

---

### S11 [LOW] Presigned URL 재사용 방지 없음

**위치**: `webhard-api/src/storage/storage.service.ts`

**현재 상태**: Presigned URL 발급 후 만료 전까지 무제한 사용 가능.

**위험**:

- 업로드 URL 유출 시 같은 key로 파일 덮어쓰기 가능
- 다운로드 URL 유출 시 만료 전 무제한 다운로드 가능

**완화 요소**:

- key에 timestamp + random 포함 → 예측 어려움
- 만료 시간 짧음 (업로드 10분, 다운로드 5분)

---

### S12 [LOW] 성능 메트릭 엔드포인트 접근 제어 부족

**위치**: `webhard-api/src/storage/storage.controller.ts:33`

**현재 코드**:

```typescript
@Get('performance')
async getPerformanceMetrics() {
  return this.storageService.getPerformanceMetrics();
  // SessionAuthGuard는 컨트롤러 레벨에서 적용되지만
  // 관리자 전용 검증 (AdminGuard) 없음
}
```

**위험**:

- 업체(company) 사용자도 전체 시스템 성능 메트릭 조회 가능
- 총 파일 수, 총 용량, 업체 수, 폴더 깊이 등 내부 정보 노출

**수정 방안**:

```typescript
@Get('performance')
@UseGuards(AdminGuard)
async getPerformanceMetrics() { ... }
```

---

### S13 [INFO] API Key 해시 알고리즘

**위치**: `webhard-api/src/integration/auth/api-key.service.ts:122`

**현재**: SHA-256 단방향 해시 사용.

**참고**: API Key는 비밀번호와 달리 고엔트로피 (64 hex chars)이므로 SHA-256로 충분. bcrypt/argon2는 불필요.

**상태**: 양호 (조치 불필요)

---

### S14 [INFO] 세션 만료 시간 없음

**위치**: `webhard-api/src/auth/auth.service.ts`

**현재 상태**: 세션 쿠키에 만료 시간(exp) 클레임 없음. 서명 검증만 수행.

**참고**: 세션 만료는 Next.js 프론트엔드에서 쿠키 maxAge로 관리하므로, 백엔드에서 별도 만료 검증은 선택적.

**권장**: 장기적으로 세션 토큰에 발급 시간(iat) 포함하여 백엔드에서도 만료 검증 추가.

---

## 4. 양호 사항 (Good Practices)

| 항목                    | 설명                                                                  |
| ----------------------- | --------------------------------------------------------------------- |
| 타이밍 안전 비교        | `crypto.timingSafeEqual` 사용 (auth.service.ts:105)                   |
| 세션 서명               | HMAC-SHA256 서명 검증 (auth.service.ts:98)                            |
| 입력 검증 글로벌 파이프 | ValidationPipe (whitelist + forbidNonWhitelisted) (main.ts:56)        |
| UUID 파라미터 검증      | ParseUUIDPipe 사용 (모든 컨트롤러)                                    |
| Soft Delete 패턴        | 기본 삭제는 휴지통 이동, 영구삭제는 휴지통 항목에 대한 명시 승인 필요 |
| 회사별 접근 제어        | verifyFileAccess/verifyFolderAccess (서비스 레벨)                     |
| API Key 캐싱            | 5분 TTL 인메모리 캐시 (brute force 부하 경감)                         |
| 파일명 새니타이징       | 스토리지 경로용 (storage.service.ts:477)                              |
| 쿠키 파서               | cookie-parser 미들웨어 사용 (main.ts:29)                              |
| Body 크기 제한          | 10MB (main.ts:25)                                                     |
| Integration 인증        | ApiKeyGuard — Session OR API Key 이중 인증                            |
| IntegrationGateway 인증 | WebSocket 연결 시 쿠키/API Key 검증                                   |
| DB 연결 복원력          | 자동 재시도, 헬스체크, 동시 재연결 방지                               |

---

## 5. 조치 우선순위 로드맵

### Phase 1: 긴급 조치 (1-2일)

- [ ] **S01**: EventsGateway WebSocket 인증 추가 — `events.gateway.ts` (IntegrationGateway 패턴 적용)
- [ ] **S02**: sortBy, sortOrder DTO 검증 강화 (@IsIn) — `file.dto.ts`
- [ ] **S03**: 파일명/key 길이 제한 추가 (@MaxLength) — `file.dto.ts`
- [ ] **S04**: contentType 검증 (MIME 패턴 매칭) — `file.dto.ts`
- [ ] **S15**: multipart key 경로 탈출 방지 — `files.controller.ts` + DTO 추가

### Phase 2: 단기 조치 (1주)

- [ ] **S05**: $executeRawUnsafe → $executeRaw 전환 — `files.service.ts:212`
- [ ] **S06**: 디버그 로그에서 쿠키 값 제거 — `session-auth.guard.ts`
- [ ] **S07**: console.error → Logger 전환 (7개소) — `storage.service.ts`
- [ ] **S09**: 폴더 이름 특수문자/길이 검증 — `folder.dto.ts`
- [ ] **S12**: 성능 메트릭 엔드포인트 AdminGuard 추가 — `storage.controller.ts:33`
- [ ] **S16**: multipart partNumber 범위 검증 (@Min(1) @Max(10000)) — `files.controller.ts`
- [ ] **S17**: downloadZip fileIds 배열 크기 제한 (@ArrayMaxSize(50)) — `files.controller.ts`
- [ ] **S18**: IntegrationGateway 쿠키 로깅 제거 — `integration.gateway.ts:40`
- [ ] **S19**: getBatchDeleteStats folderIds UUID 검증 — `folders.controller.ts:68`

### Phase 3: 중기 조치 (2-4주)

- [ ] **S08**: Rate Limiting 구현 (@nestjs/throttler) — `main.ts`, `app.module.ts`
- [ ] **S10**: CORS 환경변수 통합 — `events.gateway.ts`, `integration.gateway.ts`
- [ ] **S14**: 세션 토큰에 발급 시간 추가 — `auth.service.ts`

---

## 6. OWASP Top 10 체크리스트

| #   | 위험                      | 현재 상태 | 발견 사항                                 |
| --- | ------------------------- | --------- | ----------------------------------------- |
| A01 | Broken Access Control     | 부분 양호 | S01 (WebSocket 미인증), S12 (메트릭 접근) |
| A02 | Cryptographic Failures    | 양호      | HMAC-SHA256, timing-safe compare          |
| A03 | Injection                 | 부분 양호 | S05 ($executeRawUnsafe), S02 (sortBy)     |
| A04 | Insecure Design           | 양호      | 적절한 아키텍처                           |
| A05 | Security Misconfiguration | 부분 주의 | S08 (Rate Limit), S10 (CORS)              |
| A06 | Vulnerable Components     | 확인 필요 | 의존성 감사 미실시                        |
| A07 | Auth Failures             | 양호      | 적절한 세션/API Key 관리                  |
| A08 | Data Integrity Failures   | 양호      | 서명 검증, 입력 검증                      |
| A09 | Logging Failures          | 부분 주의 | S06 (민감정보 로깅), S07 (console 사용)   |
| A10 | SSRF                      | 양호      | 외부 URL 요청 없음 (R2 Presigned만)       |

---

---

### S15 [HIGH] multipart/initiate body.key 미검증 (경로 탈출)

**위치**: `webhard-api/src/files/files.controller.ts:203`

**현재 코드**:

```typescript
@Post('multipart/initiate')
async initiateMultipartUpload(
  @Body() body: { key: string; contentType: string },
  @CurrentUser() _user: SessionUser
) {
  return this.storageService.initiateMultipartUpload(body.key, body.contentType);
  // body.key는 어떤 문자열도 허용 — R2에 임의 경로로 멀티파트 업로드 시작 가능
}
```

**위험**:

- `body.key`가 DTO 없이 직접 처리되어 어떤 문자열도 허용
- 경로 탈출 문자 (`../`, `..\\`) 포함 가능
- 다른 업체 폴더에 파일 덮어쓰기 시도 가능 (예: `webhard/company-1/secret-file`)
- R2 루트에 임의 파일 업로드 가능 (예: `../admin-backdoor.js`)

**실제 코드 확인**:

- `multipart/presign`, `multipart/complete`, `multipart/abort`도 동일하게 `body.key` 직접 사용

**수정 방안**:

```typescript
// DTO 추가 (file.dto.ts)
export class InitiateMultipartDto {
  @IsString()
  @Matches(/^webhard\/(company-\d+|admin)\/[a-zA-Z0-9\-\/_.]+$/, {
    message: 'Invalid storage key format'
  })
  @MaxLength(1000)
  key: string;

  @IsString()
  @Matches(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-^_.+]*$/)
  @MaxLength(200)
  contentType: string;
}

// 컨트롤러에서 key 소유권 검증
@Post('multipart/initiate')
async initiateMultipartUpload(@Body() body: InitiateMultipartDto, @CurrentUser() user: SessionUser) {
  // key가 현재 사용자의 company 범위 내인지 검증
  if (user.userType === 'company') {
    const expectedPrefix = `webhard/company-${user.companyId}/`;
    if (!body.key.startsWith(expectedPrefix)) {
      throw new ForbiddenException('Key does not belong to your company');
    }
  }
  return this.storageService.initiateMultipartUpload(body.key, body.contentType);
}
```

---

### S16 [MEDIUM] multipart/presign partNumber 범위 미검증

**위치**: `webhard-api/src/files/files.controller.ts:215`

**현재 코드**:

```typescript
@Post('multipart/presign')
async getMultipartPresignedUrl(
  @Body() body: { key: string; uploadId: string; partNumber: number },
  @CurrentUser() _user: SessionUser
) {
  // partNumber 범위 검증 없음 (0, 음수, 10001 이상 허용)
  const url = await this.storageService.getMultipartPresignedUrl(body.key, body.uploadId, body.partNumber);
}
```

**위험**:

- R2/S3 멀티파트 업로드는 partNumber 1~10000만 허용
- 범위 외 값 전달 시 R2 API 에러 → 서버에서 InternalServerError 반환
- 악의적으로 많은 presigned URL 발급 요청으로 R2 API 비용 발생

**수정 방안**:

```typescript
export class MultipartPresignDto {
  @IsString()
  key: string;

  @IsString()
  uploadId: string;

  @IsInt()
  @Min(1)
  @Max(10000)
  @Type(() => Number)
  partNumber: number;
}
```

---

### S17 [MEDIUM] downloadZip fileIds 배열 크기 제한 없음

**위치**: `webhard-api/src/files/files.controller.ts:183`

**현재 코드**:

```typescript
@Post('batch/download-zip')
async downloadZip(
  @Body() body: { fileIds: string[] },
  @CurrentUser() user: SessionUser,
  @Res() res: Response
) {
  // fileIds 크기 제한 없음 — 수천 개 파일을 ZIP으로 요청 가능
  const files = await this.filesService.getFilesForZip(body.fileIds, user);
  const archive = await this.zipService.createZipStream(files);
  // archive.pipe(res) — 서버 메모리/CPU 과부하 가능
}
```

**위험**:

- fileIds 배열 크기 제한 없음 → 수천 개 파일 ZIP 요청 가능
- 각 파일을 R2에서 스트리밍하면서 서버 메모리 과부하 가능
- 서버 OOM (Out of Memory) 가능성

**수정 방안**:

```typescript
export class DownloadZipDto {
  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(50) // 최대 50개 파일로 제한
  fileIds: string[];
}

@Post('batch/download-zip')
async downloadZip(@Body() body: DownloadZipDto, ...) { ... }
```

---

### S18 [MEDIUM] IntegrationGateway 쿠키 로깅 (부분 노출)

**위치**: `webhard-api/src/integration/gateway/integration.gateway.ts:40`

**현재 코드**:

```typescript
this.logger.debug(
  `Connection attempt: ${client.id}, cookies: ${cookie ? cookie.replace(/=([^;]{10})[^;]*/g, '=$1...') : 'none'}, ...`
);
// 쿠키 값의 첫 10자가 로그에 출력됨
```

**위험**:

- 세션 쿠키 값의 첫 10자가 debug 로그에 기록됨
- 로그 수집 시스템이 있다면 세션 토큰 부분 노출
- S06과 동일한 패턴이지만 IntegrationGateway에서도 발생

**수정 방안**:

```typescript
this.logger.debug(`Connection attempt: ${client.id}, hasCookie=${!!cookie}, hasApiKey=${!!apiKey}`);
// 쿠키 값 절대 로그에 포함하지 않음
```

---

### S19 [LOW] getBatchDeleteStats folderIds 쿼리 파라미터 미검증

**위치**: `webhard-api/src/folders/folders.controller.ts:68`

**현재 코드**:

```typescript
@Get('batch-delete')
async getBatchDeleteStats(
  @Query('folderIds') folderIds: string,
  @CurrentUser() user: SessionUser
) {
  const ids = folderIds.split(',').filter((id) => id.trim());
  // UUID 형식 검증 없이 split만 수행
  return this.foldersService.getBatchDeleteStats(ids, user);
}
```

**위험**:

- UUID 형식 검증 없음 — 임의 문자열이 Prisma where 조건으로 전달
- Prisma는 UUID 형식이 아니면 에러 반환 (서버 에러 노출)
- 대량의 ID로 DoS 가능

**수정 방안**:

```typescript
// DTO 또는 커스텀 파이프로 UUID 배열 검증
const ids = folderIds
  .split(',')
  .map((id) => id.trim())
  .filter((id) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  );

if (ids.length === 0) throw new BadRequestException('No valid folder IDs provided');
if (ids.length > 100) throw new BadRequestException('Too many folder IDs (max 100)');
```

---

## 7. 의존성 보안 권장 사항

```bash
# 정기적으로 실행
npm audit
npx audit-ci --high

# Snyk 또는 Dependabot 설정 권장
```

현재 주요 의존성:

- `@nestjs/*`: 10.x (현재 최신)
- `@prisma/client`: 버전 확인 필요
- `@aws-sdk/client-s3`: 버전 확인 필요
- `socket.io`: 버전 확인 필요
- `archiver`: ZIP 처리 (zip bomb 주의)
