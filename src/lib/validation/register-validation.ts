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
  quoteMethod: string;
}

export interface ValidationResult {
  valid: boolean;
  fieldErrors: Record<string, string>;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * 개별 필드 검증 (클라이언트 실시간 검증용)
 * @returns null = 에러 없음, string = 한국어 에러 메시지
 */
export function validateField(
  fieldName: keyof RegistrationFormValues,
  value: string,
  formValues?: Partial<RegistrationFormValues>
): string | null {
  const trimmed = value.trim();

  switch (fieldName) {
    case 'username':
      if (!trimmed) return '아이디를 입력해주세요.';
      return null;

    case 'password': {
      if (!trimmed) return '비밀번호를 입력해주세요.';
      if (trimmed.length < 8) return '비밀번호는 최소 8자 이상이어야 합니다.';
      const hasUppercase = /[A-Z]/.test(trimmed);
      const hasLowercase = /[a-z]/.test(trimmed);
      const hasNumber = /[0-9]/.test(trimmed);
      const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(trimmed);
      const score = [hasUppercase, hasLowercase, hasNumber, hasSpecial].filter(Boolean).length;
      if (score < 3)
        return '비밀번호는 대문자, 소문자, 숫자, 특수문자 중 3가지 이상을 포함해야 합니다.';
      return null;
    }

    case 'passwordConfirm':
      if (!trimmed) return '비밀번호 확인을 입력해주세요.';
      if (formValues?.password !== undefined && trimmed !== formValues.password.trim()) {
        return '비밀번호가 일치하지 않습니다.';
      }
      return null;

    case 'companyName':
      if (!trimmed) return '업체명을 입력해주세요.';
      return null;

    case 'businessRegistrationNumber': {
      if (!trimmed) return '사업자등록번호를 입력해주세요.';
      const digitsOnly = trimmed.replace(/-/g, '');
      if (!/^\d{10}$/.test(digitsOnly)) {
        return '사업자등록번호 형식이 올바르지 않습니다. (예: 000-00-00000)';
      }
      return null;
    }

    case 'representativeName':
      if (!trimmed) return '대표자명을 입력해주세요.';
      return null;

    case 'businessAddress':
      if (!trimmed) return '사업자주소를 입력해주세요.';
      return null;

    case 'managerName':
      if (!trimmed) return '담당자 성함을 입력해주세요.';
      return null;

    case 'managerPosition':
      if (!trimmed) return '담당자 직함을 입력해주세요.';
      return null;

    case 'managerPhone':
      if (!trimmed) return '담당자 연락처를 입력해주세요.';
      return null;

    case 'managerEmail':
      if (!trimmed) return '담당자 이메일을 입력해주세요.';
      if (!EMAIL_REGEX.test(trimmed)) return '올바른 이메일 형식이 아닙니다.';
      return null;

    case 'accountantEmail':
      if (!trimmed) return null;
      if (!EMAIL_REGEX.test(trimmed)) return '올바른 이메일 형식이 아닙니다.';
      return null;

    case 'accountantFax':
      if (formValues?.quoteMethod === 'fax' && !trimmed) {
        return '팩스로 견적서를 받으시려면 팩스번호를 입력해주세요.';
      }
      return null;

    default:
      return null;
  }
}

/**
 * 전체 폼 검증 (서버 액션 + 클라이언트 submit 시 사용)
 */
export function validateRegistrationForm(values: RegistrationFormValues): ValidationResult {
  const fieldErrors: Record<string, string> = {};

  for (const key of Object.keys(values) as (keyof RegistrationFormValues)[]) {
    const error = validateField(key, values[key], values);
    if (error) {
      fieldErrors[key] = error;
    }
  }

  return {
    valid: Object.keys(fieldErrors).length === 0,
    fieldErrors,
  };
}
