# 웹하드 성능 최적화 및 아키텍처 개선 제안서

> 작성일: 2026-03-11
> 최종 검증: 2026-03-11 (코드 레벨 직접 확인 완료)
> 기반: 01-operation-performance-test.md 분석 결과

---

## 1. 최적화 우선순위 요약

| 우선순위 | 항목 | 영향도 | 난이도 | 예상 효과 |
|---------|------|--------|--------|----------|
| P1 | 검색 성능 (ILIKE → pg_trgm) | 높음 | 중간 | 검색 10~100x 빨라짐 |
| P2 | 폴더 이동 중복명 검사 최적화 | 중간 | 낮음 | N+1 → 1 쿼리 |
| P3 | getAncestors 캐시 통합 | 중간 | 낮음 | 불필요한 전체 조회 제거 |
| P4 | 검색 경로 구성 최적화 | 중간 | 낮음 | N 라운드 → 1 쿼리 |
| P5 | WebSocket EventsGateway 인증 | 높음 | 중간 | 보안 강화 |
| P6 | console.error → Logger 전환 | 낮음 | 낮음 | 컨벤션 준수 |

---

## 2. 상세 최적화 방안

### 2.1 [P1] 검색 성능 — ILIKE → pg_trgm 인덱스

**현재 문제:**
```typescript
// files.service.ts, search.service.ts
{ name: { contains: searchQuery, mode: 'insensitive' } }
// → SQL: WHERE name ILIKE '%검색어%'
// B-tree 인덱스 미활용 → Full Table Scan
```

**해결 방안 A: pg_trgm GIN 인덱스 (추천)**

```sql
-- Migration
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX idx_webhard_files_name_trgm
  ON webhard_files USING GIN (name gin_trgm_ops);
CREATE INDEX idx_webhard_files_original_name_trgm
  ON webhard_files USING GIN (original_name gin_trgm_ops);
CREATE INDEX idx_webhard_folders_name_trgm
  ON webhard_folders USING GIN (name gin_trgm_ops);
```

- 장점: 코드 변경 없이 ILIKE 쿼리 성능 향상 (GIN 인덱스 자동 활용)
- 단점: 인덱스 크기 증가, 쓰기 성능 약간 감소
- 효과: ILIKE '%keyword%' 검색 10~100x 빨라짐

**해결 방안 B: PostgreSQL Full-Text Search (FTS)**

```sql
-- 파일명용 tsvector 컬럼 추가
ALTER TABLE webhard_files ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(original_name, ''))
  ) STORED;

CREATE INDEX idx_webhard_files_search ON webhard_files USING GIN (search_vector);
```

- 장점: 형태소 분석, 가중치 부여 가능
- 단점: 한국어 파일명 지원 불완전 (simple 사전 사용 필요), 스키마 변경 필요
- 적용 시기: 데이터 10만건 이상 시 검토

**권장**: 방안 A (pg_trgm) 먼저 적용. 코드 변경 없이 migration만 추가하면 됨.

---

### 2.2 [P2] 폴더 이동 중복명 검사 최적화

**현재 문제:**
```typescript
// folders.service.ts:552-584
let newName = folder.name;
let counter = 1;
let existing = await this.prisma.webhardFolder.findFirst({...});
while (existing) {
  newName = `${folder.name} (${counter})`;
  counter++;
  existing = await this.prisma.webhardFolder.findFirst({...}); // 매 루프 DB 쿼리
}
```

**해결 방안:**
```typescript
// 같은 이름 패턴의 폴더를 1회 쿼리로 모두 가져오기
async moveFolder(folderId: string, dto: MoveFolderDto, user: SessionUser) {
  // ... (기존 검증 코드)

  // 1회 쿼리로 같은 이름 패턴의 폴더 모두 조회
  const existingNames = await this.prisma.executeWithRetry(
    () =>
      this.prisma.webhardFolder.findMany({
        where: {
          parentId: dto.parentId ?? null,
          companyId: folder.companyId,
          deletedAt: null,
          NOT: { id: folderId },
          OR: [
            { name: folder.name },
            { name: { startsWith: `${folder.name} (` } },
          ],
        },
        select: { name: true },
      }),
    { operationName: 'moveFolder.findExistingNames' }
  );

  // 메모리에서 사용 가능한 이름 계산
  let newName = folder.name;
  if (existingNames.some((f) => f.name === folder.name)) {
    const existingNameSet = new Set(existingNames.map((f) => f.name));
    let counter = 1;
    while (existingNameSet.has(`${folder.name} (${counter})`)) {
      counter++;
    }
    newName = `${folder.name} (${counter})`;
  }

  // update...
}
```

**효과**: N+1 쿼리 → 1 쿼리로 감소

---

### 2.3 [P3] getAncestors — allFoldersCache 통합

**현재 문제:**
```typescript
// folders.service.ts:887-935 (getAncestors)
const allFolders = await this.prisma.webhardFolder.findMany({
  where: { deletedAt: null },
  include: { company: { select: { companyName: true } } },
});
// → 매 호출마다 전체 폴더 + company JOIN 쿼리
// getAllFoldersCached()와 별개로 실행
```

**해결 방안:**
```typescript
// 1. getAllFoldersCached 확장 — company 정보도 포함
private allFoldersCacheExtended: {
  data: Map<string, {
    id: string;
    name: string;
    parentId: string | null;
    companyId: number | null;
    path: string | null;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    company?: { companyName: string } | null;
  }>;
  timestamp: number;
} | null = null;

// 2. getAncestors에서 캐시 활용
async getAncestors(folderId: string, user: SessionUser) {
  const folderMap = await this.getAllFoldersCachedExtended();
  const currentFolder = folderMap.get(folderId);
  if (!currentFolder) throw new NotFoundException('Folder not found');

  this.verifyFolderAccess(currentFolder, user);

  const ancestors: FolderResponseDto[] = [];
  let parentId = currentFolder.parentId;
  while (parentId) {
    const parent = folderMap.get(parentId);
    if (!parent) break;
    ancestors.unshift(this.mapToDto(parent));
    parentId = parent.parentId;
  }

  return { ancestors, current: this.mapToDto(currentFolder) };
}
```

**효과**: 매 호출 DB 쿼리 → 10초 캐시 활용 (대부분의 breadcrumb 요청에서 DB 미접근)

---

### 2.4 [P4] 검색 경로 구성 최적화

**현재 문제:**
```typescript
// search.service.ts:136-171 (buildFolderPathMap)
while (idsToFetch.size > 0) {
  const currentBatch = Array.from(idsToFetch);
  // 배치별 DB 쿼리 → 깊은 폴더 시 N 라운드
  const fetchedFolders = await this.prisma.webhardFolder.findMany({...});
  // 부모가 아직 조회 안 됐으면 다음 배치에 추가
}
```

**해결 방안:**
```typescript
// 전체 폴더를 1회 조회 후 메모리에서 경로 구성
// (FoldersService.getAllFoldersCached()와 동일 패턴)
private async buildFolderPathMap(): Promise<Map<string, { name: string; parentId: string | null }>> {
  const allFolders = await this.prisma.executeWithRetry(
    () =>
      this.prisma.webhardFolder.findMany({
        where: { deletedAt: null },
        select: { id: true, name: true, parentId: true },
      }),
    { operationName: 'search.buildFolderPathMap' }
  );

  const folderMap = new Map<string, { name: string; parentId: string | null }>();
  for (const folder of allFolders) {
    folderMap.set(folder.id, { name: folder.name, parentId: folder.parentId });
  }
  return folderMap;
}
```

또는 FoldersService의 캐시를 SearchService에서 주입받아 공유:

```typescript
// search.module.ts에 FoldersService 주입
@Injectable()
export class SearchService {
  constructor(
    private prisma: PrismaService,
    private foldersService: FoldersService, // 캐시 공유
  ) {}
}
```

**효과**: N 라운드 쿼리 → 1 쿼리 (또는 캐시 HIT 시 0 쿼리)

---

### 2.5 [P5] WebSocket EventsGateway 인증 추가

**현재 문제:**
```typescript
// events.gateway.ts — 인증 없음
handleConnection(client: Socket) {
  this.logger.debug(`Client connected: ${client.id}`);
  // 누구나 연결 가능, 실시간 이벤트 수신 가능
}
```

**해결 방안:**
```typescript
// IntegrationGateway의 인증 패턴을 EventsGateway에 적용
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
          (client as Socket & { userData: unknown }).userData = user;
        }
      }
    }

    if (!authenticated) {
      this.logger.warn(`Unauthenticated WebSocket: ${client.id}`);
      client.disconnect();
      return;
    }
  } catch (err) {
    client.disconnect();
  }
}
```

**효과**: 인증되지 않은 클라이언트의 실시간 이벤트 수신 차단

---

### 2.6 [P6] console.error → Logger 전환

**현재 문제:**
```typescript
// storage.service.ts 전체 — console.error 7군데 사용
console.error('Failed to generate upload presigned URL:', error);
console.error('Failed to generate download presigned URL:', error);
// ... (프로젝트 컨벤션: Logger 사용 필수)
```

**해결 방안:**
```typescript
// StorageService에 Logger 추가
private readonly logger = new Logger(StorageService.name);

// console.error → this.logger.error 전환
this.logger.error('Failed to generate upload presigned URL', error);
```

**영향 범위**: `storage.service.ts` 내 7개 console.error

---

## 3. 아키텍처 개선 제안

### 3.1 폴더 캐시 아키텍처 통합

현재 폴더 관련 데이터를 여러 곳에서 중복 조회:

```
현재:
  FoldersService.allFoldersCache (10초) → isDescendantOf, getDescendantFolderIds
  FoldersService.getAncestors() → 매번 전체 조회 (캐시 미사용)
  FoldersService.batchDeleteFolders() → 매번 전체 조회 (캐시 미사용)
  SearchService.buildFolderPathMap() → 매번 부분 조회 (반복 라운드)

제안:
  FolderCacheService (공유 싱글톤)
    ├── allFolders: Map<id, FolderInfo> (10초 TTL)
    ├── parentMap: Map<id, parentId>
    ├── childrenMap: Map<parentId, childId[]>
    ├── getAncestors(id): FolderInfo[]
    ├── getDescendants(id): string[]
    ├── isDescendantOf(id, ancestorId): boolean
    ├── getPath(id): string
    └── invalidate(): void
```

**장점**:
- 단일 캐시 소스 (Single Source of Truth)
- 모든 서비스가 공유 → 불필요한 DB 쿼리 제거
- 캐시 무효화 1곳에서 관리

### 3.2 배치 작업 최대 크기 조정

현재 제한:
- 배치 업로드 presigned URL: 50개
- 배치 업로드 confirm: 500개
- 배치 이동/삭제: 100개

**불균형 문제**: presigned URL은 50개 제한인데 confirm은 500개까지.
프론트엔드에서 10번 presigned URL 요청 → 1번 confirm 호출하는 패턴.

**제안**: presigned URL 배치도 100개로 확장 (R2 API 부하 모니터링 후)

### 3.3 Soft Delete된 폴더의 R2 파일 정리

현재 `deleteFolder()` 시:
- 폴더+파일: soft delete만 수행
- R2 스토리지의 실제 파일은 그대로 유지
- `trash.cleanupExpiredFiles()`에서만 R2 삭제 (보존기간 3일 경과 후)

**문제**: 폴더 삭제 후 복원 시 파일은 DB에서 복원 가능하나, 폴더 자체의 복원 API 없음.

**제안**:
- 폴더 복원 API 추가 (`POST /trash/folders/:id/restore`)
- 또는 폴더 삭제 시 하위 파일도 trash에 표시되도록 정리

---

## 4. 구현 로드맵

### Phase 1 (즉시 적용 가능, 코드 변경 최소)
- [ ] **P6**: console.error → Logger 전환 — `storage.service.ts` 7개소 (`console.error` 전부)
- [ ] **P1**: pg_trgm 인덱스 추가 — Prisma migration 파일만 추가 (코드 변경 없음)
- [ ] **P2**: 폴더 이동 중복명 검사 1회 쿼리화 — `folders.service.ts:552-584`

### Phase 2 (캐시 아키텍처 개선)
- [ ] **P4**: getAncestors allFoldersCache 통합 — `folders.service.ts:887-935`
  - company relation 포함 캐시 확장 필요 (현재 캐시는 `id, parentId, companyId`만 포함)
- [ ] **P6 검색**: SearchService 경로 구성 최적화 — `search.service.ts:136-171`
  - 전체 폴더 1회 조회 후 메모리에서 경로 구성
- [ ] **3.1**: FolderCacheService 통합 (선택적 — 규모 확대 시 검토)

### Phase 3 (보안/인프라)
- [ ] **P5**: EventsGateway WebSocket 인증 추가 — `events.gateway.ts`
  - IntegrationGateway 패턴 (`integration.gateway.ts:33-95`) 그대로 적용
  - API Key 인증도 함께 지원 → 외부 동기화 프로그램도 EventsGateway 구독 가능
- [ ] **3.3**: 폴더 복원 API 추가 (`POST /trash/folders/:id/restore`)

---

## 5. 성능 영향도 예측

| 최적화 | Before | After | 개선율 |
|--------|--------|-------|--------|
| 검색 (pg_trgm) | O(N) scan | O(log N) index | 10~100x |
| 폴더 이동 중복명 | 1+N 쿼리 | 1 쿼리 | N배 |
| getAncestors | 1 full query | 캐시 HIT | ~100% |
| 검색 경로 | N 라운드 쿼리 | 1 쿼리 | N배 |
| Logger 전환 | - | - | 운영 가시성 향상 |
