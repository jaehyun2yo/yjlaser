# 웹하드 동작 및 성능 테스트 보고서

> 작성일: 2026-03-11
> 최종 검증: 2026-03-11 (코드 레벨 직접 확인 완료)
> 대상: webhard-api (NestJS Backend)
> 범위: 파일/폴더 CRUD 전체 API

---

## 1. API 엔드포인트 목록

### 파일 (Files) — `/api/v1/files`

| Method | Endpoint | 기능 | 인증 |
|--------|----------|------|------|
| GET | `/files` | 파일 목록 (페이지네이션) | Session |
| GET | `/files/search` | 파일 검색 | Session |
| GET | `/files/badge-counts` | 미다운로드 파일 카운트 | Session |
| GET | `/files/new` | 신규(미다운로드) 파일 목록 | Session |
| POST | `/files/mark-downloaded` | 다운로드 마킹 | Session |
| POST | `/files/presigned-url` | 업로드 Presigned URL 발급 | Session |
| POST | `/files/batch/upload` | 배치 Presigned URL 발급 | Session |
| POST | `/files/confirm` | 업로드 확인 (메타데이터 저장) | Session |
| POST | `/files/batch/confirm` | 배치 업로드 확인 (최대 500개) | Session |
| GET | `/files/:id/download` | 다운로드 Presigned URL | Session |
| PATCH | `/files/:id/rename` | 파일 이름 변경 | Session |
| PATCH | `/files/:id/move` | 파일 이동 | Session |
| POST | `/files/batch/move` | 배치 파일 이동 (최대 100개) | Session |
| DELETE | `/files/:id` | 파일 삭제 (soft delete) | Session |
| POST | `/files/batch/delete` | 배치 파일 삭제 (최대 100개) | Session |
| POST | `/files/batch/download-zip` | ZIP 압축 다운로드 | Session |
| POST | `/files/multipart/initiate` | 멀티파트 업로드 시작 | Session |
| POST | `/files/multipart/presign` | 파트별 Presigned URL | Session |
| POST | `/files/multipart/complete` | 멀티파트 업로드 완료 | Session |
| POST | `/files/multipart/abort` | 멀티파트 업로드 취소 | Session |

### 폴더 (Folders) — `/api/v1/folders`

| Method | Endpoint | 기능 | 인증 |
|--------|----------|------|------|
| GET | `/folders` | 폴더 목록 | Session |
| GET | `/folders/tree` | 폴더 트리 (전체) | Session |
| GET | `/folders/children` | 자식 폴더 (지연 로딩) | Session |
| GET | `/folders/batch-delete` | 배치 삭제 통계 조회 | Session |
| DELETE | `/folders/batch-delete` | 배치 폴더 삭제 | Session |
| GET | `/folders/:id/ancestors` | 폴더 경로 (breadcrumb) | Session |
| GET | `/folders/:id` | 폴더 상세 (하위 폴더+파일) | Session |
| POST | `/folders` | 폴더 생성 | Session |
| PATCH | `/folders/:id/rename` | 폴더 이름 변경 | Session |
| PATCH | `/folders/:id/move` | 폴더 이동 | Session |
| DELETE | `/folders/:id` | 폴더 삭제 (soft delete, 하위 포함) | Session |

### 휴지통 (Trash) — `/api/v1/trash`

| Method | Endpoint | 기능 | 인증 |
|--------|----------|------|------|
| GET | `/trash` | 휴지통 파일 목록 | Session |
| GET | `/trash/count` | 휴지통 파일 수 | Session |
| POST | `/trash/:id/restore` | 파일 복원 | Session |
| DELETE | `/trash/:id` | 영구 삭제 (R2 + DB) | Session |
| DELETE | `/trash` | 휴지통 비우기 | Session |

### 검색 (Search) — `/api/v1/search`

| Method | Endpoint | 기능 | 인증 |
|--------|----------|------|------|
| GET | `/search` | 통합 검색 (파일+폴더) | Session |

---

## 2. 기능별 동작 분석

### 2.1 파일 업로드

#### 단일 업로드 흐름
```
Client → POST /files/presigned-url (filename, contentType, folderId)
       ← { url, key, expiresAt }
Client → PUT url (파일 데이터 → R2 직접 업로드)
Client → POST /files/confirm (key, name, originalName, size, mimeType, folderId)
       ← FileResponseDto
       → WebSocket: file:created 이벤트 발행
```

**DB 쿼리 수**: 3회
1. `verifyFolderAccess` — webhardFolder.findUnique (folderId 있을 때)
2. `$executeRawUnsafe` — INSERT INTO webhard_files
3. `webhardFile.findUnique` — 생성된 파일 조회 (include company)

**성능 특성**:
- Presigned URL 발급은 R2 서명만 수행 (DB 미접근, ~5ms)
- 실제 파일 업로드는 클라이언트 → R2 직접 (서버 비경유)
- confirmUpload에서 raw SQL 사용 (Prisma ORM 대비 빠름)
- 결과: 단일 업로드는 문제 없음

#### 배치 업로드 흐름 (대량 파일)
```
Client → POST /files/batch/upload (files: CreatePresignedUrlDto[])
       ← { urls: PresignedUrlResponseDto[] }
Client → 각 URL로 R2 업로드 (병렬)
Client → POST /files/batch/confirm (files: ConfirmUploadDto[], 최대 500개)
       ← { success, failed, errors }
       → WebSocket: 폴더별 batch:update 이벤트 (디바운스 500ms)
```

**DB 쿼리 수**: 2~3회
1. `findMany` — 폴더 접근 권한 일괄 검증 (고유 폴더 수만큼)
2. `createMany` — 단일 INSERT 문 (500개까지)
3. WebSocket 이벤트 발행 (DB 미접근)

**성능 특성**:
- Presigned URL 배치: 20개씩 청크 처리 (R2 부하 제한)
- DB INSERT: `createMany`로 단일 쿼리 (매우 효율적)
- 9000파일 = 18배치 × 500개 = 18 INSERT 문
- 폴더 접근 검증: 중복 제거 → 폴더 수만큼만 쿼리
- **병목**: Presigned URL 발급 (R2 API 호출 수)

#### 멀티파트 업로드 (대용량 파일)
```
Client → POST /files/multipart/initiate (key, contentType)
       ← { uploadId, key }
Client → POST /files/multipart/presign (key, uploadId, partNumber) × N
       ← { url }
Client → PUT url (파트 데이터) × N
Client → POST /files/multipart/complete (key, uploadId, parts[])
       ← { success }
Client → POST /files/confirm (일반 확인 플로우)
```

**성능 특성**:
- 파트별 Presigned URL 만료: 1시간
- R2 API 호출 수: initiate(1) + presign(N) + complete(1)
- 서버 DB 부하 없음 (R2 API만 사용)

---

### 2.2 파일 삭제

#### 단일 삭제 (Soft Delete)
```
Client → DELETE /files/:id
       → DB: findUnique + update (deletedAt, deletedBy 설정)
       → WebSocket: file:deleted
```

**DB 쿼리 수**: 2회 (findUnique + update)

#### 배치 삭제
```
Client → POST /files/batch/delete (fileIds: string[], 최대 100개)
       → DB: findMany (권한 검증) + updateMany (일괄 soft delete)
       → WebSocket: file:deleted (글로벌)
```

**DB 쿼리 수**: 2회 (findMany + updateMany)
- N+1 문제 없음 (최적화됨)
- 권한 검증: 메모리에서 필터링

#### 영구 삭제 (Trash)
```
Client → DELETE /trash/:id
       → DB: findUnique
       → R2: deleteFile (실제 스토리지 삭제)
       → DB: delete (레코드 완전 삭제)
```

**DB 쿼리 수**: 2회 + R2 1회

#### 휴지통 비우기
```
Client → DELETE /trash
       → DB: findMany (보존기간 3일 내 파일)
       → R2: deleteFiles (배치 삭제, 1000개 청크 × 3병렬)
       → DB: deleteMany
```

**성능 특성**:
- R2 삭제: 1000개씩 청크, 3개 병렬 처리
- 대량 파일 시 R2 삭제가 주요 병목

---

### 2.3 파일 이동

#### 단일 이동
```
Client → PATCH /files/:id/move (folderId)
       → DB: findUnique + verifyFolderAccess + update
       → WebSocket: file:moved (소스/타겟 폴더 모두)
```

**DB 쿼리 수**: 3회

#### 배치 이동
```
Client → POST /files/batch/move (fileIds: string[], targetFolderId)
       → DB: verifyFolderAccess + findMany + updateMany
       → WebSocket: file:moved
```

**DB 쿼리 수**: 3회 (최적화됨, N+1 없음)

---

### 2.4 파일 이름 변경

```
Client → PATCH /files/:id/rename (name: string)
       → DB: findUnique + update (include company)
       → WebSocket: file:renamed
```

**DB 쿼리 수**: 2회
- **참고**: 파일 이름 중복 검사 없음 (같은 폴더 내 동명 파일 허용)

---

### 2.5 폴더 생성

```
Client → POST /folders (name, parentId?, companyId?)
       → DB: findUnique (부모 폴더 검증) + findFirst (중복명 검사) + create
       → WebSocket: folder:created (글로벌)
       → 캐시 무효화: allFoldersCache
```

**DB 쿼리 수**: 2~3회
- 중복명 검사: 같은 부모 + 같은 회사 + 같은 이름 → ConflictException

---

### 2.6 폴더 삭제

#### 단일 삭제
```
Client → DELETE /folders/:id
       → DB: findUnique (폴더 조회)
       → 메모리: getDescendantFolderIds (전체 폴더 캐시 → BFS)
       → DB: $transaction [updateMany(폴더들), updateMany(파일들)]
       → WebSocket: folder:deleted (글로벌)
       → 캐시 무효화
```

**DB 쿼리 수**: 3회 (findUnique + getAllFoldersCached + $transaction)
- 하위 폴더+파일 일괄 soft delete (트랜잭션)
- BFS로 하위 폴더 탐색 (메모리)

#### 배치 삭제
```
Client → DELETE /folders/batch-delete (folderIds)
       → DB: findMany (선택 폴더 권한 확인)
       → DB: findMany (전체 폴더 조회)
       → 메모리: BFS로 하위 폴더 ID 수집
       → DB: $transaction [updateMany(폴더들), updateMany(파일들)]
       → 캐시 무효화
```

**DB 쿼리 수**: 3회
- **참고**: 전체 폴더를 DB에서 조회하여 메모리에서 BFS (캐시와 별도)

---

### 2.7 폴더 이동

```
Client → PATCH /folders/:id/move (parentId)
       → DB: findUnique (대상 폴더)
       → DB: findUnique (타겟 부모 폴더)
       → 메모리: isDescendantOf (순환 참조 검사, 캐시 사용)
       → DB: findFirst (중복명 검사) × N (while 루프)
       → DB: update
       → WebSocket: folder:moved (글로벌)
       → 캐시 무효화
```

**DB 쿼리 수**: 4 + N회 (중복명이 있으면 추가 쿼리)
- **성능 이슈**: 중복명 검사가 while 루프로 개별 쿼리 (예: "폴더 (1)", "폴더 (2)", ...)
- 순환 참조 검사: allFoldersCache (10초 TTL) 활용

---

### 2.8 폴더 이름 변경

```
Client → PATCH /folders/:id/rename (name 또는 newName)
       → DB: findUnique + findFirst (중복명 검사) + update
       → WebSocket: folder:renamed (글로벌)
       → 캐시 무효화
```

**DB 쿼리 수**: 3회
- 중복명 검사: 같은 부모 + 같은 회사 + 다른 ID → ConflictException

---

## 3. 성능 특성 요약

### 3.1 쿼리 패턴 분석

| 작업 | DB 쿼리 수 | 배치 최적화 | N+1 문제 |
|------|-----------|-----------|---------|
| 파일 업로드 (단일) | 3 | - | 없음 |
| 파일 업로드 (배치 500개) | 2~3 | createMany | 없음 |
| 파일 삭제 (단일) | 2 | - | 없음 |
| 파일 삭제 (배치 100개) | 2 | updateMany | 없음 |
| 파일 이동 (단일) | 3 | - | 없음 |
| 파일 이동 (배치 100개) | 3 | updateMany | 없음 |
| 파일 이름 변경 | 2 | - | 없음 |
| 폴더 생성 | 2~3 | - | 없음 |
| 폴더 삭제 (단일) | 3 | $transaction | 없음 |
| 폴더 삭제 (배치) | 3 | $transaction | 없음 |
| 폴더 이동 | 4+N | - | **있음 (중복명)** |
| 폴더 이름 변경 | 3 | - | 없음 |
| 검색 | 2~3+N | - | **있음 (경로 구성)** |
| 폴더 경로 (ancestors) | 2 | - | 없음 (전체 조회) |
| 폴더 트리 | 1 | - | 없음 |

### 3.2 캐시 현황

| 캐시 | TTL | 용도 | 무효화 조건 |
|------|-----|------|-----------|
| allFoldersCache | 10초 | 순환 참조 검사, 하위 폴더 탐색 | 폴더 CUD 시 |
| performanceMetricsCache | 5분 | 성능 메트릭 대시보드 | TTL 만료 |
| apiKeyCache | 5분 | API Key 검증 | TTL 만료 |

### 3.3 인덱스 현황 (PostgreSQL)

**webhard_files 인덱스:**
- `folderId`
- `companyId`
- `deletedAt`
- `companyId + deletedAt` (복합)
- `folderId + deletedAt` (복합)
- `isDownloaded + deletedAt` (복합)
- `name + folderId + deletedAt` (복합)

**webhard_folders 인덱스:**
- `parentId`
- `companyId`
- `path`
- `deletedAt`
- `name + parentId + companyId` (복합)
- `parentId + deletedAt` (복합)

### 3.4 잠재적 병목 지점

#### P1 (높음) — 검색 성능
- `contains` + `mode: 'insensitive'` → PostgreSQL ILIKE 변환
- ILIKE는 B-tree 인덱스를 활용하지 못함
- 데이터 증가 시 full table scan 발생 가능
- **영향**: 파일/폴더 검색, 통합 검색

#### P2 (중간) — 폴더 이동 중복명 검사
- while 루프 내 개별 DB 쿼리
- 최악의 경우: "폴더", "폴더 (1)", ... "폴더 (N)" → N+1 쿼리
- **영향**: 폴더 이동

#### P3 (중간) — 검색 경로 구성
- `buildFolderPathMap()`: 부모 체인을 배치 루프로 N회 DB 쿼리
- 깊은 폴더 구조에서 반복 쿼리 발생
- **영향**: 통합 검색 결과의 경로 표시

#### P4 (낮음) — getAncestors 전체 폴더 조회
- 매 호출마다 전체 폴더를 DB에서 조회 (allFoldersCache 미사용)
- company relation 포함하여 데이터량 많음
- **코드 위치**: `folders.service.ts:887-935` — `getAllFoldersCached()`와 별개로 `findMany({ include: { company } })`
- **영향**: breadcrumb 표시

#### P5 (낮음) — 배치 삭제 전체 폴더 조회
- `batchDeleteFolders()`: 전체 폴더를 별도로 조회 (캐시 미사용)
- allFoldersCache와 중복
- **코드 위치**: `folders.service.ts:751-758` — `findMany({ where: { deletedAt: null }, select: { id, parentId } })`

#### P6 (낮음) — 검색 buildFolderPathMap 반복 라운드 쿼리 (코드 직접 확인)
- **코드 위치**: `search.service.ts:136-171`
- while 루프 내에서 `idsToFetch`에 새 부모 폴더가 추가될 때마다 DB 쿼리
- 파일/폴더의 부모→조부모→... 체인을 따라 N라운드 발생
- **실제 코드**:
  ```typescript
  while (idsToFetch.size > 0) {
    const currentBatch = Array.from(idsToFetch);
    const fetchedFolders = await this.prisma.webhardFolder.findMany({...});
    for (const folder of fetchedFolders) {
      if (folder.parentId && !fetchedIds.has(folder.parentId)) {
        idsToFetch.add(folder.parentId); // 부모가 있으면 다음 라운드에 추가
      }
    }
  }
  ```
- **최악의 경우**: 폴더 깊이 N → N번 DB 왕복

---

## 4. 실시간 이벤트 (WebSocket) 분석

### 이벤트 타입

| 이벤트 | 범위 | 트리거 |
|--------|------|--------|
| `file:created` | 해당 폴더 Room | 파일 업로드 확인 |
| `file:deleted` | 해당 폴더 Room / 글로벌 | 파일 삭제 |
| `file:moved` | 소스+타겟 폴더 Room | 파일 이동 |
| `file:renamed` | 해당 폴더 Room | 파일 이름 변경 |
| `folder:created` | 글로벌 | 폴더 생성 |
| `folder:deleted` | 글로벌 | 폴더 삭제 |
| `folder:moved` | 글로벌 | 폴더 이동 |
| `folder:renamed` | 글로벌 | 폴더 이름 변경 |
| `batch:update` | 해당 폴더 Room | 배치 업로드 (디바운스 500ms) |

### 이벤트 아키텍처
- **EventsGateway** (웹하드 전용): 인증 없음, 폴더별 Room 구독
- **IntegrationGateway** (통합 모듈): 인증 있음 (쿠키/API Key), 주문/납품/재고 이벤트

---

## 5. 에러 핸들링 및 복원력

### 자동 재시도 (PrismaService.executeWithRetry)
- **대상 에러**: 08P01, 08006, 08003, 08001, 57P01, 57P02, 57P03, XX000, XX001
- **재시도**: 최대 3회, 지수 백오프 (1초 → 2초 → 4초, 최대 10초)
- **연결 리셋**: disconnect → sleep(1초) → reconnect (최대 3회)
- **동시 재연결 방지**: isReconnecting 플래그

### 헬스체크
- **주기**: 5분
- **방식**: `SELECT 1` 쿼리
- **연속 실패 시**: 2회 실패 → 연결 리셋

### Body Size 제한
- JSON body: 10MB (기본 100KB에서 확장)
- 배치 confirm (500개 파일 메타데이터) 지원

---

## 6. 결론

### 잘 동작하는 부분
1. 배치 작업이 잘 최적화됨 (createMany, updateMany, $transaction)
2. N+1 문제 대부분 해결됨 (findMany → 메모리 필터링)
3. 인메모리 캐시로 반복 쿼리 절약 (폴더 구조, API Key, 메트릭)
4. WebSocket 배치 디바운스 (500ms)로 이벤트 폭주 방지
5. 자동 재시도 + 헬스체크로 연결 안정성 확보

### 개선이 필요한 부분
1. **검색 성능 [P1]**: ILIKE 기반 (`contains + mode: 'insensitive'`) → pg_trgm 인덱스 전환 필요
   - 코드: `files.service.ts:114-116`, `search.service.ts:25-33`
2. **폴더 이동 중복명 [P2]**: while 루프 내 반복 DB 쿼리 → 단일 findMany로 최적화
   - 코드: `folders.service.ts:552-584`
3. **getAncestors 캐시 미활용 [P4]**: 매 호출 전체 폴더 + company JOIN 조회 → allFoldersCache 공유
   - 코드: `folders.service.ts:887-935`
4. **검색 경로 구성 반복 쿼리 [P6]**: while 루프 N라운드 → 전체 폴더 1회 조회로 통합
   - 코드: `search.service.ts:136-171`
5. **WebSocket 인증**: EventsGateway에 인증 없음 → 보안 이슈 (S01 참조)
   - 코드: `events.gateway.ts:43-45` (handleConnection에 인증 로직 없음)
