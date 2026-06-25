'use client';

import { useState, useRef, Suspense } from 'react';
import { registerCompany, createTestAccount } from '@/app/actions/register';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import SuccessModal from '@/components/SuccessModal';
import { FileUpload } from '@/components/FileUpload';
import { RadioButton } from '@/components/RadioButton';
import { FaSpinner, FaArrowLeft } from 'react-icons/fa';
import { logger } from '@/lib/utils/logger';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import {
  type RegistrationFormValues,
  validateField,
  validateRegistrationForm,
} from '@/lib/validation/register-validation';

const log = logger.createLogger('RegisterPage');

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

// 서버 액션은 snake_case FormData 키를 기대 — camelCase→snake_case 매핑
const formDataKeyMap: Record<string, string> = {
  passwordConfirm: 'password_confirm',
  companyName: 'company_name',
  businessRegistrationNumber: 'business_registration_number',
  representativeName: 'representative_name',
  businessType: 'business_type',
  businessCategory: 'business_category',
  businessAddress: 'business_address',
  managerName: 'manager_name',
  managerPosition: 'manager_position',
  managerPhone: 'manager_phone',
  managerEmail: 'manager_email',
  accountantName: 'accountant_name',
  accountantPhone: 'accountant_phone',
  accountantEmail: 'accountant_email',
  accountantFax: 'accountant_fax',
  quoteMethod: 'quote_method',
};

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const error = searchParams.get('error');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isCreatingTest, setIsCreatingTest] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [formValues, setFormValues] = useState<RegistrationFormValues>(initialFormValues);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(error || null);
  const [faxHighlight, setFaxHighlight] = useState(false);
  const faxInputRef = useRef<HTMLInputElement>(null);
  const [touchedFields, setTouchedFields] = useState<Set<string>>(new Set());

  const handleFieldChange = (fieldName: keyof RegistrationFormValues, value: string) => {
    setFormValues((prevValues) => {
      const newFormValues = { ...prevValues, [fieldName]: value };

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

      return newFormValues;
    });
  };

  const handleFieldBlur = (fieldName: keyof RegistrationFormValues) => {
    setTouchedFields((prev) => new Set(prev).add(fieldName));

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

  const getErrorMessage = (errorType: string | null) => {
    switch (errorType) {
      case 'missing_fields':
        return '필수 항목을 모두 입력해주세요.';
      case 'password_mismatch':
        return '비밀번호와 비밀번호 확인이 일치하지 않습니다.';
      case 'password_too_short':
        return '비밀번호는 최소 8자 이상이어야 합니다.';
      case 'password_complexity':
        return '비밀번호는 대문자, 소문자, 숫자, 특수문자 중 3가지 이상을 포함해야 합니다.';
      case 'username_exists':
        return '이미 사용 중인 아이디입니다.';
      case 'business_number_exists':
        return '이미 등록된 사업자등록번호입니다.';
      case 'missing_company_info':
        return '업체 정보를 모두 입력해주세요.';
      case 'missing_manager_info':
        return '실무담당자 정보를 모두 입력해주세요.';
      case 'missing_fax_number':
        return '팩스로 견적서를 받으시려면 팩스번호를 입력해주세요.';
      case 'file_upload_failed':
        return '파일 업로드에 실패했습니다. 다시 시도해주세요.';
      case 'database_error':
        return '데이터베이스 오류가 발생했습니다. 다시 시도해주세요.';
      case 'connection_error':
        return '서버에 연결할 수 없습니다. 잠시 후 다시 시도해주세요.';
      case 'server_error':
        return '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      default:
        return null;
    }
  };

  const handleSubmit = async (formData: FormData) => {
    setFormError(null);
    setFieldErrors({});
    setFaxHighlight(false);

    const currentFormValues = { ...formValues };
    (Object.keys(currentFormValues) as (keyof RegistrationFormValues)[]).forEach((key) => {
      const formKey = formDataKeyMap[key] || key;
      const formValue = formData.get(formKey);
      if (typeof formValue === 'string') {
        currentFormValues[key] = formValue;
      }
    });
    setFormValues(currentFormValues);

    // 클라이언트 사전 검증
    const clientValidation = validateRegistrationForm(currentFormValues);
    if (!clientValidation.valid) {
      setFieldErrors(clientValidation.fieldErrors);
      setTouchedFields((prev) => {
        const next = new Set(prev);
        Object.keys(clientValidation.fieldErrors).forEach((key) => next.add(key));
        return next;
      });
      const firstErrorField = Object.keys(clientValidation.fieldErrors)[0];
      const firstErrorElement = document.getElementById(firstErrorField);
      if (firstErrorElement) {
        firstErrorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstErrorElement.focus();
      }
      return;
    }

    // formValues를 FormData에 덮어쓰기 (제어 컴포넌트 값 사용)
    const submitData = new FormData();
    Object.entries(currentFormValues).forEach(([key, value]) => {
      submitData.set(formDataKeyMap[key] || key, value);
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

  const handleCreateTestAccount = async () => {
    setIsCreatingTest(true);
    try {
      const result = await createTestAccount();
      if (result && result.success) {
        setShowSuccessModal(true);
      } else {
        alert('테스트 계정 생성에 실패했습니다. 다시 시도해주세요.');
      }
    } catch (error) {
      const errorDigest = (error as { digest?: string })?.digest;
      if (
        error instanceof Error &&
        (error.message === 'NEXT_REDIRECT' || errorDigest?.startsWith('NEXT_REDIRECT'))
      ) {
        return;
      }
      log.error('Test account creation error:', error);
      alert('테스트 계정 생성 중 오류가 발생했습니다. 다시 시도해주세요.');
    } finally {
      setIsCreatingTest(false);
    }
  };

  // 공통 input 스타일
  const inputClassName = `w-full px-4 py-3 ${BG_COLOR.whiteAlpha} border ${BORDER_COLOR.whiteAlpha} rounded-xl ${TEXT_COLOR.strong} placeholder:text-muted-foreground/50 text-base focus:outline-none focus:border-brand/50 focus:ring-2 focus:ring-brand/20 transition-all duration-200 disabled:opacity-50`;

  return (
    <div
      className={`min-h-screen w-full ${BG_COLOR.loginPage} flex transition-colors duration-200`}
    >
      {/* 왼쪽: 브랜딩 영역 - 화면의 40% */}
      <div className="hidden lg:flex w-2/5 h-screen sticky top-0">
        <div className="relative w-full h-full flex flex-col items-center">
          {/* 배경 그라디언트 */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#ED6C00]/10 via-transparent to-transparent pointer-events-none" />
          <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-[#ED6C00]/5 rounded-full blur-[120px] pointer-events-none" />

          {/* 중앙 콘텐츠 */}
          <div className="relative z-10 w-full max-w-md px-12 xl:px-16 flex-1 flex flex-col justify-center">
            <p className="text-[#ED6C00] text-sm font-medium tracking-widest uppercase mb-6 animate-fadeInUp animate-delay-100">
              Company Registration
            </p>
            <h1
              className={`text-4xl xl:text-5xl font-extrabold ${TEXT_COLOR.strong} leading-tight mb-6 animate-fadeInUp animate-delay-200`}
            >
              업체등록
              <br />
              <span className="text-[#ED6C00]">신청</span>
            </h1>
            <p
              className={`${TEXT_COLOR.strong}/80 text-base xl:text-lg leading-relaxed animate-fadeInUp animate-delay-300`}
            >
              간편한 업체등록으로
              <br />
              다양한 서비스를 이용하세요.
            </p>

            {/* 홈으로 돌아가기 */}
            <div className="mt-12 animate-fadeIn animate-delay-500">
              <Link
                href="/"
                className={`group inline-flex items-center gap-1.5 ${TEXT_COLOR.strong}/80 hover:text-[#ED6C00] transition-colors text-base`}
              >
                <FaArrowLeft className="text-xs relative -top-px group-hover:-translate-x-1 transition-transform duration-200" />
                <span className="leading-none">홈으로 돌아가기</span>
              </Link>
            </div>
          </div>

          {/* 세로 구분선 */}
          <div className="absolute right-0 top-1/2 -translate-y-1/2 h-[60%] w-px bg-gradient-to-b from-transparent via-border to-transparent" />
        </div>
      </div>

      {/* 오른쪽: 폼 영역 - 화면의 60% */}
      <div className="w-full lg:w-3/5 px-6 py-12 sm:px-12 lg:px-16 xl:px-20">
        <div className="w-full max-w-2xl mx-auto">
          {/* 모바일 홈 링크 */}
          <div className="lg:hidden mb-8">
            <Link
              href="/"
              className={`group inline-flex items-center gap-1.5 ${TEXT_COLOR.dimAlpha} ${TEXT_COLOR.hoverSoftWhite} transition-colors`}
            >
              <FaArrowLeft className="text-xs relative -top-px group-hover:-translate-x-1 transition-transform duration-200" />
              <span className="leading-none">홈으로</span>
            </Link>
          </div>

          {/* 모바일 타이틀 */}
          <div className="lg:hidden mb-10">
            <p className="text-[#ED6C00] text-sm font-medium tracking-widest uppercase mb-3">
              Company Registration
            </p>
            <h1 className={`text-3xl font-bold ${TEXT_COLOR.strong}`}>
              업체등록 <span className="text-[#ED6C00]">신청</span>
            </h1>
          </div>

          {/* 에러 메시지 */}
          {formError && getErrorMessage(formError) && (
            <div
              className={`mb-6 p-4 ${BG_COLOR.errorAlpha} border ${BORDER_COLOR.errorAlpha} rounded-xl`}
            >
              <p className={TEXT_COLOR.error}>{getErrorMessage(formError)}</p>
            </div>
          )}

          <form action={handleSubmit} className="space-y-8">
            {/* 로그인 정보 섹션 */}
            <div className="p-6 rounded-2xl">
              <h2 className={`text-xl font-bold ${TEXT_COLOR.strong} mb-6`}>로그인 정보</h2>
              <div className="space-y-5">
                <div>
                  <label
                    htmlFor="username"
                    className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                  >
                    아이디 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={formValues.username}
                    onChange={(e) => handleFieldChange('username', e.target.value)}
                    onBlur={() => handleFieldBlur('username')}
                    aria-required="true"
                    className={`${inputClassName} ${fieldErrors.username ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                    placeholder="아이디를 입력하세요"
                  />
                  {fieldErrors.username && (
                    <p className="mt-1.5 text-sm text-red-500">{fieldErrors.username}</p>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="password"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      비밀번호 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      id="password"
                      name="password"
                      value={formValues.password}
                      onChange={(e) => handleFieldChange('password', e.target.value)}
                      onBlur={() => handleFieldBlur('password')}
                      aria-required="true"
                      className={`${inputClassName} ${fieldErrors.password ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                      placeholder="최소 8자"
                    />
                    {fieldErrors.password && (
                      <p className="mt-1.5 text-sm text-red-500">{fieldErrors.password}</p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="passwordConfirm"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      비밀번호 확인 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="password"
                      id="passwordConfirm"
                      name="password_confirm"
                      value={formValues.passwordConfirm}
                      onChange={(e) => handleFieldChange('passwordConfirm', e.target.value)}
                      onBlur={() => handleFieldBlur('passwordConfirm')}
                      aria-required="true"
                      className={`${inputClassName} ${fieldErrors.passwordConfirm ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                      placeholder="비밀번호 재입력"
                    />
                    {fieldErrors.passwordConfirm && (
                      <p className="mt-1.5 text-sm text-red-500">{fieldErrors.passwordConfirm}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 업체 정보 섹션 */}
            <div className="p-6 rounded-2xl">
              <h2 className={`text-xl font-bold ${TEXT_COLOR.strong} mb-6`}>업체 정보</h2>
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="companyName"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      업체명 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="companyName"
                      name="company_name"
                      value={formValues.companyName}
                      onChange={(e) => handleFieldChange('companyName', e.target.value)}
                      onBlur={() => handleFieldBlur('companyName')}
                      aria-required="true"
                      className={`${inputClassName} ${fieldErrors.companyName ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                      placeholder="업체명"
                    />
                    {fieldErrors.companyName && (
                      <p className="mt-1.5 text-sm text-red-500">{fieldErrors.companyName}</p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="representativeName"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      대표자명 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="representativeName"
                      name="representative_name"
                      value={formValues.representativeName}
                      onChange={(e) => handleFieldChange('representativeName', e.target.value)}
                      onBlur={() => handleFieldBlur('representativeName')}
                      aria-required="true"
                      className={`${inputClassName} ${fieldErrors.representativeName ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                      placeholder="대표자명"
                    />
                    {fieldErrors.representativeName && (
                      <p className="mt-1.5 text-sm text-red-500">
                        {fieldErrors.representativeName}
                      </p>
                    )}
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="businessRegistrationNumber"
                    className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                  >
                    사업자등록번호 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="businessRegistrationNumber"
                    name="business_registration_number"
                    value={formValues.businessRegistrationNumber}
                    onChange={(e) =>
                      handleFieldChange('businessRegistrationNumber', e.target.value)
                    }
                    onBlur={() => handleFieldBlur('businessRegistrationNumber')}
                    aria-required="true"
                    className={`${inputClassName} ${fieldErrors.businessRegistrationNumber ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                    placeholder="000-00-00000"
                  />
                  {fieldErrors.businessRegistrationNumber && (
                    <p className="mt-1.5 text-sm text-red-500">
                      {fieldErrors.businessRegistrationNumber}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="businessType"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      업태 <span className="text-gray-400 text-sm">(선택)</span>
                    </label>
                    <input
                      type="text"
                      id="businessType"
                      name="business_type"
                      value={formValues.businessType}
                      onChange={(e) => handleFieldChange('businessType', e.target.value)}
                      className={`${inputClassName} ${fieldErrors.businessType ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                      placeholder="업태"
                    />
                    {fieldErrors.businessType && (
                      <p className="mt-1.5 text-sm text-red-500">{fieldErrors.businessType}</p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="businessCategory"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      업종 <span className="text-gray-400 text-sm">(선택)</span>
                    </label>
                    <input
                      type="text"
                      id="businessCategory"
                      name="business_category"
                      value={formValues.businessCategory}
                      onChange={(e) => handleFieldChange('businessCategory', e.target.value)}
                      className={`${inputClassName} ${fieldErrors.businessCategory ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                      placeholder="업종"
                    />
                    {fieldErrors.businessCategory && (
                      <p className="mt-1.5 text-sm text-red-500">{fieldErrors.businessCategory}</p>
                    )}
                  </div>
                </div>
                <div>
                  <label
                    htmlFor="businessAddress"
                    className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                  >
                    사업자주소 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    id="businessAddress"
                    name="business_address"
                    value={formValues.businessAddress}
                    onChange={(e) => handleFieldChange('businessAddress', e.target.value)}
                    onBlur={() => handleFieldBlur('businessAddress')}
                    aria-required="true"
                    className={`${inputClassName} ${fieldErrors.businessAddress ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                    placeholder="사업자주소를 입력하세요"
                  />
                  {fieldErrors.businessAddress && (
                    <p className="mt-1.5 text-sm text-red-500">{fieldErrors.businessAddress}</p>
                  )}
                </div>
                <div className="pt-2">
                  <FileUpload
                    name="business_registration_file"
                    id="business_registration_file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    maxSize={10 * 1024 * 1024}
                    disabled={isSubmitting}
                    files={selectedFiles}
                    onChange={setSelectedFiles}
                    label="사업자등록증"
                    helpText="PDF, JPG, PNG 파일만 업로드 가능합니다."
                  />
                </div>
              </div>
            </div>

            {/* 실무담당자 섹션 */}
            <div className="p-6 rounded-2xl">
              <h2 className={`text-xl font-bold ${TEXT_COLOR.strong} mb-6`}>실무담당자</h2>
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="managerName"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      성함 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="managerName"
                      name="manager_name"
                      value={formValues.managerName}
                      onChange={(e) => handleFieldChange('managerName', e.target.value)}
                      onBlur={() => handleFieldBlur('managerName')}
                      aria-required="true"
                      className={`${inputClassName} ${fieldErrors.managerName ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                      placeholder="성함"
                    />
                    {fieldErrors.managerName && (
                      <p className="mt-1.5 text-sm text-red-500">{fieldErrors.managerName}</p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="managerPosition"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      직함 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      id="managerPosition"
                      name="manager_position"
                      value={formValues.managerPosition}
                      onChange={(e) => handleFieldChange('managerPosition', e.target.value)}
                      onBlur={() => handleFieldBlur('managerPosition')}
                      aria-required="true"
                      className={`${inputClassName} ${fieldErrors.managerPosition ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                      placeholder="직함"
                    />
                    {fieldErrors.managerPosition && (
                      <p className="mt-1.5 text-sm text-red-500">{fieldErrors.managerPosition}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="managerPhone"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      연락처 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="tel"
                      id="managerPhone"
                      name="manager_phone"
                      value={formValues.managerPhone}
                      onChange={(e) => handleFieldChange('managerPhone', e.target.value)}
                      onBlur={() => handleFieldBlur('managerPhone')}
                      aria-required="true"
                      className={`${inputClassName} ${fieldErrors.managerPhone ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                      placeholder="010-1234-5678"
                    />
                    {fieldErrors.managerPhone && (
                      <p className="mt-1.5 text-sm text-red-500">{fieldErrors.managerPhone}</p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="managerEmail"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      이메일 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="email"
                      id="managerEmail"
                      name="manager_email"
                      value={formValues.managerEmail}
                      onChange={(e) => handleFieldChange('managerEmail', e.target.value)}
                      onBlur={() => handleFieldBlur('managerEmail')}
                      aria-required="true"
                      className={`${inputClassName} ${fieldErrors.managerEmail ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                      placeholder="email@example.com"
                    />
                    {fieldErrors.managerEmail && (
                      <p className="mt-1.5 text-sm text-red-500">{fieldErrors.managerEmail}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* 회계담당자 섹션 */}
            <div className="p-6 rounded-2xl">
              <h2 className={`text-xl font-bold ${TEXT_COLOR.strong} mb-6`}>
                회계담당자{' '}
                <span className={`${TEXT_COLOR.dimAlpha} text-sm font-normal`}>(선택)</span>
              </h2>
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="accountantName"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      성함
                    </label>
                    <input
                      type="text"
                      id="accountantName"
                      name="accountant_name"
                      value={formValues.accountantName}
                      onChange={(e) => handleFieldChange('accountantName', e.target.value)}
                      className={`${inputClassName} ${fieldErrors.accountantName ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                      placeholder="성함"
                    />
                    {fieldErrors.accountantName && (
                      <p className="mt-1.5 text-sm text-red-500">{fieldErrors.accountantName}</p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="accountantPhone"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      연락처
                    </label>
                    <input
                      type="tel"
                      id="accountantPhone"
                      name="accountant_phone"
                      value={formValues.accountantPhone}
                      onChange={(e) => handleFieldChange('accountantPhone', e.target.value)}
                      className={`${inputClassName} ${fieldErrors.accountantPhone ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                      placeholder="010-1234-5678"
                    />
                    {fieldErrors.accountantPhone && (
                      <p className="mt-1.5 text-sm text-red-500">{fieldErrors.accountantPhone}</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label
                      htmlFor="accountantEmail"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      세금계산서 발행 이메일
                    </label>
                    <input
                      type="email"
                      id="accountantEmail"
                      name="accountant_email"
                      value={formValues.accountantEmail}
                      onChange={(e) => handleFieldChange('accountantEmail', e.target.value)}
                      onBlur={() => handleFieldBlur('accountantEmail')}
                      className={`${inputClassName} ${fieldErrors.accountantEmail ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                      placeholder="email@example.com"
                    />
                    {fieldErrors.accountantEmail && (
                      <p className="mt-1.5 text-sm text-red-500">{fieldErrors.accountantEmail}</p>
                    )}
                  </div>
                  <div>
                    <label
                      htmlFor="accountantFax"
                      className={`block ${TEXT_COLOR.alphaLight} text-base mb-2`}
                    >
                      팩스번호
                      {formValues.quoteMethod === 'fax' && <span className="text-red-500"> *</span>}
                    </label>
                    <input
                      ref={faxInputRef}
                      type="text"
                      id="accountantFax"
                      name="accountant_fax"
                      value={formValues.accountantFax}
                      onChange={(e) => {
                        handleFieldChange('accountantFax', e.target.value);
                        if (faxHighlight) setFaxHighlight(false);
                      }}
                      onBlur={() => handleFieldBlur('accountantFax')}
                      className={`${inputClassName} ${faxHighlight || fieldErrors.accountantFax ? 'border-red-500 ring-2 ring-red-500/30' : ''}`}
                      placeholder="02-1234-5678"
                    />
                    {(faxHighlight || fieldErrors.accountantFax) && (
                      <p className="mt-1.5 text-sm text-red-500">
                        {fieldErrors.accountantFax ||
                          '팩스로 견적서를 받으시려면 팩스번호를 입력해주세요.'}
                      </p>
                    )}
                  </div>
                </div>

                {/* 견적서 제공받을 방법 */}
                <div className={`pt-4 border-t ${BORDER_COLOR.whiteAlpha}`}>
                  <h3 className={`text-base font-semibold ${TEXT_COLOR.strong} mb-4`}>
                    견적서 제공받을 방법
                  </h3>
                  <div className="flex flex-wrap gap-6">
                    <RadioButton
                      name="quote_method"
                      value="email"
                      checked={formValues.quoteMethod === 'email'}
                      onChange={(e) => handleFieldChange('quoteMethod', e.target.value)}
                      label="이메일"
                      showUnderline={false}
                    />
                    <RadioButton
                      name="quote_method"
                      value="fax"
                      checked={formValues.quoteMethod === 'fax'}
                      onChange={(e) => handleFieldChange('quoteMethod', e.target.value)}
                      label="팩스"
                      showUnderline={false}
                    />
                    <RadioButton
                      name="quote_method"
                      value="sms"
                      checked={formValues.quoteMethod === 'sms'}
                      onChange={(e) => handleFieldChange('quoteMethod', e.target.value)}
                      label="휴대폰문자"
                      showUnderline={false}
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* 테스트 계정 생성 */}
            <div
              className={`${BG_COLOR.grayAlpha} border ${BORDER_COLOR.whiteAlpha} p-6 rounded-2xl`}
            >
              <button
                type="button"
                onClick={handleCreateTestAccount}
                disabled={isCreatingTest}
                className="w-full py-4 bg-gray-500 hover:bg-gray-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white font-semibold text-base rounded-xl transition-colors duration-200"
              >
                {isCreatingTest ? (
                  <span className="flex items-center justify-center gap-2">
                    <FaSpinner className="animate-spin" />
                    테스트 계정 생성 중...
                  </span>
                ) : (
                  '테스트 계정 생성'
                )}
              </button>
              <p className={`mt-3 text-sm text-center ${TEXT_COLOR.mutedAlpha}`}>
                테스트용 계정을 자동으로 생성합니다. (아이디: test_xxx, 비밀번호: test1234)
              </p>
            </div>

            {/* 제출 버튼 영역 */}
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 pt-4">
              <Link
                href="/login"
                className={`${TEXT_COLOR.dimAlpha} ${TEXT_COLOR.hoverSoftWhite} transition-colors`}
              >
                이미 계정이 있으신가요? <span className="text-[#ED6C00]">로그인</span>
              </Link>
              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full sm:w-auto px-12 py-4 bg-[#ED6C00] text-white font-semibold text-base rounded-xl hover:bg-[#d15f00] transition-colors duration-200 disabled:opacity-70"
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <FaSpinner className="animate-spin" />
                    처리 중...
                  </span>
                ) : (
                  '업체등록 신청'
                )}
              </button>
            </div>
          </form>

          {/* 성공 모달 */}
          {showSuccessModal && (
            <SuccessModal
              isOpen={showSuccessModal}
              onClose={() => {
                setShowSuccessModal(false);
                router.push('/login');
              }}
              title="업체등록이 완료되었습니다!"
              message="관리자 승인 후 로그인하실 수 있습니다. 귀사의 무궁한 발전을 기원합니다!"
              redirectUrl="/login"
            />
          )}
        </div>
      </div>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className={`min-h-screen ${BG_COLOR.loginPage} flex items-center justify-center`}>
          <div className="text-center">
            <FaSpinner className="animate-spin text-4xl text-[#ED6C00] mx-auto mb-4" />
            <p className={TEXT_COLOR.dimAlphaLight}>로딩 중...</p>
          </div>
        </div>
      }
    >
      <RegisterForm />
    </Suspense>
  );
}
