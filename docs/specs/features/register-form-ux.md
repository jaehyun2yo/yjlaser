# Register Form UX (업체등록 폼 UX 개선)

## 개요

- 목적: 업체등록 폼의 검증 실패 시 UX를 개선한다. 폼 데이터 보존, 필드별 에러 표시, 클라이언트 실시간 검증을 통해 사용자 경험을 향상시킨다.
- 도메인: 인증 > 업체등록
- 배경:
  - 현재 비제어 컴포넌트(`form action`) 사용으로, 서버 액션 실행 후 검증 실패 시 전체 폼 데이터가 소실됨
  - 에러 메시지가 폼 상단에 한 줄만 표시되어 어떤 필드가 문제인지 파악 어려움
  - NestJS 연결 실패(아이디 중복 확인 등) 시 generic "서버 오류" 메시지만 표시되어 원인 파악 불가
  - 클라이언트 검증 없이 서버 왕복 후에야 에러를 확인할 수 있음

## 변경 사항

### 1. 공유 검증 모듈 신규 생성

**파일**: `src/lib/validation/register-validation.ts`

서버 액션(`register.ts`)과 클라이언트 폼(`page.tsx`) 양쪽에서 재사용 가능한 순수 검증 함수 모듈.

- `RegistrationFormValues` 인터페이스: 폼 필드 19개의 타입 정의
- `ValidationResult` 인터페이스: `{ valid: boolean; fieldErrors: Record<string, string> }`
- `validateField(fieldName, value, formValues?)`: 개별 필드 검증, `string | null` 반환 (null = 에러 없음)
- 이메일 형식 검증 추가 (managerEmail 필수, accountantEmail 선택)
- 사업자등록번호 형식 검증 추가 (하이픈 제거 후 10자리 숫자 검증)
- 비밀번호 복잡도 검증 (8자 이상 + 대문자/소문자/숫자/특수문자 중 3가지)
- 비밀번호/비밀번호 확인 일치 검증
- 팩스번호 조건부 필수 검증 (견적서 수신 방법이 팩스일 때만 필수)
- `validateRegistrationForm(values)`: 전체 폼 검증, `ValidationResult` 반환

### 2. 서버 액션 에러 반환 구조 변경

**파일**: `src/app/actions/register.ts`

기존 반환 타입:

```typescript
{ success: false, error: 'error_code' }
```

변경 반환 타입:

```typescript
{ success: false, error?: string, fieldErrors?: Record<string, string> }
```

- 필드별 검증 실패 시 `fieldErrors`에 `{ fieldName: '에러 메시지' }` 형태로 반환
- 공유 검증 모듈의 검증 함수를 호출하여 검증 로직 중복 제거
- NestJS API 연결 실패 시 `error: 'connection_error'`로 구분하여 사용자에게 명확한 안내 제공
- 아이디 중복, 사업자번호 중복 등 서버 전용 검증은 해당 필드의 `fieldErrors`로 반환

### 3. RegisterForm 제어 컴포넌트 전환

**파일**: `src/app/register/page.tsx`

- `useState` 객체로 전체 폼 상태 관리 (제어 컴포넌트 전환)
- 검증 실패 시 폼 데이터 보존 (입력값 유지)
- 필드별 에러 메시지 inline 표시 (필드 아래에 빨간 텍스트)
- 에러 필드 빨간 보더 하이라이트
- 첫 번째 에러 필드로 자동 스크롤 및 포커스

### 4. 클라이언트 실시간 검증

**파일**: `src/app/register/page.tsx`

- `onBlur`: 해당 필드를 touched로 마킹하고 검증 실행, 에러 즉시 표시
- `onChange`: touched된 필드에 기존 에러가 있으면 재검증 (에러 수정 시 즉시 해제)
- 비밀번호/비밀번호 확인 연동 검증: password 변경 시 passwordConfirm도 재검증
- 견적서 수신 방법 연동 검증: quoteMethod 변경 시 accountantFax 재검증

## 영향 범위

- 프론트엔드만 변경
  - `src/app/register/page.tsx` — 폼 컴포넌트 전면 리팩터링
  - `src/app/actions/register.ts` — 반환 타입 확장, 검증 로직 모듈화
  - `src/lib/validation/register-validation.ts` — 신규 생성
- 백엔드(NestJS) 변경 없음
- DB 변경 없음

## 완료 기준

1. [x] 공유 검증 모듈 생성 (`src/lib/validation/register-validation.ts`)
2. [x] 서버 액션 에러 반환 구조에 `fieldErrors` 추가
3. [x] NestJS 연결 실패 시 `connection_error` 구분
4. [x] RegisterForm 제어 컴포넌트 전환 (폼 데이터 보존)
5. [x] 필드별 에러 메시지 inline 표시 + 빨간 보더
6. [x] 첫 번째 에러 필드 자동 스크롤/포커스
7. [x] onBlur 실시간 검증
8. [x] onChange 에러 재검증
9. [x] 비밀번호/비밀번호 확인 연동 검증
10. [x] `pnpm build` 통과
11. [x] `npx tsc --noEmit` 통과
