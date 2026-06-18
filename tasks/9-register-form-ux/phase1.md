# Phase 1: 공유 검증 모듈 + Server Action 리팩터링

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션 — 특히 Hard Rules 섹션)
- `docs/specs/features/register-form-ux.md` (이번 task의 기능 스펙)
- `/tasks/9-register-form-ux/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 현재 코드를 반드시 읽어라:

- `src/app/actions/register.ts` (현재 서버 액션 — 검증 로직과 에러 반환 구조 파악)
- `src/lib/api/nestjs-server-client.ts` (nestjsFetch 함수, serverCheckDuplicateUsername, serverCheckDuplicateBusinessNumber 함수 확인)

## 작업 내용

### 1. 공유 검증 모듈 신규 생성: `src/lib/validation/register-validation.ts`

서버 액션과 클라이언트 폼 양쪽에서 재사용할 순수 검증 함수를 작성한다. 외부 의존성 없는 순수 함수여야 한다 (`'use server'` 없음, 브라우저 API 사용 안 함).

```typescript
// 타입 정의
export interface RegistrationFormValues {
  username: string;
  password: string;
  passwordConfirm: string;
  companyName: string;
  businessRegistrationNumber: string;
  representativeName: string;
  businessType: string;
  businessCategory: string;
  businessAddress: string;
  managerName: string;
  managerPosition: string;
  managerPhone: string;
  managerEmail: string;
  accountantName: string;
  accountantPhone: string;
  accountantEmail: string;
  accountantFax: string;
  quoteMethod: string; // 'email' | 'fax' | 'sms'
}

export interface ValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string>;
}

// 개별 필드 검증 (클라이언트 실시간 검증용)
export function validateField(
  fieldName: keyof RegistrationFormValues,
  value: string,
  formValues?: Partial<RegistrationFormValues>
): string | null; // null = 에러 없음, string = 한국어 에러 메시지

// 전체 폼 검증 (서버 액션 + 클라이언트 submit 시 사용)
export function validateRegistrationForm(values: RegistrationFormValues): ValidationResult;
```

**검증 규칙** (한국어 에러 메시지를 직접 반환):

| 필드                       | 규칙                                                                   | 에러 메시지                                                                  |
| -------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| username                   | 비어있으면 안 됨                                                       | `아이디를 입력해주세요.`                                                     |
| password                   | 비어있으면 안 됨                                                       | `비밀번호를 입력해주세요.`                                                   |
| password                   | 8자 미만                                                               | `비밀번호는 최소 8자 이상이어야 합니다.`                                     |
| password                   | 대문자/소문자/숫자/특수문자 중 3가지 미만                              | `비밀번호는 대문자, 소문자, 숫자, 특수문자 중 3가지 이상을 포함해야 합니다.` |
| passwordConfirm            | 비어있으면 안 됨                                                       | `비밀번호 확인을 입력해주세요.`                                              |
| passwordConfirm            | password와 불일치                                                      | `비밀번호가 일치하지 않습니다.`                                              |
| companyName                | 비어있으면 안 됨                                                       | `업체명을 입력해주세요.`                                                     |
| businessRegistrationNumber | 비어있으면 안 됨                                                       | `사업자등록번호를 입력해주세요.`                                             |
| businessRegistrationNumber | `000-00-00000` 패턴 불일치 (숫자 10자리, 하이픈 포함/미포함 모두 허용) | `사업자등록번호 형식이 올바르지 않습니다. (예: 000-00-00000)`                |
| representativeName         | 비어있으면 안 됨                                                       | `대표자명을 입력해주세요.`                                                   |
| businessAddress            | 비어있으면 안 됨                                                       | `사업자주소를 입력해주세요.`                                                 |
| managerName                | 비어있으면 안 됨                                                       | `담당자 성함을 입력해주세요.`                                                |
| managerPosition            | 비어있으면 안 됨                                                       | `담당자 직함을 입력해주세요.`                                                |
| managerPhone               | 비어있으면 안 됨                                                       | `담당자 연락처를 입력해주세요.`                                              |
| managerEmail               | 비어있으면 안 됨                                                       | `담당자 이메일을 입력해주세요.`                                              |
| managerEmail               | 이메일 형식 불일치                                                     | `올바른 이메일 형식이 아닙니다.`                                             |
| accountantEmail            | 입력된 경우 이메일 형식 불일치                                         | `올바른 이메일 형식이 아닙니다.`                                             |
| accountantFax              | quoteMethod가 'fax'인데 비어있음                                       | `팩스로 견적서를 받으시려면 팩스번호를 입력해주세요.`                        |

**사업자등록번호 검증 규칙**: 하이픈을 제거한 후 10자리 숫자인지 확인. 즉 `1234567890`, `123-45-67890` 모두 유효. 하이픈 위치가 정확한지까지는 검증하지 않음 (사용자 편의).

**이메일 검증 규칙**: 간단한 regex로 `@` 포함 + 도메인 부분에 `.` 포함 정도만 확인. 과도하게 엄격한 regex는 사용하지 마라.

**`validateField` 동작**: `passwordConfirm` 검증 시 `formValues.password`가 필요하므로, `formValues` 파라미터를 선택적으로 받아 비밀번호 일치 여부를 확인한다. `accountantFax` 검증 시에도 `formValues.quoteMethod`가 필요.

### 2. Server Action 리팩터링: `src/app/actions/register.ts`

**반환 타입 변경**:

```typescript
interface RegisterResult {
  success: boolean;
  error?: string; // 글로벌 에러 (connection_error, server_error, database_error 등)
  fieldErrors?: Record<string, string>; // 필드별 에러 메시지
}
```

**변경 사항**:

1. `registerCompany` 함수 상단에서 FormData → `RegistrationFormValues` 객체로 변환
2. 기존 수동 검증 코드(82~119행)를 제거하고, `validateRegistrationForm(values)`로 교체
3. 검증 실패 시 `{ success: false, fieldErrors }` 반환 (`error` 필드 없이)
4. NestJS API 호출(아이디 중복, 사업자번호 중복)은 검증 통과 후에만 수행
5. NestJS API 호출을 try-catch로 감싸서 연결 실패 시 `connection_error` 반환:

```typescript
// 아이디 중복 확인
try {
  const usernameCheck = await serverCheckDuplicateUsername(username);
  if (usernameCheck.exists) {
    return { success: false, fieldErrors: { username: '이미 사용 중인 아이디입니다.' } };
  }
} catch {
  return { success: false, error: 'connection_error' };
}
```

6. 사업자등록번호 중복 확인도 동일 패턴 적용
7. `createTestAccount` 함수는 변경하지 않음 (자동 생성이므로 검증 불필요)

### 3. 단위 테스트: `src/__tests__/validation/register-validation.test.ts`

공유 검증 모듈의 순수 함수를 테스트한다.

**테스트 케이스**:

```typescript
describe('validateField', () => {
  // 필수 필드 누락
  it('username 빈 문자열이면 에러 반환');
  it('username 공백만 있으면 에러 반환');

  // 비밀번호
  it('password 7자이면 에러 반환');
  it('password 8자이면 통과');
  it('password 소문자+숫자만 있으면 복잡도 에러');
  it('password 대문자+소문자+숫자 있으면 통과');

  // 비밀번호 확인
  it('passwordConfirm이 password와 다르면 에러');
  it('passwordConfirm이 password와 같으면 통과');

  // 이메일
  it('managerEmail에 @가 없으면 에러');
  it('managerEmail이 유효한 형식이면 통과');
  it('accountantEmail이 빈 문자열이면 통과 (선택 필드)');
  it('accountantEmail이 입력되었으나 형식 틀리면 에러');

  // 사업자등록번호
  it('businessRegistrationNumber가 하이픈 포함 10자리면 통과');
  it('businessRegistrationNumber가 하이픈 없이 10자리면 통과');
  it('businessRegistrationNumber가 9자리면 에러');

  // 팩스 조건부 필수
  it('quoteMethod=fax이고 accountantFax 비어있으면 에러');
  it('quoteMethod=email이면 accountantFax 비어도 통과');
});

describe('validateRegistrationForm', () => {
  it('모든 필드 유효하면 { valid: true, fieldErrors: {} }');
  it('여러 필드 동시 오류 시 모든 에러를 fieldErrors에 포함');
  it('선택 필드(accountantName 등)가 비어있어도 통과');
});
```

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/9-register-form-ux/index.json`의 phase 1 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `register-validation.ts`는 순수 함수만 포함해야 한다. `'use server'`, `'use client'`, DOM API, Node.js API를 사용하지 마라.
- 서버 액션의 기존 `error` 필드 반환을 완전히 제거하지 마라. `connection_error`, `server_error`, `database_error`, `file_upload_failed` 같은 글로벌 에러는 여전히 `error` 필드로 반환한다. `fieldErrors`는 필드 검증 에러에만 사용.
- `createTestAccount` 함수는 수정하지 마라.
- 기존 테스트를 깨뜨리지 마라.
- `@/` import를 사용하라 (상대 경로 금지).
