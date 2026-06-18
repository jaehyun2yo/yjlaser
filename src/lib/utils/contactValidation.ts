// Contact Form 검증 유틸리티

export const getErrorMessage = (errorType?: string): string | null => {
  switch (errorType) {
    case 'invalid':
      return '모든 필드를 올바르게 입력해주세요.';
    case 'invalid_email':
      return '올바른 이메일 주소를 입력해주세요.';
    case 'db_failed':
      return '저장 중 오류가 발생했습니다. 이메일은 전송되었을 수 있습니다.';
    case 'email_failed':
      return '이메일 전송에 실패했습니다. 문의 내용은 저장되었습니다.';
    case 'both_failed':
      return '저장 및 이메일 전송에 실패했습니다. 잠시 후 다시 시도해주세요.';
    case 'exception':
      return '오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
    case 'file_too_large':
      return '파일 크기가 10MB를 초과합니다. 더 작은 파일을 선택해주세요.';
    case 'file_read_error':
      return '파일을 읽는 중 오류가 발생했습니다. 다시 시도해주세요.';
    default:
      return null;
  }
};

import { VALIDATION } from './constants';

export const validateEmail = (email: string): boolean => {
  return VALIDATION.EMAIL_REGEX.test(email);
};

export const validateStep1 = (
  contactType: 'company' | 'individual',
  companyName: string,
  name: string,
  position: string,
  phone: string,
  email: string,
  referralSource: string,
  referralSourceOther: string
): { isValid: boolean; message?: string } => {
  if (!companyName || !phone || !email) {
    return { isValid: false, message: '필수 항목을 모두 입력해주세요.' };
  }

  if (contactType === 'company' && (!name || !position)) {
    return { isValid: false, message: '담당자명과 직책을 입력해주세요.' };
  }

  if (!validateEmail(email)) {
    return { isValid: false, message: '올바른 이메일 주소를 입력해주세요.' };
  }

  if (!referralSource) {
    return { isValid: false, message: '유입경로를 선택해주세요.' };
  }

  if (
    (referralSource === '기타' || referralSource === '거래처 소개') &&
    !referralSourceOther.trim()
  ) {
    return {
      isValid: false,
      message:
        referralSource === '기타' ? '유입경로(기타)를 입력해주세요.' : '거래처명을 입력해주세요.',
    };
  }

  return { isValid: true };
};

export const validateFileSize = (file: File | null, maxSizeMB: number): boolean => {
  if (!file) return true;
  return file.size <= maxSizeMB * 1024 * 1024;
};
