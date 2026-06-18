# Phase 0: 문서 업데이트

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션, 아키텍처)
- `docs/changelog/CHANGELOG.md` (기존 변경 이력 형식 파악)
- `docs/specs/features/` 디렉토리의 기존 spec 파일 하나를 읽어 형식 파악 (예: `docs/specs/features/contact-split.md`)

그리고 현재 업체등록 관련 코드를 읽어라:

- `src/app/register/page.tsx` (프론트엔드 폼)
- `src/app/actions/register.ts` (서버 액션)

## 작업 내용

### 1. `docs/specs/features/register-form-ux.md` 신규 작성

업체등록 폼 UX 개선 기능 스펙을 작성한다. 아래 내용을 포함:

**개요**: 업체등록 폼의 검증 실패 시 UX 개선. 폼 데이터 보존, 필드별 에러 표시, 클라이언트 실시간 검증.

**배경/문제점**:

- 현재 비제어 컴포넌트 사용으로 검증 실패 시 전체 폼 데이터가 소실됨
- 에러 메시지가 상단에 한 줄만 표시되어 어떤 필드가 문제인지 파악 어려움
- NestJS 연결 실패 시 generic "서버 오류" 메시지만 표시

**변경 사항**:

1. 공유 검증 모듈 (`src/lib/validation/register-validation.ts`) 신규 생성
   - 서버/클라이언트 양쪽에서 재사용 가능한 순수 검증 함수
   - 필드별 한국어 에러 메시지 직접 반환
   - 이메일 형식 검증, 사업자등록번호 형식 검증(`000-00-00000`) 추가
2. 서버 액션 에러 반환 구조 변경
   - 기존: `{ success: false, error: 'error_code' }`
   - 변경: `{ success: false, error?: string, fieldErrors?: Record<string, string> }`
   - NestJS 연결 실패 시 `connection_error` 구분
3. RegisterForm 제어 컴포넌트 전환
   - `useState` 객체로 전체 폼 상태 관리
   - 검증 실패 시 폼 데이터 보존
   - 필드별 에러 메시지 inline 표시 + 빨간 보더 하이라이트
   - 첫 번째 에러 필드로 자동 스크롤/포커스
4. 클라이언트 실시간 검증
   - `onBlur`: 필드 검증, 에러 즉시 표시
   - `onChange`: 기존 에러 해제
   - 비밀번호/비밀번호 확인 연동 검증

**영향 범위**: 프론트엔드만 (`src/app/register/page.tsx`, `src/app/actions/register.ts`, `src/lib/validation/`). 백엔드 변경 없음.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/9-register-form-ux/index.json`의 phase 0 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- 이 phase에서는 코드를 수정하지 마라. 문서만 작성한다.
- 기존 `docs/specs/features/` 파일들의 형식을 따라라.
- CHANGELOG에는 아직 기록하지 마라 (마지막 phase에서 수행).
