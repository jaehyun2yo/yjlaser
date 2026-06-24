# Codex Development Workflow

YJ Laser 프로젝트에서 Codex가 작업할 때 따르는 표준 흐름이다. 목적은 빠른 수정이 아니라, 원인을 확인하고 코드·테스트·문서를 함께 맞추는 것이다.

## 1. 작업 시작

1. `git status --short`로 기존 변경사항을 확인한다.
2. 이미 dirty 상태인 파일은 사용자 소유로 간주한다.
3. 새 작업과 무관한 변경은 되돌리거나 스테이징하지 않는다.
4. 다음 문서를 먼저 확인한다.
   - `docs/progress.txt`
   - `docs/features-list.md`
   - 관련 `docs/specs/features/*`
   - API 변경 시 `docs/specs/api/*`
   - DB 변경 시 `docs/specs/db/prisma-tables.md`

작업 전 질문은 최소화하되, 스코프·권한·데이터 소유권이 불명확하면 구현 전에 확인한다.

## 2. 원인 분석

버그나 테스트 실패는 소비 지점에서 덮지 않는다. 아래 순서로 확인한다.

1. 실패가 발생한 정확한 입력, 권한, 경로를 특정한다.
2. 잘못된 상태를 만든 생산자 코드를 찾는다.
3. 기존 spec과 실제 코드가 다른지 확인한다.
4. 잘못된 상태가 DB, API DTO, React Query cache, Zustand store, R2 key 중 어디에서 시작됐는지 분리한다.
5. source에서 상태를 바로잡는다.

허용되는 guard는 도메인 규칙상 실제로 가능한 상태를 표현할 때뿐이다. 필수 데이터가 누락된 상태를 숨기기 위한 guard는 금지한다.

## 3. 계획

구현 전 아래 항목을 짧게 정리한다.

| 항목      | 확인 내용                                                            |
| --------- | -------------------------------------------------------------------- |
| 무엇      | 변경할 기능, 버그, 문서                                              |
| 왜        | 사용자 문제 또는 운영 리스크                                         |
| 어디      | `src/`, `webhard-api/`, `docs/`, DB, Drive/R2                        |
| 누구      | public, admin, company, worker, external API                         |
| 테스트    | unit, integration/API, component, E2E UI, AI browser QA 중 적용 범위 |
| 완료 기준 | 테스트, 문서, 브라우저 확인 기준                                     |

여러 구현 선택지가 있으면 권장안을 먼저 제시하고, 보안·운영·테스트 비용의 차이를 설명한다.

### 3.1 테스트 전략 게이트

구현 전에 테스트 층을 먼저 고른다. 기본 원칙은 테스트 피라미드다.

| 테스트 층       | YJ Laser에서 주로 검증할 것                                                               |
| --------------- | ----------------------------------------------------------------------------------------- |
| Unit            | validation, pure helper, 권한 계산, query key/cache helper                                |
| Integration/API | NestJS guard/service/controller, Prisma DB, `companyId` 소유권, Google Drive/R2 metadata  |
| Component       | 폼 validation, 권한별 버튼 노출, React Query 상태 갱신, 오류 UI                           |
| E2E UI          | 역할별 로그인, 웹하드 탐색, 업로드/다운로드, 대시보드 갱신, Worker 납품, responsive smoke |
| AI browser QA   | 탐색 QA, 재현 절차 수집, 스크린샷, 실제 클릭/입력 흐름 확인                               |

위험도가 높은 변경은 test-first로 진행한다. 새 테스트나 변경된 테스트가
예상 이유로 실패하는 것을 먼저 확인하고, 그 다음 구현한다.

test-first 우선 대상:

- admin/company/worker/API-key 인증 경계
- `companyId` ownership, external-webhard visibility filter
- webhard folder/file 권한, Drive/R2 storage provider metadata
- 파일 업로드 extension, MIME, size, path traversal, download permission
- 버그 수정과 회귀 가능성이 높은 workflow 변경

AI 브라우저 QA는 사람이 하던 탐색 QA를 줄이는 도구다. Codex Browser,
GStack QA, 유사 브라우저 플러그인으로 실제 화면을 눌러볼 수 있지만,
그 결과만으로 회귀 방지가 끝난 것은 아니다. 버그를 찾으면 재현 절차를
남기고, 가장 낮은 의미 있는 테스트 층에 회귀 테스트를 추가한다. 브라우저
상호작용 자체가 원인인 경우에만 Playwright E2E UI로 고정한다.

## 4. 구현

### Frontend

- Server Component를 기본값으로 둔다.
- 상호작용이 필요할 때만 `'use client'`를 사용한다.
- React Query key는 `queryKeys` factory를 사용한다.
- mutation 후에는 정확한 query만 invalidate 또는 update한다.
- 새 UI는 `@/components/ui/` 컴포넌트와 CSS 변수 기반 토큰을 사용한다.

### Backend

- DB 접근은 NestJS + Prisma에서만 수행한다.
- DTO는 `class-validator`와 전역 `ValidationPipe` 기준을 지킨다.
- 권한별 guard를 명확히 유지한다.
- authoritative workflow에서는 silent best-effort를 피한다. 실패가 업무 상태를 깨뜨리면 명시적으로 실패시킨다.

### Webhard and Storage

- `companyId`, folder ownership, external-webhard visibility filter를 보존한다.
- R2 object key 불변 규칙을 바꾸지 않는다.
- presigned URL, R2 key, path, folder id, company id가 split-brain을 만들지 않는지 확인한다.
- 파일 업로드 변경은 extension, MIME, size, path traversal, duplicate handling을 함께 검증한다.

## 5. 검증

변경 범위별로 필요한 검증을 선택한다.

| 변경 범위               | 기본 검증                                                                   |
| ----------------------- | --------------------------------------------------------------------------- |
| 문서만 변경             | 링크/경로/명령 정확성 자체 검토                                             |
| Frontend 타입 또는 UI   | `npx tsc --noEmit`, 관련 Jest, 필요 시 브라우저 확인                        |
| Frontend API route      | `npx tsc --noEmit`, 관련 route test                                         |
| Backend service/API     | `cd webhard-api && npx tsc --noEmit`, 관련 Jest                             |
| Prisma schema/migration | `prisma generate`, migration status, rollback/recovery plan                 |
| Webhard/upload/auth     | 관련 unit/integration test + E2E UI 또는 AI browser QA                      |
| UI E2E 흐름             | `pnpm test:e2e:ui -- --list`, 필요 시 `pnpm test:e2e:ui -- --reporter=line` |

검증을 생략하면 완료로 표현하지 않는다. 생략 사유와 남은 위험을 함께 남긴다.

브라우저 확인 기준:

- AI browser QA는 탐색 결과, 재현 절차, 스크린샷, 발견 이슈를 남긴다.
- Playwright E2E UI는 CI 또는 로컬에서 재실행 가능한 회귀 테스트로 남긴다.
- E2E가 실패하면 실패를 숨기지 않고, 기능 결함인지 테스트 fixture/환경
  문제인지 분리해 기록한다.

## 6. 문서 동기화

코드 동작이 바뀌면 문서도 같은 커밋에 맞춘다.

- `docs/specs/features/*`: 기능 계약, 완료 기준, 불변 규칙
- `docs/specs/api/*`: endpoint, request/response, auth, error
- `docs/specs/db/prisma-tables.md`: 모델, 필드, 관계
- `docs/features-list.md`: 기능 상태
- `docs/changelog/CHANGELOG.md`: 사용자·운영자가 알아야 할 변경
- `docs/progress.txt`: 세션 결과와 다음 작업

문서와 코드 중 어느 쪽이 맞는지 불명확하면 임의로 맞추지 말고 불일치 자체를 보고한다.

## 7. 커밋

1. `git diff --check`로 공백 오류를 확인한다.
2. `git diff --name-only`로 이번 작업 파일만 확인한다.
3. 관련 파일만 명시적으로 stage한다.
4. 커밋 메시지는 한국어로 작성한다.

예시:

```text
docs: Codex 작업 워크플로우 정리

- AGENTS.md에 Codex 작업 규칙 추가
- docs/workflows에 개발 워크플로우 문서 추가
```

기존 dirty 파일이 있으면 커밋 전후로 그대로 남아 있는지 확인한다.

## 8. 보안 체크리스트

작업 완료 전 아래 항목을 빠르게 확인한다.

- secret, token, password hash, presigned URL을 출력하거나 문서화하지 않았는가?
- admin/company/worker/API-key 경계가 섞이지 않았는가?
- 파일명, MIME, 크기, R2 key, folder path 검증이 약해지지 않았는가?
- `companyId` 기반 소유권과 외부웹하드 차단 규칙이 유지되는가?
- 로그에 개인정보나 인증 정보가 남지 않는가?
- migration 또는 운영 mutation은 dry-run, 백업, 복구 경로가 있는가?
