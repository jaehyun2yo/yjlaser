/**
 * @jest-environment node
 */

import {
  validateField,
  validateRegistrationForm,
  type RegistrationFormValues,
} from '@/lib/validation/register-validation';

function createValidForm(overrides?: Partial<RegistrationFormValues>): RegistrationFormValues {
  return {
    username: 'testuser',
    password: 'Test1234!',
    passwordConfirm: 'Test1234!',
    companyName: '테스트 업체',
    businessRegistrationNumber: '123-45-67890',
    representativeName: '홍길동',
    businessType: '제조업',
    businessCategory: '포장재',
    businessAddress: '서울시 강남구',
    managerName: '김철수',
    managerPosition: '과장',
    managerPhone: '010-1234-5678',
    managerEmail: 'test@example.com',
    accountantName: '',
    accountantPhone: '',
    accountantEmail: '',
    accountantFax: '',
    quoteMethod: 'email',
    ...overrides,
  };
}

describe('validateField', () => {
  // 필수 필드 누락
  it('username 빈 문자열이면 에러 반환', () => {
    expect(validateField('username', '')).toBe('아이디를 입력해주세요.');
  });

  it('username 공백만 있으면 에러 반환', () => {
    expect(validateField('username', '   ')).toBe('아이디를 입력해주세요.');
  });

  // 비밀번호
  it('password 7자이면 에러 반환', () => {
    expect(validateField('password', 'Abc123!')).toBe('비밀번호는 최소 8자 이상이어야 합니다.');
  });

  it('password 8자이면 통과', () => {
    // 대문자 + 소문자 + 숫자 + 특수문자 = 4가지
    expect(validateField('password', 'Abcd123!')).toBeNull();
  });

  it('password 소문자+숫자만 있으면 복잡도 에러', () => {
    expect(validateField('password', 'abcdefg1')).toBe(
      '비밀번호는 대문자, 소문자, 숫자, 특수문자 중 3가지 이상을 포함해야 합니다.'
    );
  });

  it('password 대문자+소문자+숫자 있으면 통과', () => {
    expect(validateField('password', 'Abcdefg1')).toBeNull();
  });

  // 비밀번호 확인
  it('passwordConfirm이 password와 다르면 에러', () => {
    expect(validateField('passwordConfirm', 'different', { password: 'Test1234!' })).toBe(
      '비밀번호가 일치하지 않습니다.'
    );
  });

  it('passwordConfirm이 password와 같으면 통과', () => {
    expect(validateField('passwordConfirm', 'Test1234!', { password: 'Test1234!' })).toBeNull();
  });

  // 이메일
  it('managerEmail에 @가 없으면 에러', () => {
    expect(validateField('managerEmail', 'invalidemail')).toBe('올바른 이메일 형식이 아닙니다.');
  });

  it('managerEmail이 유효한 형식이면 통과', () => {
    expect(validateField('managerEmail', 'test@example.com')).toBeNull();
  });

  it('accountantEmail이 빈 문자열이면 통과 (선택 필드)', () => {
    expect(validateField('accountantEmail', '')).toBeNull();
  });

  it('accountantEmail이 입력되었으나 형식 틀리면 에러', () => {
    expect(validateField('accountantEmail', 'notanemail')).toBe('올바른 이메일 형식이 아닙니다.');
  });

  // 사업자등록번호
  it('businessRegistrationNumber가 하이픈 포함 10자리면 통과', () => {
    expect(validateField('businessRegistrationNumber', '123-45-67890')).toBeNull();
  });

  it('businessRegistrationNumber가 하이픈 없이 10자리면 통과', () => {
    expect(validateField('businessRegistrationNumber', '1234567890')).toBeNull();
  });

  it('businessRegistrationNumber가 9자리면 에러', () => {
    expect(validateField('businessRegistrationNumber', '123456789')).toBe(
      '사업자등록번호 형식이 올바르지 않습니다. (예: 000-00-00000)'
    );
  });

  // 팩스 조건부 필수
  it('quoteMethod=fax이고 accountantFax 비어있으면 에러', () => {
    expect(validateField('accountantFax', '', { quoteMethod: 'fax' })).toBe(
      '팩스로 견적서를 받으시려면 팩스번호를 입력해주세요.'
    );
  });

  it('quoteMethod=email이면 accountantFax 비어도 통과', () => {
    expect(validateField('accountantFax', '', { quoteMethod: 'email' })).toBeNull();
  });
});

describe('validateRegistrationForm', () => {
  it('모든 필드 유효하면 { valid: true, fieldErrors: {} }', () => {
    const result = validateRegistrationForm(createValidForm());
    expect(result).toEqual({ valid: true, fieldErrors: {} });
  });

  it('여러 필드 동시 오류 시 모든 에러를 fieldErrors에 포함', () => {
    const result = validateRegistrationForm(
      createValidForm({
        username: '',
        password: 'short',
        managerEmail: 'invalid',
      })
    );
    expect(result.valid).toBe(false);
    expect(result.fieldErrors.username).toBeDefined();
    expect(result.fieldErrors.password).toBeDefined();
    expect(result.fieldErrors.managerEmail).toBeDefined();
  });

  it('선택 필드(accountantName 등)가 비어있어도 통과', () => {
    const result = validateRegistrationForm(
      createValidForm({
        accountantName: '',
        accountantPhone: '',
        accountantEmail: '',
        accountantFax: '',
      })
    );
    expect(result.valid).toBe(true);
    expect(result.fieldErrors).toEqual({});
  });
});
