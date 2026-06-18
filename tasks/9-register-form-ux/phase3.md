# Phase 3: 클라이언트 실시간 검증

## 사전 준비

먼저 아래 문서들을 반드시 읽고 프로젝트의 전체 아키텍처와 설계 의도를 완전히 이해하라:

- `CLAUDE.md` (프로젝트 컨벤션)
- `docs/specs/features/register-form-ux.md` (이번 task의 기능 스펙)
- `/tasks/9-register-form-ux/docs-diff.md` (이번 task의 문서 변경 기록)

그리고 이전 phase의 작업물을 반드시 확인하라:

- `src/lib/validation/register-validation.ts` (Phase 1에서 생성 — `validateField` 함수 시그니처와 동작 확인)
- `src/app/register/page.tsx` (Phase 2에서 수정 — 제어 컴포넌트 구조, `formValues`, `fieldErrors`, `handleFieldChange` 확인)

이전 phase에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업 내용

### `src/app/register/page.tsx` 수정

Phase 2에서 제어 컴포넌트로 전환된 RegisterForm에 클라이언트 실시간 검증을 추가한다.

#### 1. 검증 모듈 import

```typescript
import { validateField, RegistrationFormValues } from '@/lib/validation/register-validation';
```

(`RegistrationFormValues`는 Phase 2에서 이미 import했을 수 있으므로, 중복 import하지 않도록 기존 import에 `validateField`만 추가.)

#### 2. `touchedFields` state 추가

사용자가 한 번도 터치하지 않은 필드에는 에러를 표시하지 않기 위해 touched 상태를 추적한다:

```typescript
const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());
```

#### 3. onBlur 핸들러

필드에서 포커스가 벗어날 때 해당 필드를 검증한다:

```typescript
const handleFieldBlur = (fieldName: keyof RegistrationFormValues) => {
  // touched 등록
  setTouchedFields((prev) => new Set(prev).add(fieldName));

  // 해당 필드 검증
  const error = validateField(fieldName, formValues[fieldName], formValues);
  setFieldErrors((prev) => {
    const next = { ...prev };
    if (error) {
      next[fieldName] = error;
    } else {
      delete next[fieldName];
    }
    return next;
  });
};
```

#### 4. handleFieldChange 수정

Phase 2의 `handleFieldChange`를 확장하여, 이미 touched된 필드는 onChange 시에도 실시간 검증한다:

```typescript
const handleFieldChange = (fieldName: keyof RegistrationFormValues, value: string) => {
  const newFormValues = { ...formValues, [fieldName]: value };
  setFormValues(newFormValues);

  // 이미 touched된 필드이고 에러가 있었으면 즉시 재검증
  if (touchedFields.has(fieldName) && fieldErrors[fieldName]) {
    const error = validateField(fieldName, value, newFormValues);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (error) {
        next[fieldName] = error;
      } else {
        delete next[fieldName];
      }
      return next;
    });
  }

  // 비밀번호 연동 검증: password 변경 시 passwordConfirm도 재검증
  if (
    fieldName === 'password' &&
    touchedFields.has('passwordConfirm') &&
    newFormValues.passwordConfirm
  ) {
    const confirmError = validateField(
      'passwordConfirm',
      newFormValues.passwordConfirm,
      newFormValues
    );
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (confirmError) {
        next.passwordConfirm = confirmError;
      } else {
        delete next.passwordConfirm;
      }
      return next;
    });
  }

  // quoteMethod 변경 시 accountantFax 재검증
  if (fieldName === 'quoteMethod' && touchedFields.has('accountantFax')) {
    const faxError = validateField('accountantFax', newFormValues.accountantFax, newFormValues);
    setFieldErrors((prev) => {
      const next = { ...prev };
      if (faxError) {
        next.accountantFax = faxError;
      } else {
        delete next.accountantFax;
      }
      return next;
    });
  }
};
```

#### 5. 각 input에 onBlur 추가

모든 input에 `onBlur` 핸들러를 연결한다:

```tsx
<input
  type="text"
  id="username"
  name="username"
  value={formValues.username}
  onChange={(e) => handleFieldChange('username', e.target.value)}
  onBlur={() => handleFieldBlur('username')}
  className={`${inputClassName} ${fieldErrors.username ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
  placeholder="아이디를 입력하세요"
  aria-required="true"
/>;
{
  fieldErrors.username && <p className="mt-1.5 text-sm text-red-500">{fieldErrors.username}</p>;
}
```

**모든 필드에 동일 패턴 적용**. Phase 2에서 이미 `onChange`와 에러 표시를 추가했으므로, 이 phase에서는 `onBlur`만 추가하면 된다.

대상 필드 (총 15개):

- username, password, passwordConfirm
- companyName, businessRegistrationNumber, representativeName, businessType(선택이므로 onBlur 불필요), businessCategory(선택이므로 onBlur 불필요), businessAddress
- managerName, managerPosition, managerPhone, managerEmail
- accountantEmail(선택이지만 입력 시 형식 검증), accountantFax

**선택 필드 중 형식 검증이 필요한 필드**: `accountantEmail`은 입력 시 이메일 형식 검증이 필요하므로 onBlur를 연결한다. `accountantName`, `accountantPhone`은 형식 검증이 없으므로 onBlur 불필요.

#### 6. handleSubmit 수정 — submit 시에도 클라이언트 사전 검증

서버 액션 호출 전에 클라이언트에서 먼저 전체 검증을 수행한다:

```typescript
const handleSubmit = async (formData: FormData) => {
  setFormError(null);
  setFieldErrors({});

  // 클라이언트 사전 검증
  const { validateRegistrationForm } = await import('@/lib/validation/register-validation');
  const clientValidation = validateRegistrationForm(formValues);

  if (!clientValidation.valid) {
    setFieldErrors(clientValidation.fieldErrors);
    // 모든 에러 필드를 touched로 등록
    setTouchedFields((prev) => {
      const next = new Set(prev);
      Object.keys(clientValidation.fieldErrors).forEach((key) => next.add(key));
      return next;
    });
    // 첫 번째 에러 필드로 스크롤
    const firstErrorField = Object.keys(clientValidation.fieldErrors)[0];
    const firstErrorElement = document.getElementById(firstErrorField);
    if (firstErrorElement) {
      firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      firstErrorElement.focus();
    }
    return; // 서버 액션 호출하지 않음
  }

  // 이후 서버 액션 호출 (Phase 2에서 작성한 코드 그대로)
  setIsSubmitting(true);
  // ... (기존 서버 액션 호출 코드)
};
```

`validateRegistrationForm`은 동적 import로 가져와도 되고, 상단에서 static import해도 된다. 클라이언트 번들에 포함되어야 하므로 static import가 더 자연스럽다. 위 코드는 예시일 뿐이므로, 이미 상단에서 import했다면 동적 import 대신 직접 호출하라.

## Acceptance Criteria

```bash
pnpm build && npx tsc --noEmit && pnpm test
```

## AC 검증 방법

위 AC 커맨드를 실행하라. 모두 통과하면 `/tasks/9-register-form-ux/index.json`의 phase 3 status를 `"completed"`로 변경하라.
수정 3회 이상 시도해도 실패하면 status를 `"error"`로 변경하고, 에러 내용을 index.json의 해당 phase에 `"error_message"` 필드로 기록하라.

## 주의사항

- Phase 2에서 이미 추가된 `onChange` + 에러 표시 코드를 중복 작성하지 마라. 이 phase에서는 `onBlur`, `touchedFields`, 비밀번호 연동 검증, submit 시 사전 검증만 추가한다.
- `handleFieldChange` 함수를 수정할 때, Phase 2에서 작성한 기존 로직(에러 제거)을 덮어쓰지 말고 확장하라.
- 선택 필드(`businessType`, `businessCategory`, `accountantName`, `accountantPhone`)에는 onBlur를 추가하지 마라 — 검증 규칙이 없는 필드에 onBlur를 달면 불필요한 연산.
- `@/` import를 사용하라 (상대 경로 금지).
- 기존 테스트를 깨뜨리지 마라.
