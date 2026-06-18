# Phase 2: backup-auth-backend

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 루트)
- `/tasks/10-company-link-fix/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 아래 기존 코드를 반드시 읽어라:

- `webhard-api/src/backup/backup.controller.ts` — 현재 SessionAuthGuard 사용
- `webhard-api/src/backup/backup.module.ts` — 모듈 구성
- `webhard-api/src/integration/auth/api-key.guard.ts` — ApiKeyGuard 구현 (참고)
- `webhard-api/src/companies/companies.controller.ts` — ApiKeyGuard 사용 패턴 참고

## 작업 내용

### 배경

현재 `BackupController`는 `SessionAuthGuard`를 사용하고 있으나, 관리자는 Next.js 세션으로 인증하므로 NestJS 세션이 없다. 다른 관리자 API(예: CompaniesController)는 `ApiKeyGuard`를 사용하여 서버 to 서버 인증을 수행한다. BackupController도 동일 패턴으로 변경한다.

### `backup.controller.ts` 수정

1. **import 변경:**
   - 제거: `SessionAuthGuard`, `CurrentUser`, `SessionUser`
   - 추가: `ApiKeyGuard` (`'../integration/auth/api-key.guard'`에서 import — 경로는 기존 코드에서 확인)

2. **클래스 데코레이터 변경:**
   - `@UseGuards(SessionAuthGuard)` → `@UseGuards(ApiKeyGuard)`

3. **메서드 변경 (모든 핸들러에 적용):**
   - `@CurrentUser() user: SessionUser` 파라미터 제거
   - `this.ensureAdmin(user)` 호출 제거
   - 메서드 시그니처에서 user 파라미터 삭제

4. **`ensureAdmin()` 메서드 삭제:**
   - ApiKeyGuard가 서버 간 인증을 보장하므로 admin 확인 불필요. Next.js API route에서 admin 세션을 검증한 후 API key로 호출하기 때문.

5. **미사용 import 정리:**
   - `ForbiddenException` 제거 (ensureAdmin에서만 사용)

### `backup.module.ts` 확인

- `ApiKeyGuard`가 글로벌이 아닌 경우, module의 providers에 추가해야 할 수 있다. `CompaniesModule`이 어떻게 구성되었는지 참고하여 동일하게 처리하라.
- `ApiKeyGuard`가 이미 전역 등록되어 있다면 별도 추가 불필요.

## Acceptance Criteria

```bash
cd webhard-api && pnpm build && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/10-company-link-fix/index.json`의 phase 2 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `backup.service.ts`는 수정하지 마라. 서비스 로직은 변경 없음.
- `backup.controller.ts`만 수정한다. 인증 방식 변경일 뿐, 비즈니스 로직 변경이 아니다.
- 기존 테스트를 깨뜨리지 마라.
- ApiKeyGuard의 import 경로는 기존 코드(`companies.controller.ts`)에서 사용하는 것과 동일하게 맞춰라. 상대 경로가 다를 수 있으므로 backup 디렉토리 기준으로 경로를 조정하라.
