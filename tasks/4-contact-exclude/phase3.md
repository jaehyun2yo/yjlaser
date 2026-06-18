# Phase 3: 프론트엔드 — Server Action + UI 컴포넌트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션)
- `docs/specs/features/auto-contact-exclude.md` (이번 기능 스펙)
- `/tasks/4-contact-exclude/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물과 기존 코드를 반드시 확인하라:

- `webhard-api/src/folders/folders.controller.ts` (Phase 1에서 추가된 엔드포인트 확인)
- `src/lib/api/nestjs-server-client.ts` (기존 API 클라이언트 패턴)
- `src/app/actions/webhard.ts` (기존 Server Action 패턴)
- `src/app/(admin)/admin/integration/webhard/_components/ExcludedFoldersSettings.tsx` (UI 패턴 참고 — 가장 유사한 기존 컴포넌트)
- `src/app/(admin)/admin/integration/webhard/_components/index.ts` (export 목록)
- `src/app/(admin)/admin/integration/webhard/page.tsx` (페이지 레이아웃)

이전 phase에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업 내용

### 1. `src/lib/api/nestjs-server-client.ts` 수정

기존 `serverGetExcludedFolders` / `serverUpdateExcludedFolders` 패턴을 그대로 따라 추가:

```typescript
export async function serverGetAutoContactExcludedFolders(): Promise<string[]> {
  // GET /api/v1/folders/config/auto-contact-excluded
  // 기존 serverGetExcludedFolders()와 동일한 패턴
}

export async function serverUpdateAutoContactExcludedFolders(
  folders: string[]
): Promise<{ success: boolean }> {
  // PUT /api/v1/folders/config/auto-contact-excluded
  // body: { folders }
  // 기존 serverUpdateExcludedFolders()와 동일한 패턴
}
```

기존 함수들의 HTTP 요청 방식(헤더, 에러 처리, baseUrl 등)을 정확히 따르라.

### 2. `src/app/actions/webhard.ts` 수정

기존 `getExcludedFolders` / `updateExcludedFolders` 패턴을 그대로 따라 추가:

```typescript
/**
 * 문의 자동생성 제외 폴더 목록 조회 (관리자 전용)
 */
export async function getAutoContactExcludedFolders(): Promise<{
  success: boolean;
  folders?: string[];
  error?: string;
}> {
  // 기존 getExcludedFolders()와 동일한 패턴
  // serverGetAutoContactExcludedFolders() 호출
}

/**
 * 문의 자동생성 제외 폴더 목록 수정 (관리자 전용)
 */
export async function updateAutoContactExcludedFolders(
  folders: string[]
): Promise<{ success: boolean; error?: string }> {
  // 기존 updateExcludedFolders()와 동일한 패턴
  // serverUpdateAutoContactExcludedFolders(folders) 호출
}
```

import에 `serverGetAutoContactExcludedFolders`, `serverUpdateAutoContactExcludedFolders`를 추가하라.

### 3. `src/app/(admin)/admin/integration/webhard/_components/AutoContactExcludedFoldersSettings.tsx` 신규 생성

**기존 `ExcludedFoldersSettings.tsx`를 그대로 복사한 뒤 아래만 변경:**

1. 컴포넌트명: `AutoContactExcludedFoldersSettings`
2. import 경로: `getExcludedFolders` → `getAutoContactExcludedFolders`, `updateExcludedFolders` → `updateAutoContactExcludedFolders`
3. 섹션 제목: "문의 자동생성 제외 설정"
4. 설명 텍스트: "아래 이름과 일치하는 폴더에 업로드된 파일은 문의가 자동 생성되지 않습니다."
5. 빈 상태 메시지: "제외 폴더가 없습니다. 아래에서 추가하세요."
6. 최소 개수 제한 제거: 기존 ExcludedFoldersSettings는 `if (next.length === 0)` 일 때 에러를 보여주지만, 이 컴포넌트는 빈 목록도 허용 (모든 폴더에서 문의 생성)

**핵심 UI 동작:**

- 태그 형태로 폴더명 표시 (기존과 동일)
- 추가: 입력 → Enter 또는 "추가" 버튼
- 삭제: 태그의 X 버튼
- 즉시 저장 (기존 패턴과 동일 — 추가/삭제 시 바로 DB 저장)
- 저장 피드백: "저장됨" / 에러 메시지 (기존과 동일)
- 중복 체크: 이미 존재하는 폴더명이면 에러 메시지

### 4. `src/app/(admin)/admin/integration/webhard/_components/index.ts` 수정

export 추가:

```typescript
export { default as AutoContactExcludedFoldersSettings } from './AutoContactExcludedFoldersSettings';
```

### 5. `src/app/(admin)/admin/integration/webhard/page.tsx` 수정

import에 `AutoContactExcludedFoldersSettings` 추가.

컴포넌트 배치: `FolderStatusMappingSettings` 바로 아래, `ExcludedFoldersSettings` 바로 위에 배치:

```tsx
<FolderStatusMappingSettings />
<AutoContactExcludedFoldersSettings />  {/* 새로 추가 */}
<ExcludedFoldersSettings />
<FolderTemplateSettings />
<BackupSettings />
```

페이지 설명 텍스트는 수정하지 않아도 됨 (현재: "웹하드 폴더 구조, 자동 문의 생성 매핑, 제외폴더를 설정합니다." — 이미 포괄적).

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/4-contact-exclude/index.json`의 phase 3 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `ExcludedFoldersSettings.tsx`의 코드를 수정하지 마라. 새 파일만 생성.
- 스타일 상수는 반드시 `@/lib/styles`에서 import하라 (`BG_COLOR`, `TEXT_COLOR`, `BORDER_COLOR`, `BUTTON_STYLES`). 직접 `dark:` 클래스를 사용하지 마라.
- Server Action에서 `getSessionUser()` 인증 체크를 반드시 포함하라 (기존 패턴 그대로).
- `nestjs-server-client.ts`에서 API 호출 시 기존 함수들과 동일한 헤더/에러 처리 패턴을 따르라.
- `@/` 절대 import만 사용하라. 상대 import 금지.
- `console.log` 대신 `logger` 사용하라 (Server Action에서).
- 기존 테스트를 깨뜨리지 마라.
