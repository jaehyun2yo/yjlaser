# Phase 0: docs-sync

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 루트)
- `docs/API.md`
- `docs/specs/features/laser-only-company-inquiry.md`
- `docs/specs/api/nestjs-endpoints.md`
- `docs/specs/api/nextjs-routes.md`

## 작업 내용

이번 task(company-link-fix)에서 변경될 내용을 사전에 문서에 반영한다. 두 가지 버그픽스:

### 1. `docs/specs/features/laser-only-company-inquiry.md` 업데이트

"요구사항 > 기능 요구사항" 섹션에 아래 항목을 추가:

> **7. 업체 연결 시 기존 문의 동기화**: 관리자가 레이저가공 업체 관리에서 미연결 매핑에 업체를 연결(`linkCompany`)하면, 해당 폴더명(`folderName`)으로 저장된 기존 Contact들의 `companyName`을 연결된 Company의 `companyName`으로 일괄 업데이트한다. 단, `folderName === Company.companyName`이면 스킵한다. 업데이트된 Contact에는 ContactStatusHistory에 `changeType='company_linked'` 이력을 기록한다. 50건 단위 batch 처리.

### 2. `docs/specs/api/nestjs-endpoints.md` 업데이트

backup 관련 엔드포인트 섹션에서:

- `BackupController`의 인증 방식을 `SessionAuthGuard` → `ApiKeyGuard`로 변경 표기
- 각 엔드포인트(`GET /backup/settings`, `PUT /backup/settings`, `GET /backup/eligible`, `POST /backup/execute`, `GET /backup/status`, `GET /backup/history`, `GET /backup/browse-directories`)의 Auth 컬럼을 `ApiKey`로 수정

### 3. `docs/specs/api/nextjs-routes.md` 업데이트

아래 프록시 API route를 추가:

| Method       | Path                          | 설명                                                                                                              | Auth          |
| ------------ | ----------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------- |
| GET/POST/PUT | `/api/admin/backup/[...path]` | NestJS backup API 프록시. 허용 경로: `settings`, `eligible`, `status`, `execute`, `history`, `browse-directories` | Admin session |

### 4. `docs/API.md` 업데이트

backup API 호출 패턴 변경 내용 반영:

- 기존: 프론트엔드에서 NestJS 직접 호출 (SessionAuth)
- 변경: Next.js API route 프록시 경유 (Admin session → ApiKey)

## Acceptance Criteria

```bash
npx tsc --noEmit
```

위 커맨드가 에러 없이 통과해야 한다 (문서 변경만이므로 타입 체크로 충분).

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/10-company-link-fix/index.json`의 phase 0 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 코드를 수정하지 마라. 이 phase는 문서 업데이트만 수행한다.
- 기존 문서의 구조와 포맷을 유지하라. 새로운 섹션을 추가할 때 기존 패턴을 따라라.
- 문서에 없는 엔드포인트가 있다면 해당 부분만 추가하라. 기존 내용을 재작성하지 마라.
