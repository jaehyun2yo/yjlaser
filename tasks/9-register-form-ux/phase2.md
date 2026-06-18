# Phase 2: RegisterForm 제어 컴포넌트 전환 + 필드별 에러 표시

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션 — Styling, React Query, Conventions 섹션)
- `docs/specs/features/register-form-ux.md` (이번 task의 기능 스펙)
- `/tasks/9-register-form-ux/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `src/lib/validation/register-validation.ts` (Phase 1에서 생성된 공유 검증 모듈 — `RegistrationFormValues`, `ValidationResult`, `validateRegistrationForm` 타입/함수 확인)
- `src/app/actions/register.ts` (Phase 1에서 수정된 서버 액션 — 새로운 `fieldErrors` 반환 구조 확인)
- `src/app/register/page.tsx` (현재 RegisterForm 컴포넌트 전체를 꼼꼼히 읽어라)

이전 phase에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업 내용

### `src/app/register/page.tsx` 수정

RegisterForm 컴포넌트를 비제어 → 제어 컴포넌트로 전환한다.

#### 1. 폼 상태 추가

```typescript
import { RegistrationFormValues } from '@/lib/validation/register-validation';

// 초기값
const initialFormValues: RegistrationFormValues = {
  username: '',
  password: '',
  passwordConfirm: '',
  companyName: '',
  businessRegistrationNumber: '',
  representativeName: '',
  businessType: '',
  businessCategory: '',
  businessAddress: '',
  managerName: '',
  managerPosition: '',
  managerPhone: '',
  managerEmail: '',
  accountantName: '',
  accountantPhone: '',
  accountantEmail: '',
  accountantFax: '',
  quoteMethod: 'email',
};

// 컴포넌트 내부
const [formValues, setFormValues] = useState<RegistrationFormValues>(initialFormValues);
const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
```

#### 2. 필드 업데이트 핸들러

```typescript
const handleFieldChange = (fieldName: keyof RegistrationFormValues, value: string) => {
  setFormValues((prev) => ({ ...prev, [fieldName]: value }));
  // 기존 에러가 있는 필드는 입력 시 에러 제거
  if (fieldErrors[fieldName]) {
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[fieldName];
      return next;
    });
  }
};
```

#### 3. 각 input을 제어 컴포넌트로 전환

현재:

```tsx
<input type="text" id="username" name="username" required ... className={inputClassName} placeholder="아이디를 입력하세요" />
```

변경:

```tsx
<input
  type="text"
  id="username"
  name="username"
  value={formValues.username}
  onChange={(e) => handleFieldChange('username', e.target.value)}
  className={`${inputClassName} ${fieldErrors.username ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
  placeholder="아이디를 입력하세요"
/>;
{
  fieldErrors.username && <p className="mt-1.5 text-sm text-red-500">{fieldErrors.username}</p>;
}
```

**모든 input에 이 패턴을 적용하라.** 대상 필드 목록:

- username, password, passwordConfirm
- companyName, businessRegistrationNumber, representativeName, businessType, businessCategory, businessAddress
- managerName, managerPosition, managerPhone, managerEmail
- accountantName, accountantPhone, accountantEmail, accountantFax

**기존 `required` attribute는 제거한다** — 클라이언트 검증 모듈이 대체하므로 HTML5 기본 검증은 불필요. `aria-required="true"`는 접근성을 위해 유지.

#### 4. quoteMethod 연동

기존 `quoteMethod` state와 `formValues.quoteMethod`를 통합한다. 기존 `quoteMethod` state를 제거하고 `formValues.quoteMethod`를 사용:

```tsx
// 기존: const [quoteMethod, setQuoteMethod] = useState<string>('email');
// 제거하고 formValues.quoteMethod 사용

// RadioButton onChange:
onChange={(e) => handleFieldChange('quoteMethod', e.target.value)}
// checked:
checked={formValues.quoteMethod === 'email'}
```

#### 5. handleSubmit 수정

`<form action={handleSubmit}>` 패턴을 유지하되, 내부에서 formValues를 FormData로 변환하여 서버 액션에 전달한다.

```typescript
const handleSubmit = async (formData: FormData) => {
  setFormError(null);
  setFieldErrors({});
  setFaxHighlight(false);

  // formValues를 FormData에 덮어쓰기 (제어 컴포넌트 값 사용)
  // 파일은 기존 formData에서 가져옴
  const submitData = new FormData();
  Object.entries(formValues).forEach(([key, value]) => {
    submitData.set(key, value);
  });

  // 파일은 원본 formData에서 복사
  const file = formData.get('business_registration_file');
  if (file) {
    submitData.set('business_registration_file', file);
  }

  setIsSubmitting(true);
  try {
    const result = await registerCompany(submitData);
    if (result.success) {
      setShowSuccessModal(true);
    } else if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
      // 필드별 에러 표시
      setFieldErrors(result.fieldErrors);

      // 첫 번째 에러 필드로 스크롤 + 포커스
      const firstErrorField = Object.keys(result.fieldErrors)[0];
      const firstErrorElement = document.getElementById(firstErrorField);
      if (firstErrorElement) {
        firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstErrorElement.focus();
      }
    } else {
      // 글로벌 에러 (connection_error, server_error 등)
      setFormError(result.error || 'server_error');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  } catch (err) {
    log.error('Registration error:', err);
    setFormError('server_error');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } finally {
    setIsSubmitting(false);
  }
};
```

#### 6. 에러 메시지 매핑 업데이트

`getErrorMessage` 함수에 `connection_error` 케이스를 추가:

```typescript
case 'connection_error':
  return '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.';
```

#### 7. 기존 faxHighlight 로직 정리

기존의 `faxHighlight` state와 `faxInputRef`는 유지한다. 다만 `fieldErrors.accountant_fax`가 있을 때도 같은 하이라이트 스타일이 적용되도록 통합:

```tsx
className={`${inputClassName} ${(faxHighlight || fieldErrors.accountant_fax) ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
```

단, `fieldErrors` 키는 `RegistrationFormValues`의 키와 동일한 camelCase를 사용한다 (`accountantFax`). HTML `id`와 `name` attribute도 camelCase와 매핑되어야 한다. 기존 `accountant_fax` 같은 snake_case name은 서버 액션에서 FormData 파싱에 사용되므로, **`id` attribute는 camelCase로 변경**하고 `name`은 기존 snake_case를 유지한다. `fieldErrors`의 키는 camelCase (`accountantFax`), `document.getElementById`에서 찾을 수 있도록 `id`도 camelCase로 맞춘다.

**id 변경 대상**: snake_case `id`를 가진 모든 input의 `id`를 camelCase로 변경:

- `company_name` → `companyName`
- `representative_name` → `representativeName`
- `business_registration_number` → `businessRegistrationNumber`
- `business_type` → `businessType`
- `business_category` → `businessCategory`
- `business_address` → `businessAddress`
- `manager_name` → `managerName`
- `manager_position` → `managerPosition`
- `manager_phone` → `managerPhone`
- `manager_email` → `managerEmail`
- `accountant_name` → `accountantName`
- `accountant_phone` → `accountantPhone`
- `accountant_email` → `accountantEmail`
- `accountant_fax` → `accountantFax`
- `password_confirm` → `passwordConfirm`

`name` attribute는 **기존 snake_case를 유지**한다 (서버 액션의 `formData.get('company_name')` 등과 호환).

`<label htmlFor>`도 새 `id`에 맞게 변경한다.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/9-register-form-ux/index.json`의 phase 2 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- `BG_COLOR`, `TEXT_COLOR`, `BORDER_COLOR` 등 스타일 상수를 반드시 사용하라. `dark:` 클래스를 직접 쓰지 마라 (CLAUDE.md Hard Rules).
- 에러 표시용 빨간 보더/ring (`border-red-500 ring-2 ring-red-500/30`)는 기존 `faxHighlight`에서 이미 사용 중인 패턴이므로 동일하게 적용.
- `FileUpload` 컴포넌트는 이미 자체 state(`selectedFiles`)로 관리되므로 제어 컴포넌트 전환 대상이 아니다.
- `@/` import를 사용하라 (상대 경로 금지).
- 기존 테스트를 깨뜨리지 마라.
- `createTestAccount` 관련 코드는 수정하지 마라.
