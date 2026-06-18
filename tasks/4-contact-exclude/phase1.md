# Phase 1: 백엔드 — Config 레이어 (WebhardConfigService + API)

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션)
- `docs/specs/features/auto-contact-exclude.md` (이번 기능 스펙)
- `/tasks/4-contact-exclude/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물과 기존 코드를 반드시 확인하라:

- `webhard-api/src/folders/webhard-config.service.ts` (기존 config 서비스 — 패턴 참고)
- `webhard-api/src/folders/dto/webhard-config.dto.ts` (기존 DTO — 패턴 참고)
- `webhard-api/src/folders/folders.controller.ts` (기존 config 엔드포인트 — 패턴 참고)

이전 phase에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업 내용

### 1. `webhard-api/src/folders/webhard-config.service.ts` 수정

기존 `EXCLUDED_FOLDERS_KEY` / `getExcludedFolders` / `updateExcludedFolders` 패턴을 그대로 따라서 아래를 추가:

**새 상수:**

```typescript
private static readonly AUTO_CONTACT_EXCLUDED_KEY = 'webhard_auto_contact_excluded_folders';
private static readonly DEFAULT_AUTO_CONTACT_EXCLUDED: string[] = ['ㄱ 내리기전용'];
```

**새 캐시 필드:**

```typescript
private autoContactExcludedCache: { data: string[]; expiry: number } | null = null;
```

**새 메서드 3개:**

1. `getAutoContactExcludedFolders(): Promise<string[]>`
   - 기존 `getExcludedFolders()`와 동일한 패턴 (캐시 → DB 조회 → 기본값 시딩)
   - `AUTO_CONTACT_EXCLUDED_KEY` 사용, `autoContactExcludedCache` 사용

2. `updateAutoContactExcludedFolders(folders: string[]): Promise<{ success: boolean }>`
   - 기존 `updateExcludedFolders()`와 동일한 패턴
   - `autoContactExcludedCache = null`로 캐시 무효화

3. `isAutoContactExcluded(folderPath: string): Promise<boolean>`
   - 핵심 비즈니스 로직: 경로를 `/`로 split → trim → filter(Boolean) → 각 세그먼트가 제외 목록과 정확 일치하는지 체크
   - 기존 `classifyByFolderPath()`의 세그먼트 파싱 패턴을 참고
   - 하나라도 매칭되면 `true` 반환

시그니처:

```typescript
async isAutoContactExcluded(folderPath: string): Promise<boolean> {
  const excluded = await this.getAutoContactExcludedFolders();
  const segments = folderPath.split('/').map(s => s.trim()).filter(Boolean);
  return segments.some(seg => excluded.includes(seg));
}
```

### 2. `webhard-api/src/folders/dto/webhard-config.dto.ts` 수정

기존 `UpdateExcludedFoldersDto` 패턴을 따라 추가:

```typescript
export class UpdateAutoContactExcludedFoldersDto {
  @IsArray()
  @IsString({ each: true })
  folders: string[];
}
```

`class-validator`의 `IsArray` import가 없으면 추가하라.

### 3. `webhard-api/src/folders/folders.controller.ts` 수정

기존 `config/excluded-folders` 엔드포인트 패턴을 따라, 바로 아래에 추가:

```typescript
/**
 * GET /folders/config/auto-contact-excluded - Get auto-contact excluded folders list
 */
@Get('config/auto-contact-excluded')
@UseGuards(AdminGuard)
async getAutoContactExcludedFolders() {
  return this.webhardConfigService.getAutoContactExcludedFolders();
}

/**
 * PUT /folders/config/auto-contact-excluded - Update auto-contact excluded folders list
 */
@Put('config/auto-contact-excluded')
@UseGuards(AdminGuard)
async updateAutoContactExcludedFolders(@Body() dto: UpdateAutoContactExcludedFoldersDto) {
  return this.webhardConfigService.updateAutoContactExcludedFolders(dto.folders);
}
```

`UpdateAutoContactExcludedFoldersDto`를 import에 추가하라.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/4-contact-exclude/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 기존 `getExcludedFolders`, `updateExcludedFolders`, `classifyByFolderPath` 메서드를 수정하지 마라. 새 메서드만 추가.
- 기존 캐시 필드(`mappingsCache`, `excludedCache`)를 건드리지 마라.
- DTO에서 `@IsArray()` 데코레이터를 반드시 사용하라 (빈 배열도 허용).
- 기존 테스트를 깨뜨리지 마라.
