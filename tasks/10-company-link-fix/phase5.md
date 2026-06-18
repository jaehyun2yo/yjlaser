# Phase 5: docs-final

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 루트)
- `/tasks/10-company-link-fix/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase에서 변경된 모든 코드를 반드시 확인하라:

- `webhard-api/src/companies/laser-only-mapping.service.ts` — Phase 1: linkCompany에 contact 동기화
- `webhard-api/src/companies/dto/laser-only-mapping.dto.ts` — Phase 1: DTO에 updated_contact_count 추가
- `webhard-api/src/companies/__tests__/laser-only-mapping.service.spec.ts` — Phase 1: 테스트 추가
- `webhard-api/src/backup/backup.controller.ts` — Phase 2: SessionAuthGuard → ApiKeyGuard
- `src/app/api/admin/backup/[...path]/route.ts` — Phase 3: 프록시 API route 신규
- `src/app/(admin)/admin/integration/webhard/_components/BackupSettings.tsx` — Phase 3: 호출 경로 변경
- `e2e/laser-only-company.spec.ts` — Phase 4: E2E 테스트 추가

## 작업 내용

### 1. 코드와 문서 불일치 확인 및 수정

Phase 0에서 사전 업데이트한 문서와 실제 구현 결과를 비교하여 불일치가 있으면 수정한다.

확인 대상 문서:

- `docs/specs/features/laser-only-company-inquiry.md`
- `docs/specs/api/nestjs-endpoints.md`
- `docs/specs/api/nextjs-routes.md`
- `docs/API.md`

### 2. `docs/changelog/CHANGELOG.md` 기록

기존 CHANGELOG 형식에 맞춰 아래 내용을 추가한다:

```markdown
## 2026-04-16

### Fixed

- 레이저가공 업체 관리에서 업체 연결 시 기존 문의의 companyName이 업데이트되지 않아 업체 대시보드에서 조회되지 않던 문제 수정
- 웹하드 관리 > 백업현황 데이터가 로드되지 않던 문제 수정 (BackupController 인증 방식 SessionAuth → ApiKey 변경 + Next.js 프록시 route 추가)

### Added

- linkCompany 시 기존 Contact의 companyName 일괄 동기화 + ContactStatusHistory 이력 기록
- `/api/admin/backup/[...path]` 프록시 API route (허용 경로 화이트리스트 적용)
- E2E 테스트: 업체 연결 후 문의 동기화 검증, 백업 설정 페이지 로드 검증
```

### 3. spec 문서 최종 동기화

실제 구현과 spec이 다른 부분이 있으면 spec을 수정한다. 특히:

- `linkCompany`의 반환값 변경 (updated_contact_count 추가) 확인
- backup API route의 화이트리스트 경로 목록이 실제 구현과 일치하는지 확인
- Phase 3에서 BackupSettings.tsx의 fetch 함수명이나 구조가 spec과 다르면 문서 수정

## Acceptance Criteria

```bash
npx tsc --noEmit
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/10-company-link-fix/index.json`의 phase 5 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 코드를 수정하지 마라. 이 phase는 문서 동기화만 수행한다.
- CHANGELOG 날짜는 `2026-04-16`으로 기록하라.
- 이미 최신 상태인 문서는 건드리지 마라. 불일치가 있는 부분만 수정.
- CHANGELOG 항목은 간결하게. 한 줄에 하나의 변경사항.
