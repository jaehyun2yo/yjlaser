'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import SuccessModal from '@/components/SuccessModal';
import ErrorModal from '@/components/ErrorModal';
import StepIndicator from '@/components/contact/StepIndicator';
import { getErrorMessage } from '@/lib/utils/contactValidation';
import type { ContactFormProps } from '@/types/contact';
import { FileUpload } from '@/components/FileUpload';
import { RadioButton } from '@/components/RadioButton';
import { InfoBox } from '@/components/InfoBox';
import { Label } from '@/components/form/Label';
import { useContactFormStyles } from '@/lib/styles/contactFormStyles';
import { BoxShapeSelector } from '@/components/contact/BoxShapeSelector';
import { logger } from '@/lib/utils/logger';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import {
  INQUIRY_BLOCKED_EXTENSIONS,
  INQUIRY_UPLOAD_ACCEPT_ATTR,
} from '@/lib/utils/file-upload-policy';
import type { SlotAvailability } from '@/lib/types/booking';
import {
  BookingSlotList,
  BOOKING_SLOT_HOURS,
  buildTimeSlotLabel,
} from '@/app/contact/_components/BookingSlotList';
import {
  ContactCompanyInfoSection,
  ContactEstimateMethodSection,
  ContactFileUploadSection,
  ContactVisitBookingSection,
} from '@/app/contact/_components/contactFormSections';
import { ContactSubmitButton } from '@/app/contact/_components/ContactSubmitButton';
import { buildContactSubmitFormData } from '@/app/contact/_lib/contactSubmission';
import { useContactSubmitAction } from '@/app/contact/hooks/useContactSubmitAction';

const log = logger.createLogger('ContactForm');

export default function ContactForm({
  success,
  error,
  initialValues,
  portfolioProduct,
}: ContactFormProps) {
  const router = useRouter();
  const { submitContactForm } = useContactSubmitAction();
  const [currentStep, setCurrentStep] = useState(1);
  const [contactType, setContactType] = useState<'company' | 'individual'>('company');
  const [serviceType, setServiceType] = useState<'moldRequest' | 'deliveryBrokerage' | ''>('');

  // 도면 및 샘플 섹션 state
  const [drawingType, setDrawingType] = useState<'create' | 'have' | ''>('');
  const [hasPhysicalSample, setHasPhysicalSample] = useState(false);
  const [hasReferencePhotos, setHasReferencePhotos] = useState(false);
  const [hasOtherSample, setHasOtherSample] = useState(false);
  const [otherSampleText, setOtherSampleText] = useState('');
  const [drawingModification, setDrawingModification] = useState<'needed' | 'not_needed' | ''>('');

  // 일정 조율 섹션 state
  // const [selectedDate, setSelectedDate] = useState<string>(''); // 미사용
  // const [selectedTimeSlot, setSelectedTimeSlot] = useState<string>(''); // 미사용

  // 수령방법 선택 state
  const [receiptMethod, setReceiptMethod] = useState<'visit' | 'delivery' | ''>('');
  const [visitLocation] = useState<string>('');

  // 버전별 스타일 훅 사용
  const { getStyle, isMobile, isTablet, isDesktop } = useContactFormStyles();

  // 납품업체 state (모두 준비되었을 경우)
  const [deliveryMethod, setDeliveryMethod] = useState<'company_address' | 'delivery_company'>(
    'company_address'
  );
  const [savedDeliveryCompanies, setSavedDeliveryCompanies] = useState<
    Array<{
      id: number;
      name: string;
      phone: string;
      address: string;
    }>
  >([]);
  const [selectedDeliveryCompanyId, setSelectedDeliveryCompanyId] = useState<number | ''>('');
  const [newDeliveryCompany, setNewDeliveryCompany] = useState<{
    name: string;
    phone: string;
    address: string;
  }>({
    name: '',
    phone: '',
    address: '',
  });
  const [isSavingCompany, setIsSavingCompany] = useState(false);
  const [companyAddress, setCompanyAddress] = useState<string>('');
  const [isLoadingAddress, setIsLoadingAddress] = useState(false);
  const [addressError, setAddressError] = useState<string>('');
  const [isCompanyLoggedIn, setIsCompanyLoggedIn] = useState<boolean | null>(null);

  // 업체 주소 가져오기 및 로그인 상태 확인, 저장된 납품업체 불러오기
  useEffect(() => {
    const fetchCompanyAddress = async () => {
      setIsLoadingAddress(true);
      setAddressError('');
      try {
        const response = await fetch('/api/company/address');
        if (response.ok) {
          const data = await response.json();
          setIsCompanyLoggedIn(true);
          if (data.address) {
            setCompanyAddress(data.address);
          } else {
            setAddressError('no_address');
          }

          // 로그인 성공 시 저장된 납품업체 불러오기
          try {
            const deliveryResponse = await fetch('/api/company/delivery-companies');
            if (deliveryResponse.ok) {
              const deliveryData = await deliveryResponse.json();
              setSavedDeliveryCompanies(deliveryData.deliveryCompanies || []);
            }
          } catch (error) {
            log.error('Error fetching delivery companies', error);
          }
        } else {
          if (response.status === 401 || response.status === 403) {
            setIsCompanyLoggedIn(false);
            setAddressError('not_logged_in');
          } else {
            setIsCompanyLoggedIn(false);
            setAddressError('error');
          }
        }
      } catch (error) {
        log.error('Error fetching company address', error);
        setIsCompanyLoggedIn(false);
        setAddressError('error');
      } finally {
        setIsLoadingAddress(false);
      }
    };

    if (drawingType === 'have') {
      fetchCompanyAddress();
    }
  }, [drawingType]);

  // 오늘 +2일 계산 (주말이면 가장 가까운 평일)
  const getDefaultVisitDate = (): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const defaultDate = new Date(today);

    // 오늘 +2일 계산
    defaultDate.setDate(defaultDate.getDate() + 2);

    // +2일이 주말이면 가장 가까운 평일로 이동
    while (defaultDate.getDay() === 0 || defaultDate.getDay() === 6) {
      // 일요일(0) 또는 토요일(6)이면 다음 날로 이동
      defaultDate.setDate(defaultDate.getDate() + 1);
    }

    // ISO 문자열로 변환 (로컬 시간대 고려)
    const year = defaultDate.getFullYear();
    const month = String(defaultDate.getMonth() + 1).padStart(2, '0');
    const day = String(defaultDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // 최소 날짜 계산 (오늘 +2일, 주말이면 가장 가까운 평일)
  const getMinVisitDate = (): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const minDate = new Date(today);

    // 오늘 +2일 계산
    minDate.setDate(minDate.getDate() + 2);

    // +2일이 주말이면 가장 가까운 평일로 이동
    while (minDate.getDay() === 0 || minDate.getDay() === 6) {
      // 일요일(0) 또는 토요일(6)이면 다음 날로 이동
      minDate.setDate(minDate.getDate() + 1);
    }

    // ISO 문자열로 변환 (로컬 시간대 고려)
    const year = minDate.getFullYear();
    const month = String(minDate.getMonth() + 1).padStart(2, '0');
    const day = String(minDate.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const [visitDate, setVisitDate] = useState<string>(getDefaultVisitDate());
  const [visitTimeSlot, setVisitTimeSlot] = useState<string>('');
  const [bookingAvailability, setBookingAvailability] = useState<Record<string, SlotAvailability>>(
    {}
  );
  const [bookingLoading, setBookingLoading] = useState<boolean>(false);
  const [deliveryAddress, setDeliveryAddress] = useState<string>('');
  const [deliveryName, setDeliveryName] = useState<string>('');
  const [deliveryPhone, setDeliveryPhone] = useState<string>('');
  const [deliveryType, setDeliveryType] = useState<'parcel' | 'quick' | ''>('');

  // Step 1, 2의 입력값을 state로 관리 (초기값 설정)
  const [inquiryTitle, setInquiryTitle] = useState(
    portfolioProduct ? `[${portfolioProduct.title}] 제품 문의` : ''
  );
  const [companyName, setCompanyName] = useState(initialValues?.companyName || '');
  const [name, setName] = useState(initialValues?.name || '');
  const [position, setPosition] = useState(initialValues?.position || '');
  const [phone, setPhone] = useState(initialValues?.phone || '');
  const [email, setEmail] = useState(initialValues?.email || '');
  // 업체 로그인 시 "기존업체"를 기본값으로 설정
  const [referralSource, setReferralSource] = useState<string>(initialValues ? '기존업체' : '');
  const [referralSourceOther, setReferralSourceOther] = useState('');
  const [boxShape, setBoxShape] = useState('');
  const [length, setLength] = useState('');
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [material, setMaterial] = useState('');
  const [drawingNotes, setDrawingNotes] = useState('');
  const [sampleNotes, setSampleNotes] = useState('');
  const [referencePhotosFiles, setReferencePhotosFiles] = useState<File[]>([]);
  const [drawingFile, setDrawingFile] = useState<File[]>([]);

  // 모달 상태
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showErrorModal, setShowErrorModal] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [successRedirectUrl, setSuccessRedirectUrl] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 필드별 에러 상태 관리
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  // 예약 가능 여부 확인 함수
  const checkBookingAvailability = async (date: string) => {
    if (!date) return;

    const availability: Record<string, SlotAvailability> = {};
    const FALLBACK_MAX_CAPACITY = 2;

    // 날짜 변경 시 이전 응답이 남아있으면 신규 렌더링이 "로드됨" 으로 오판하므로 먼저 초기화.
    setBookingAvailability({});
    setBookingLoading(true);
    try {
      // 모든 시간 슬롯의 예약 가능 여부를 한 번에 확인
      const promises = BOOKING_SLOT_HOURS.map(async (startHour) => {
        const timeSlot = buildTimeSlotLabel(startHour);

        try {
          const response = await fetch(
            `/api/bookings/available?date=${date}&timeSlot=${encodeURIComponent(timeSlot)}`
          );
          if (response.ok) {
            const data = await response.json();
            const maxCapacity =
              typeof data.maxBookings === 'number' ? data.maxBookings : FALLBACK_MAX_CAPACITY;
            availability[timeSlot] = {
              count: data.bookingCount ?? 0,
              available: data.isAvailable ?? false,
              maxCapacity,
            };
            // 디버깅: 예약 개수가 정원 이상인 경우 로그 출력
            if ((data.bookingCount ?? 0) >= maxCapacity) {
              log.info('Booking full', { date, timeSlot, count: data.bookingCount, maxCapacity });
            }
          } else {
            // API 에러 발생 시 예약 불가로 처리 (안전한 선택)
            const errorData = await response.json().catch(() => ({}));
            log.error('Error fetching availability', errorData, { date, timeSlot });
            availability[timeSlot] = {
              count: FALLBACK_MAX_CAPACITY,
              available: false,
              maxCapacity: FALLBACK_MAX_CAPACITY,
            };
          }
        } catch (fetchError) {
          log.error('Fetch error for availability', fetchError, { date, timeSlot });
          availability[timeSlot] = {
            count: FALLBACK_MAX_CAPACITY,
            available: false,
            maxCapacity: FALLBACK_MAX_CAPACITY,
          };
        }
      });

      await Promise.all(promises);
      setBookingAvailability(availability);
    } catch (error) {
      log.error('Error checking booking availability', error);
      // 에러 발생 시 모든 시간 슬롯을 마감으로 처리 (안전한 선택)
      BOOKING_SLOT_HOURS.forEach((startHour) => {
        const timeSlot = buildTimeSlotLabel(startHour);
        availability[timeSlot] = {
          count: FALLBACK_MAX_CAPACITY,
          available: false,
          maxCapacity: FALLBACK_MAX_CAPACITY,
        };
      });
      setBookingAvailability(availability);
    } finally {
      setBookingLoading(false);
    }
  };

  // 초기값이 변경되면 state 업데이트 (업체 로그인 시 자동 채우기)
  useEffect(() => {
    if (initialValues) {
      if (initialValues.companyName) setCompanyName(initialValues.companyName);
      if (initialValues.name) setName(initialValues.name);
      if (initialValues.position) setPosition(initialValues.position);
      if (initialValues.phone) setPhone(initialValues.phone);
      if (initialValues.email) setEmail(initialValues.email);
      // 업체 정보가 있으면 contactType을 'company'로 설정
      setContactType('company');
      // 업체 로그인 시 유입경로를 "기존업체"로 설정
      setReferralSource('기존업체');
    }
  }, [initialValues]);

  // 날짜가 비어있거나 현재 날짜 기준으로 재계산이 필요한 경우 업데이트
  useEffect(() => {
    if (!visitDate || currentStep === 3) {
      const newDefaultDate = getDefaultVisitDate();
      if (!visitDate || visitDate !== newDefaultDate) {
        setVisitDate(newDefaultDate);
      }
    }
  }, [currentStep]);

  // visitDate가 변경되거나 Step 3로 이동할 때 예약 가능 여부 확인
  useEffect(() => {
    if (visitDate && currentStep === 3 && receiptMethod === 'visit') {
      checkBookingAvailability(visitDate);
    }
  }, [visitDate, currentStep, receiptMethod]);

  // 내용 확인 페이지에서 파일 정보만 읽기 (나머지는 state에서 직접 사용)
  useEffect(() => {
    if (currentStep === 4) {
      // 약간의 지연을 두어 DOM이 완전히 렌더링된 후 읽기
      setTimeout(() => {
        const form = document.querySelector('form') as HTMLFormElement;
        if (form) {
          // Step 2: 도면 파일 정보 읽기
          const drawingFilesEl = document.getElementById('review_drawing_files');
          if (drawingFilesEl && drawingFile.length > 0) {
            drawingFilesEl.textContent = drawingFile.map((f) => f.name).join(', ');
          } else if (drawingFilesEl && drawingType === 'have') {
            drawingFilesEl.textContent = '파일 업로드 필요';
          }
        }
      }, 100);
    }
  }, [currentStep, drawingType, drawingFile]);

  return (
    <div className={getStyle('container')}>
      <div className={`flex items-center justify-between ${getStyle('spacing')}`}>
        <h1 className={`${getStyle('title')} ${TEXT_COLOR.primary}`}>문의하기</h1>
        {/* 테스트 버튼 - 개발 환경에서만 표시 */}
        {/* {process.env.NODE_ENV === 'development' && (
          <button
            type="button"
            onClick={() => setShowSuccessModal(true)}
            className="px-4 py-2 text-sm bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition-colors"
          >
            모달 테스트
          </button>
        )} */}
      </div>

      {success && (
        <div
          className={`rounded-md border ${BORDER_COLOR.successMedium} ${BG_COLOR.success} p-4 text-sm ${TEXT_COLOR.successStrong} mb-6`}
        >
          문의가 성공적으로 전송되었습니다. 빠른 시일 내에 답변드리겠습니다.
        </div>
      )}

      {error && getErrorMessage(error) && (
        <div
          className={`rounded-md border ${BORDER_COLOR.errorBorder} ${BG_COLOR.error} p-4 text-sm ${TEXT_COLOR.errorStrong} mb-6`}
        >
          {getErrorMessage(error)}
        </div>
      )}

      {/* 진행 단계 표시 */}
      <StepIndicator currentStep={currentStep} drawingType={drawingType} />

      <div
        className={`${BG_COLOR.white} ${isMobile ? `border ${BORDER_COLOR.light} rounded-2xl p-3 shadow-sm` : `border-2 ${BORDER_COLOR.default} rounded-xl shadow-md ${isTablet ? 'p-6' : 'p-8'}`} transition-colors duration-300`}
      >
        <form className={isMobile ? 'space-y-4' : 'space-y-6'}>
          {/* 첫 번째 섹션: 패키지명 */}
          <ContactCompanyInfoSection
            active={currentStep === 1}
            className={isMobile ? 'space-y-5' : 'space-y-8'}
          >
            {/* 포트폴리오 제품 정보 (있는 경우에만 표시) */}
            {portfolioProduct && (
              <div
                className={`bg-gradient-to-r from-brand/5 to-brand/10 border-2 border-brand/30 rounded-xl ${getStyle('sectionPadding')}`}
              >
                <div className="flex items-start gap-4">
                  {portfolioProduct.imageUrl && (
                    <div className="flex-shrink-0">
                      <img
                        src={portfolioProduct.imageUrl}
                        alt={portfolioProduct.title}
                        className="w-20 h-20 sm:w-24 sm:h-24 object-cover rounded-lg border border-brand/20"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="inline-flex items-center px-2 py-0.5 bg-brand text-white text-xs rounded-full">
                        참고 제품
                      </span>
                      {portfolioProduct.field && (
                        <span className="inline-flex items-center px-2 py-0.5 bg-brand/10 text-brand text-xs rounded-full">
                          {portfolioProduct.field}
                        </span>
                      )}
                    </div>
                    <h3
                      className={`text-base sm:text-lg font-semibold ${TEXT_COLOR.primary} truncate`}
                    >
                      {portfolioProduct.title}
                    </h3>
                    <div className={`mt-2 text-xs sm:text-sm ${TEXT_COLOR.tertiary} space-y-0.5`}>
                      {portfolioProduct.format && (
                        <p>
                          <span className="text-gray-500">형태:</span> {portfolioProduct.format}
                        </p>
                      )}
                      {portfolioProduct.size && (
                        <p>
                          <span className="text-gray-500">크기:</span> {portfolioProduct.size}
                        </p>
                      )}
                      {portfolioProduct.paper && (
                        <p>
                          <span className="text-gray-500">용지:</span> {portfolioProduct.paper}
                        </p>
                      )}
                      {portfolioProduct.finishing && (
                        <p>
                          <span className="text-gray-500">후가공:</span>{' '}
                          {portfolioProduct.finishing}
                        </p>
                      )}
                    </div>
                    <p className={`mt-2 text-xs ${TEXT_COLOR.muted}`}>
                      위 제품을 참고하여 문의를 진행합니다
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* 패키지명 섹션 */}
            <div
              className={`border ${BORDER_COLOR.default} rounded-lg ${getStyle('sectionPadding')}`}
            >
              {/* 패키지명 입력 */}
              <div>
                <Label htmlFor="inquiry_title" required>
                  패키지명
                </Label>

                <input
                  type="text"
                  id="inquiry_title"
                  name="inquiry_title"
                  value={inquiryTitle}
                  onChange={(e) => {
                    setInquiryTitle(e.target.value);
                    if (fieldErrors.inquiryTitle) {
                      setFieldErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.inquiryTitle;
                        return newErrors;
                      });
                    }
                  }}
                  placeholder="제작하고자하는 패키지명"
                  className={`${getStyle('inputTwoThirds')} ${fieldErrors.inquiryTitle ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                  required
                />
                {fieldErrors.inquiryTitle && (
                  <p className={getStyle('errorText')}>{fieldErrors.inquiryTitle}</p>
                )}

                {/* 패키지명 작성 힌트 */}
                <p className={getStyle('hintText')}>
                  {isMobile ? (
                    <>
                      패키지명을 작성시에는
                      <br />
                      추후에 작업현황을 확인하실수있도록
                      <br />
                      알아보기쉽게 작성하면 편리합니다!
                    </>
                  ) : (
                    '패키지명을 작성시에는 추후에 작업현황을 확인하실수있도록 알아보기쉽게 작성하면 편리합니다!'
                  )}
                </p>
              </div>
            </div>

            {/* 연락처 정보 섹션 */}
            <div
              className={`border ${BORDER_COLOR.default} rounded-lg ${getStyle('sectionPadding')}`}
            >
              <h2 className={`${getStyle('sectionTitle')} ${TEXT_COLOR.primary}`}>연락처 정보</h2>

              {/* 업체/개인 선택 */}
              <div className="mb-6">
                <Label required>문의 유형</Label>
                <div className="flex gap-3 sm:gap-6">
                  <RadioButton
                    name="contact_type"
                    value="company"
                    checked={contactType === 'company'}
                    onChange={(e) => setContactType(e.target.value as 'company' | 'individual')}
                    label="업체"
                    underlineKey="contact-type-company"
                    size={isMobile ? 'sm' : 'md'}
                  />
                  <RadioButton
                    name="contact_type"
                    value="individual"
                    checked={contactType === 'individual'}
                    onChange={(e) => setContactType(e.target.value as 'company' | 'individual')}
                    label="개인"
                    underlineKey="contact-type-individual"
                    size={isMobile ? 'sm' : 'md'}
                  />
                </div>
              </div>

              {/* 개인 선택 시 서비스 유형 */}
              {contactType === 'individual' && (
                <div className="pl-4 border-l-2 border-brand mb-6">
                  <Label>
                    서비스 유형 <span className="text-gray-500 text-xs">(선택사항)</span>
                  </Label>
                  <div className="space-y-3">
                    <RadioButton
                      name="service_type"
                      value="moldRequest"
                      checked={serviceType === 'moldRequest'}
                      onChange={(e) =>
                        setServiceType(e.target.value as 'moldRequest' | 'deliveryBrokerage' | '')
                      }
                      label="목형 만 제작 의뢰합니다."
                      underlineKey="service-type-mold"
                      size={isMobile ? 'sm' : 'md'}
                    />
                    <RadioButton
                      name="service_type"
                      value="deliveryBrokerage"
                      checked={serviceType === 'deliveryBrokerage'}
                      onChange={(e) =>
                        setServiceType(e.target.value as 'moldRequest' | 'deliveryBrokerage' | '')
                      }
                      label="목형제작 및 납품까지 중개 를 원합니다."
                      underlineKey="service-type-delivery"
                      size={isMobile ? 'sm' : 'md'}
                    />
                  </div>
                </div>
              )}

              <div className="mb-6">
                <Label htmlFor="company_name" required>
                  {contactType === 'company' ? '업체명' : '이름'}
                </Label>
                <input
                  type="text"
                  id="company_name"
                  name="company_name"
                  value={companyName}
                  onChange={(e) => {
                    setCompanyName(e.target.value);
                    if (fieldErrors.company_name) {
                      setFieldErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.company_name;
                        return newErrors;
                      });
                    }
                  }}
                  required
                  className={`${getStyle('inputTwoThirds')} ${fieldErrors.company_name ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                  placeholder={
                    contactType === 'company' ? '업체명을 입력하세요' : '이름을 입력하세요'
                  }
                />
                {fieldErrors.company_name && (
                  <p className={getStyle('errorText')}>{fieldErrors.company_name}</p>
                )}
              </div>

              {contactType === 'company' && (
                <>
                  <div className="mb-6">
                    <Label htmlFor="name" required>
                      담당자명
                    </Label>
                    <input
                      type="text"
                      id="name"
                      name="name"
                      value={name}
                      onChange={(e) => {
                        setName(e.target.value);
                        if (fieldErrors.name) {
                          setFieldErrors((prev) => {
                            const newErrors = { ...prev };
                            delete newErrors.name;
                            return newErrors;
                          });
                        }
                      }}
                      required
                      className={`${getStyle('inputTwoThirds')} ${fieldErrors.name ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                      placeholder="담당자명을 입력하세요"
                    />
                    {fieldErrors.name && (
                      <p className={getStyle('errorText')}>{fieldErrors.name}</p>
                    )}
                  </div>

                  <div className="mb-6">
                    <Label htmlFor="position" required>
                      담당자 직책
                    </Label>
                    <input
                      type="text"
                      id="position"
                      name="position"
                      value={position}
                      onChange={(e) => {
                        setPosition(e.target.value);
                        if (fieldErrors.position) {
                          setFieldErrors((prev) => {
                            const newErrors = { ...prev };
                            delete newErrors.position;
                            return newErrors;
                          });
                        }
                      }}
                      required
                      className={`${getStyle('inputTwoThirds')} ${fieldErrors.position ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                      placeholder="예: 대표, 팀장, 매니저 등"
                    />
                    {fieldErrors.position && (
                      <p className={getStyle('errorText')}>{fieldErrors.position}</p>
                    )}
                  </div>
                </>
              )}

              <div className="mb-6">
                <Label htmlFor="phone" required>
                  연락처
                </Label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={phone}
                  onChange={(e) => {
                    setPhone(e.target.value);
                    if (fieldErrors.phone) {
                      setFieldErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.phone;
                        return newErrors;
                      });
                    }
                  }}
                  required
                  className={`${getStyle('inputTwoThirds')} ${fieldErrors.phone ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                  placeholder="010-1234-5678"
                />
                {fieldErrors.phone && <p className={getStyle('errorText')}>{fieldErrors.phone}</p>}
              </div>

              <div className="mb-6">
                <Label htmlFor="email" required>
                  이메일
                </Label>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) {
                      setFieldErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.email;
                        return newErrors;
                      });
                    }
                  }}
                  required
                  className={`${getStyle('inputTwoThirds')} ${fieldErrors.email ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                  placeholder="email@example.com"
                />
                {fieldErrors.email && <p className={getStyle('errorText')}>{fieldErrors.email}</p>}
              </div>

              <div className="mb-6">
                <Label htmlFor="referralSource" required>
                  유입경로
                </Label>
                <select
                  id="referralSource"
                  name="referralSource"
                  value={referralSource}
                  onChange={(e) => {
                    setReferralSource(e.target.value);
                    if (fieldErrors.referralSource) {
                      setFieldErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.referralSource;
                        return newErrors;
                      });
                    }
                  }}
                  required
                  className={`${getStyle('inputSelect')} ${fieldErrors.referralSource ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                >
                  <option value="">선택해주세요</option>
                  {initialValues && <option value="기존업체">기존업체</option>}
                  <option value="구글">구글</option>
                  <option value="네이버">네이버</option>
                  <option value="블로그">블로그</option>
                  <option value="인스타그램">인스타그램</option>
                  <option value="인공지능">인공지능</option>
                  <option value="거래처 소개">거래처 소개</option>
                  <option value="기타">기타</option>
                </select>
                {fieldErrors.referralSource && (
                  <p className={getStyle('errorText')}>{fieldErrors.referralSource}</p>
                )}
              </div>

              {(referralSource === '기타' || referralSource === '거래처 소개') && (
                <div className="mb-6">
                  <Label htmlFor="referralSourceOther" required>
                    {referralSource === '기타' ? '유입경로 (기타)' : '거래처명'}
                  </Label>
                  <input
                    type="text"
                    id="referralSourceOther"
                    name="referralSourceOther"
                    value={referralSourceOther}
                    onChange={(e) => {
                      setReferralSourceOther(e.target.value);
                      if (fieldErrors.referralSourceOther) {
                        setFieldErrors((prev) => {
                          const newErrors = { ...prev };
                          delete newErrors.referralSourceOther;
                          return newErrors;
                        });
                      }
                    }}
                    required
                    className={`${getStyle('inputTwoThirds')} ${fieldErrors.referralSourceOther ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                    placeholder={
                      referralSource === '기타'
                        ? '유입경로를 입력해주세요'
                        : '거래처명을 입력해주세요'
                    }
                  />
                  {fieldErrors.referralSourceOther && (
                    <p className={getStyle('errorText')}>{fieldErrors.referralSourceOther}</p>
                  )}
                </div>
              )}

              {/* 숨겨진 필드 (서비스 유형 정보 전달용) */}
              <input type="hidden" name="contact_type" value={contactType} />
              <input
                type="hidden"
                name="service_mold_request"
                value={serviceType === 'moldRequest' ? '1' : '0'}
              />
              <input
                type="hidden"
                name="service_delivery_brokerage"
                value={serviceType === 'deliveryBrokerage' ? '1' : '0'}
              />
            </div>

            {/* 다음 단계 버튼 */}
            <div className="flex justify-end pt-4">
              <button
                type="button"
                onClick={() => {
                  // Step 1 필수 항목 검증
                  const newFieldErrors: Record<string, string> = {};

                  // 문의 제목 검증
                  if (!inquiryTitle.trim()) {
                    newFieldErrors.inquiryTitle = '문의 제목을 입력해주세요.';
                  }

                  // 업체명/이름 검증
                  if (!companyName.trim()) {
                    newFieldErrors.company_name =
                      contactType === 'company' ? '업체명을 입력해주세요.' : '이름을 입력해주세요.';
                  }

                  // 담당자명 검증 (업체일 때만)
                  if (contactType === 'company' && !name.trim()) {
                    newFieldErrors.name = '담당자명을 입력해주세요.';
                  }

                  // 담당자 직책 검증 (업체일 때만)
                  if (contactType === 'company' && !position.trim()) {
                    newFieldErrors.position = '담당자 직책을 입력해주세요.';
                  }

                  // 연락처 검증
                  if (!phone.trim()) {
                    newFieldErrors.phone = '연락처를 입력해주세요.';
                  }

                  // 이메일 검증
                  if (!email.trim()) {
                    newFieldErrors.email = '이메일을 입력해주세요.';
                  } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
                    newFieldErrors.email = '올바른 이메일 형식을 입력해주세요.';
                  }

                  // 유입경로 검증
                  if (!referralSource) {
                    newFieldErrors.referralSource = '유입경로를 선택해주세요.';
                  } else if (
                    (referralSource === '기타' || referralSource === '거래처 소개') &&
                    !referralSourceOther.trim()
                  ) {
                    newFieldErrors.referralSourceOther =
                      referralSource === '기타'
                        ? '유입경로(기타)를 입력해주세요.'
                        : '거래처명을 입력해주세요.';
                  }

                  if (Object.keys(newFieldErrors).length > 0) {
                    setFieldErrors(newFieldErrors);
                    setTimeout(() => {
                      const firstErrorKey = Object.keys(newFieldErrors)[0];
                      let targetElement: HTMLElement | null = null;

                      // 특정 필드에 대한 포커싱 처리
                      if (firstErrorKey === 'inquiryTitle') {
                        // 패키지명 필드 (ID: inquiry_title)
                        targetElement = document.getElementById('inquiry_title') as HTMLElement;
                      } else if (firstErrorKey === 'referralSource') {
                        const select = document.getElementById('referralSource') as HTMLElement;
                        if (select) {
                          targetElement = select;
                        }
                      } else {
                        targetElement =
                          document.getElementById(firstErrorKey) ||
                          (document.querySelector(`[name="${firstErrorKey}"]`) as HTMLElement);
                      }

                      if (targetElement) {
                        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => {
                          if (targetElement) {
                            targetElement.focus();
                          }
                        }, 300);
                      }
                    }, 100);
                    return;
                  }

                  setFieldErrors({});
                  setCurrentStep(2);
                  // 화면 상단으로 스크롤
                  setTimeout(() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }, 100);
                }}
                className={getStyle('button')}
              >
                다음 단계
              </button>
            </div>
          </ContactCompanyInfoSection>

          {/* 두 번째 섹션: 도면 및 샘플 */}
          <ContactFileUploadSection
            active={currentStep === 2}
            className={isMobile ? 'space-y-4' : 'space-y-6'}
          >
            <h2 className={`text-xl font-semibold mb-6 ${TEXT_COLOR.primary}`}>도면 및 샘플</h2>

            {/* 필요한 사항 선택 */}
            <div>
              <Label required mb="lg">
                필요한 사항
              </Label>
              {fieldErrors.drawingType && (
                <p className="mb-2 text-xs text-red-500">{fieldErrors.drawingType}</p>
              )}
              <div className="space-y-3">
                <RadioButton
                  name="drawing_type"
                  value="create"
                  checked={drawingType === 'create'}
                  onChange={(e) => {
                    setDrawingType(e.target.value as 'create');
                    // 초기화
                    setHasPhysicalSample(false);
                    setHasReferencePhotos(false);
                    setHasOtherSample(false);
                    setOtherSampleText('');
                    if (fieldErrors.drawingType) {
                      setFieldErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.drawingType;
                        return newErrors;
                      });
                    }
                  }}
                  label="샘플 제작이 필요합니다."
                  underlineKey="drawing-type-create"
                  size={isMobile ? 'sm' : 'md'}
                />
                <RadioButton
                  name="drawing_type"
                  value="have"
                  checked={drawingType === 'have'}
                  onChange={(e) => {
                    setDrawingType(e.target.value as 'have');
                    // 초기화
                    setDrawingModification('');
                    if (fieldErrors.drawingType) {
                      setFieldErrors((prev) => {
                        const newErrors = { ...prev };
                        delete newErrors.drawingType;
                        return newErrors;
                      });
                    }
                  }}
                  label="모두 준비되었으니, 바로 목형 의뢰할께요."
                  underlineKey="drawing-type-have"
                  size={isMobile ? 'sm' : 'md'}
                />
              </div>
            </div>

            {/* 샘플 제작이 필요합니다 선택 시 */}
            <AnimatePresence mode="wait">
              {drawingType === 'create' && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: -30 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -30 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="pl-4 border-l-2 border-brand space-y-4 overflow-hidden"
                >
                  <div>
                    {fieldErrors.sampleRequired && (
                      <p className="mb-2 text-xs text-red-500">{fieldErrors.sampleRequired}</p>
                    )}
                    <div className="space-y-4">
                      {/* 샘플 제작에 필요한 실물이 있습니다 */}
                      <div
                        className={`overflow-hidden transition-all duration-300 ${
                          hasPhysicalSample ? 'border border-brand/60 rounded-lg' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setHasPhysicalSample(!hasPhysicalSample);
                            if (fieldErrors.sampleRequired) {
                              setFieldErrors((prev) => {
                                const newErrors = { ...prev };
                                delete newErrors.sampleRequired;
                                return newErrors;
                              });
                            }
                          }}
                          className={`w-full flex items-center justify-between ${isMobile ? 'px-2 py-2' : 'px-4 py-3'} transition-all duration-300 focus:outline-none ${
                            hasPhysicalSample
                              ? `${BG_COLOR.brandWarmLight} border-b border-brand`
                              : `${BG_COLOR.whiteDark} border ${BORDER_COLOR.dark} rounded-lg ${BG_COLOR.hoverLighterDark}`
                          }`}
                        >
                          <div className="flex items-center">
                            <div
                              className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} rounded border-2 flex items-center justify-center ${isMobile ? 'mr-2' : 'mr-3'} transition-colors ${
                                hasPhysicalSample
                                  ? 'bg-brand border-brand'
                                  : '${BG_COLOR.white} ${BORDER_COLOR.stronger}'
                              }`}
                            >
                              {hasPhysicalSample && (
                                <svg
                                  className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-white`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={3}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </div>
                            <span
                              className={`${isMobile ? 'text-[12px]' : 'text-sm'} font-medium ${TEXT_COLOR.primary}`}
                            >
                              샘플 제작에 필요한 실물이 있습니다.
                            </span>
                          </div>
                          <svg
                            className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} ${TEXT_COLOR.primary} transition-transform duration-200 ${
                              hasPhysicalSample ? 'rotate-180' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>

                        {/* 실물 샘플이 있습니다 선택 시 - 체크되면 바로 아래 내용 표시 */}
                        {hasPhysicalSample && (
                          <div
                            className={`space-y-4 ${isMobile ? 'p-2' : 'p-4'} ${BG_COLOR.brandAlphaLight} transition-all duration-300`}
                          >
                            <InfoBox label="샘플 발송 주소">
                              <p
                                className={`${isMobile ? 'text-[12px]' : 'text-sm'} font-medium mb-1`}
                              >
                                서울 중구 퇴계로39길 20, 2층 유진레이저목형 사무실
                              </p>
                              <p
                                className={`${isMobile ? 'text-[11px]' : 'text-xs'} ${TEXT_COLOR.tertiary}`}
                              >
                                우편번호 : 04557
                              </p>
                              <p
                                className={`${isMobile ? 'text-[11px]' : 'text-xs'} ${TEXT_COLOR.tertiary}`}
                              >
                                전화: 02-2264-8070
                              </p>
                              <p
                                className={`${isMobile ? 'text-[11px]' : 'text-xs'} ${TEXT_COLOR.tertiary} mt-2`}
                              >
                                명함, 업체를 확인할 수 있는 서류 동봉 부탁드립니다.
                              </p>
                            </InfoBox>

                            <div>
                              <Label htmlFor="sample_notes">
                                샘플에 대한 특이사항{' '}
                                <span className="text-gray-500 text-xs">(선택사항)</span>
                              </Label>
                              <textarea
                                id="sample_notes"
                                name="sample_notes"
                                value={sampleNotes}
                                onChange={(e) => setSampleNotes(e.target.value)}
                                rows={3}
                                className={`${getStyle('inputTwoThirds')} resize-none`}
                                placeholder="샘플에 대한 특이사항이나 주의사항을 입력해주세요"
                              />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* 샘플 제작에 필요한 도면이나 사진이 있습니다 */}
                      <div
                        className={`overflow-hidden transition-all duration-300 ${
                          hasReferencePhotos ? 'border border-brand/60 rounded-lg' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            const next = !hasReferencePhotos;
                            setHasReferencePhotos(next);
                            // hotfix v2 (task 23 R3): 체크 해제 시 이미 선택된 참고사진을 즉시 비워
                            // 사용자가 의도적으로 첨부하지 않았는데 폼 제출에 포함되는 회귀를 차단.
                            if (!next) {
                              setReferencePhotosFiles([]);
                            }
                            if (fieldErrors.sampleRequired) {
                              setFieldErrors((prev) => {
                                const newErrors = { ...prev };
                                delete newErrors.sampleRequired;
                                return newErrors;
                              });
                            }
                          }}
                          className={`w-full flex items-center justify-between ${isMobile ? 'px-2 py-2' : 'px-4 py-3'} transition-all duration-300 focus:outline-none ${
                            hasReferencePhotos
                              ? `${BG_COLOR.brandWarmLight} border-b border-brand`
                              : `${BG_COLOR.whiteDark} border ${BORDER_COLOR.dark} rounded-lg ${BG_COLOR.hoverLighterDark}`
                          }`}
                        >
                          <div className="flex items-center">
                            <div
                              className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} rounded border-2 flex items-center justify-center ${isMobile ? 'mr-2' : 'mr-3'} transition-colors ${
                                hasReferencePhotos
                                  ? 'bg-brand border-brand'
                                  : '${BG_COLOR.white} ${BORDER_COLOR.stronger}'
                              }`}
                            >
                              {hasReferencePhotos && (
                                <svg
                                  className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-white`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={3}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </div>
                            <span
                              className={`${isMobile ? 'text-[12px]' : 'text-sm'} font-medium ${TEXT_COLOR.primary}`}
                            >
                              샘플 제작에 필요한 도면이나 사진이 있습니다.
                            </span>
                          </div>
                          <svg
                            className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} ${TEXT_COLOR.primary} transition-transform duration-200 ${
                              hasReferencePhotos ? 'rotate-180' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>
                        {/* 제작에 필요한 내용 자료 업로드 - 체크되면 바로 아래 내용 표시 */}
                        {hasReferencePhotos && (
                          <div
                            className={`space-y-4 ${isMobile ? 'p-2' : 'p-4'} ${BG_COLOR.brandAlphaLight} transition-all duration-300`}
                          >
                            <FileUpload
                              name="reference_photos"
                              id="reference_photos"
                              multiple
                              accept={INQUIRY_UPLOAD_ACCEPT_ATTR}
                              blockedExtensions={INQUIRY_BLOCKED_EXTENSIONS}
                              maxSize={10 * 1024 * 1024}
                              files={referencePhotosFiles}
                              onChange={setReferencePhotosFiles}
                              label="제작에 필요한 내용 자료 업로드"
                              helpText="EXE 실행 파일을 제외한 모든 형식 업로드 가능 (이미지·문서·도면·압축 등)"
                            />
                          </div>
                        )}
                      </div>

                      {/* 기타 */}
                      <div
                        className={`overflow-hidden transition-all duration-300 ${
                          hasOtherSample ? 'border border-brand/60 rounded-lg' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            setHasOtherSample(!hasOtherSample);
                            if (!hasOtherSample) {
                              setOtherSampleText('');
                            }
                            if (fieldErrors.sampleRequired) {
                              setFieldErrors((prev) => {
                                const newErrors = { ...prev };
                                delete newErrors.sampleRequired;
                                return newErrors;
                              });
                            }
                            if (fieldErrors.otherSampleText) {
                              setFieldErrors((prev) => {
                                const newErrors = { ...prev };
                                delete newErrors.otherSampleText;
                                return newErrors;
                              });
                            }
                          }}
                          className={`w-full flex items-center justify-between ${isMobile ? 'px-2 py-2' : 'px-4 py-3'} transition-all duration-300 focus:outline-none ${
                            hasOtherSample
                              ? `${BG_COLOR.brandWarmLight} border-b border-brand`
                              : `${BG_COLOR.whiteDark} border ${BORDER_COLOR.dark} rounded-lg ${BG_COLOR.hoverLighterDark}`
                          }`}
                        >
                          <div className="flex items-center">
                            <div
                              className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} rounded border-2 flex items-center justify-center ${isMobile ? 'mr-2' : 'mr-3'} transition-colors ${
                                hasOtherSample
                                  ? 'bg-brand border-brand'
                                  : '${BG_COLOR.white} ${BORDER_COLOR.stronger}'
                              }`}
                            >
                              {hasOtherSample && (
                                <svg
                                  className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-white`}
                                  fill="none"
                                  viewBox="0 0 24 24"
                                  stroke="currentColor"
                                >
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={3}
                                    d="M5 13l4 4L19 7"
                                  />
                                </svg>
                              )}
                            </div>
                            <span
                              className={`${isMobile ? 'text-[12px]' : 'text-sm'} font-medium ${TEXT_COLOR.primary}`}
                            >
                              기타
                            </span>
                          </div>
                          <svg
                            className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} ${TEXT_COLOR.primary} transition-transform duration-200 ${
                              hasOtherSample ? 'rotate-180' : ''
                            }`}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 9l-7 7-7-7"
                            />
                          </svg>
                        </button>
                        {/* 기타 선택 시 - 체크되면 바로 아래 내용 표시 */}
                        {hasOtherSample && (
                          <div
                            className={`space-y-4 ${isMobile ? 'p-2' : 'p-4'} ${BG_COLOR.brandAlphaLight} transition-all duration-300`}
                          >
                            <div>
                              <Label htmlFor="other_sample_text" required>
                                기타 내용
                              </Label>
                              <textarea
                                id="other_sample_text"
                                name="other_sample_text"
                                value={otherSampleText}
                                onChange={(e) => {
                                  setOtherSampleText(e.target.value);
                                  if (fieldErrors.otherSampleText) {
                                    setFieldErrors((prev) => {
                                      const newErrors = { ...prev };
                                      delete newErrors.otherSampleText;
                                      return newErrors;
                                    });
                                  }
                                  if (fieldErrors.sampleRequired) {
                                    setFieldErrors((prev) => {
                                      const newErrors = { ...prev };
                                      delete newErrors.sampleRequired;
                                      return newErrors;
                                    });
                                  }
                                }}
                                rows={4}
                                className={`${getStyle('inputTwoThirds')} resize-none ${fieldErrors.otherSampleText ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                                placeholder="기타 내용을 입력해주세요"
                                required
                              />
                              {fieldErrors.otherSampleText && (
                                <p className={getStyle('errorText')}>
                                  {fieldErrors.otherSampleText}
                                </p>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 모두 준비되었으니 바로 목형 의뢰할께요 선택 시 */}
            <AnimatePresence mode="wait">
              {drawingType === 'have' && (
                <motion.div
                  initial={{ opacity: 0, height: 0, y: -30 }}
                  animate={{ opacity: 1, height: 'auto', y: 0 }}
                  exit={{ opacity: 0, height: 0, y: -30 }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                  className="pl-4 border-l-2 border-brand space-y-4 overflow-hidden"
                >
                  <div>
                    <Label required mb="lg">
                      도면 수정 필요 여부
                    </Label>
                    <div className="space-y-3">
                      <RadioButton
                        name="drawing_modification"
                        value="needed"
                        checked={drawingModification === 'needed'}
                        onChange={(e) => {
                          setDrawingModification(e.target.value as 'needed');
                          if (fieldErrors.drawingModification) {
                            setFieldErrors((prev) => {
                              const newErrors = { ...prev };
                              delete newErrors.drawingModification;
                              return newErrors;
                            });
                          }
                        }}
                        label="도면의 수정이 필요합니다"
                        underlineKey="drawing-modification-needed"
                        size={isMobile ? 'sm' : 'md'}
                      />
                      <RadioButton
                        name="drawing_modification"
                        value="not_needed"
                        checked={drawingModification === 'not_needed'}
                        onChange={(e) => {
                          setDrawingModification(e.target.value as 'not_needed');
                          if (fieldErrors.drawingModification) {
                            setFieldErrors((prev) => {
                              const newErrors = { ...prev };
                              delete newErrors.drawingModification;
                              return newErrors;
                            });
                          }
                        }}
                        label="도면의 수정이 필요없습니다"
                        underlineKey="drawing-modification-not-needed"
                        size={isMobile ? 'sm' : 'md'}
                      />
                    </div>
                    {fieldErrors.drawingModification && (
                      <p className="mt-2 text-xs text-red-500">{fieldErrors.drawingModification}</p>
                    )}
                  </div>

                  <div>
                    <FileUpload
                      name="drawing_file"
                      id="drawing_file"
                      accept={INQUIRY_UPLOAD_ACCEPT_ATTR}
                      blockedExtensions={INQUIRY_BLOCKED_EXTENSIONS}
                      maxSize={10 * 1024 * 1024}
                      required={drawingType === 'have'}
                      files={drawingFile}
                      onChange={(files) => {
                        setDrawingFile(files);
                        if (fieldErrors.drawingFile) {
                          setFieldErrors((prev) => {
                            const newErrors = { ...prev };
                            delete newErrors.drawingFile;
                            return newErrors;
                          });
                        }
                      }}
                      label="도면 파일 업로드"
                    />
                    {fieldErrors.drawingFile && (
                      <p className={getStyle('errorText')}>{fieldErrors.drawingFile}</p>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* 공통 부분: 박스 형태, 장폭고, 원단 재질 */}
            <div className={`border-t ${BORDER_COLOR.default} pt-6 space-y-4`}>
              <h3 className={`text-sm font-semibold ${TEXT_COLOR.primary} mb-4`}>제품 정보</h3>

              <div>
                <Label htmlFor="box_shape">
                  박스 형태 <span className="text-gray-500 text-xs">(선택사항)</span>
                </Label>
                <BoxShapeSelector value={boxShape} onChange={setBoxShape} />
              </div>

              <div>
                <Label>
                  장폭고 <span className="text-gray-500 text-xs">(선택사항)</span>
                </Label>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label htmlFor="length" className={`block text-xs ${TEXT_COLOR.tertiary} mb-1`}>
                      장 (길이)
                    </label>
                    <input
                      type="text"
                      id="length"
                      name="length"
                      value={length}
                      onChange={(e) => setLength(e.target.value)}
                      className={getStyle('input')}
                      placeholder="mm"
                    />
                  </div>
                  <div>
                    <label htmlFor="width" className={`block text-xs ${TEXT_COLOR.tertiary} mb-1`}>
                      폭 (너비)
                    </label>
                    <input
                      type="text"
                      id="width"
                      name="width"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      className={getStyle('input')}
                      placeholder="mm"
                    />
                  </div>
                  <div>
                    <label htmlFor="height" className={`block text-xs ${TEXT_COLOR.tertiary} mb-1`}>
                      고 (높이)
                    </label>
                    <input
                      type="text"
                      id="height"
                      name="height"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      className={getStyle('input')}
                      placeholder="mm"
                    />
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="material">
                  원단 재질 <span className="text-gray-500 text-xs">(선택사항)</span>
                </Label>
                <input
                  type="text"
                  id="material"
                  name="material"
                  value={material}
                  onChange={(e) => setMaterial(e.target.value)}
                  className={getStyle('inputTwoThirds')}
                  placeholder="예: 종이, 플라스틱, 천 등"
                />
              </div>
            </div>

            {/* 도면 및 샘플 제작시 유의사항 */}
            <div>
              <Label htmlFor="drawing_notes">
                도면 및 샘플 제작시 유의사항{' '}
                <span className="text-gray-500 text-xs">(선택사항)</span>
              </Label>
              <textarea
                id="drawing_notes"
                name="drawing_notes"
                value={drawingNotes}
                onChange={(e) => setDrawingNotes(e.target.value)}
                rows={4}
                className={`${getStyle('inputTwoThirds')} resize-none`}
                placeholder="도면 및 샘플 제작시 특별히 주의해야 할 사항을 입력해주세요"
              />
            </div>

            {/* 숨겨진 필드 (도면 관련 정보 전달용) */}
            <input type="hidden" name="drawing_type" value={drawingType || ''} />
            <input type="hidden" name="has_physical_sample" value={hasPhysicalSample ? '1' : '0'} />
            <input
              type="hidden"
              name="has_reference_photos"
              value={hasReferencePhotos ? '1' : '0'}
            />
            <input type="hidden" name="has_other_sample" value={hasOtherSample ? '1' : '0'} />
            <input type="hidden" name="other_sample_text" value={otherSampleText || ''} />
            <input type="hidden" name="drawing_modification" value={drawingModification || ''} />
            <input type="hidden" name="box_shape" value={boxShape || ''} />
            <input type="hidden" name="length" value={length || ''} />
            <input type="hidden" name="width" value={width || ''} />
            <input type="hidden" name="height" value={height || ''} />
            <input type="hidden" name="material" value={material || ''} />
            <input type="hidden" name="drawing_notes" value={drawingNotes || ''} />
            <input type="hidden" name="sample_notes" value={sampleNotes || ''} />

            {/* 네비게이션 버튼 */}
            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className={getStyle('buttonSecondary')}
              >
                이전
              </button>
              <button
                type="button"
                onClick={() => {
                  const newFieldErrors: Record<string, string> = {};
                  if (!drawingType) {
                    newFieldErrors.drawingType = '필요한 사항을 선택해주세요.';
                  } else if (drawingType === 'have') {
                    if (!drawingModification) {
                      newFieldErrors.drawingModification = '도면 수정 필요 여부를 선택해주세요.';
                    }
                    // 도면 파일 업로드 필수 검증
                    if (drawingFile.length === 0) {
                      newFieldErrors.drawingFile = '도면 파일을 업로드해주세요.';
                    }
                  } else if (drawingType === 'create') {
                    // 샘플제작이 필요합니다 선택 시, 물리적 샘플, 참고 사진, 기타 중 하나는 필수
                    if (!hasPhysicalSample && !hasReferencePhotos && !hasOtherSample) {
                      newFieldErrors.sampleRequired =
                        '샘플 제작에 필요한 실물, 도면/사진, 또는 기타 중 하나는 선택해주세요.';
                    } else if (hasOtherSample && !otherSampleText.trim()) {
                      // 기타 선택 시 내용 입력 필수
                      newFieldErrors.otherSampleText = '기타 내용을 입력해주세요.';
                    }
                  }

                  if (Object.keys(newFieldErrors).length > 0) {
                    setFieldErrors(newFieldErrors);
                    setTimeout(() => {
                      const firstErrorKey = Object.keys(newFieldErrors)[0];
                      let targetElement: HTMLElement | null = null;

                      if (firstErrorKey === 'drawingType') {
                        // drawingType은 라디오 버튼이므로 첫 번째 라디오 버튼의 label에 포커스
                        const firstRadio = document.querySelector(
                          'input[name="drawing_type"]'
                        ) as HTMLInputElement;
                        if (firstRadio) {
                          const label = firstRadio.closest('label') as HTMLElement;
                          if (label) {
                            targetElement = label;
                          } else {
                            targetElement = firstRadio;
                          }
                        } else {
                          // 라디오 버튼을 찾을 수 없으면 섹션 라벨로 스크롤
                          const labels = Array.from(document.querySelectorAll('label'));
                          const label = labels.find((l) => l.textContent?.includes('필요한 사항'));
                          if (label) {
                            targetElement = label as HTMLElement;
                          }
                        }
                      } else if (firstErrorKey === 'drawingModification') {
                        // drawingModification은 라디오 버튼이므로 첫 번째 라디오 버튼의 label에 포커스
                        const firstRadio = document.querySelector(
                          'input[name="drawing_modification"]'
                        ) as HTMLInputElement;
                        if (firstRadio) {
                          const label = firstRadio.closest('label') as HTMLElement;
                          if (label) {
                            targetElement = label;
                          } else {
                            targetElement = firstRadio;
                          }
                        } else {
                          // 라디오 버튼을 찾을 수 없으면 섹션 라벨로 스크롤
                          const labels = Array.from(document.querySelectorAll('label'));
                          const label = labels.find((l) =>
                            l.textContent?.includes('도면 수정 필요 여부')
                          );
                          if (label) {
                            targetElement = label as HTMLElement;
                          }
                        }
                      } else if (firstErrorKey === 'drawingFile') {
                        // drawingFile은 FileUpload 컴포넌트
                        const fileInput = document.getElementById('drawing_file') as HTMLElement;
                        if (fileInput) {
                          targetElement = fileInput;
                        } else {
                          // FileUpload 컴포넌트의 input 찾기
                          const fileInputByName = document.querySelector(
                            'input[name="drawing_file"]'
                          ) as HTMLElement;
                          if (fileInputByName) {
                            targetElement = fileInputByName;
                          } else {
                            // FileUpload 컴포넌트의 라벨 찾기
                            const labels = Array.from(document.querySelectorAll('label'));
                            const label = labels.find((l) =>
                              l.textContent?.includes('도면 파일 업로드')
                            );
                            if (label) {
                              targetElement = label as HTMLElement;
                            }
                          }
                        }
                      } else if (firstErrorKey === 'sampleRequired') {
                        // 샘플제작 필수 옵션 중 첫 번째 버튼 찾기
                        const sampleButtons = Array.from(
                          document.querySelectorAll('button[type="button"]')
                        );
                        const sampleButton = sampleButtons.find(
                          (btn) =>
                            btn.textContent?.includes('샘플 제작에 필요한 실물이 있습니다') ||
                            btn.textContent?.includes(
                              '샘플 제작에 필요한 도면이나 사진이 있습니다'
                            ) ||
                            btn.textContent?.includes('기타')
                        );
                        if (sampleButton) {
                          targetElement = sampleButton as HTMLElement;
                        } else {
                          // 찾을 수 없으면 섹션 헤더로 스크롤
                          const sectionHeaders = Array.from(document.querySelectorAll('h2'));
                          const sectionHeader = sectionHeaders.find((h) =>
                            h.textContent?.includes('도면 및 샘플')
                          );
                          if (sectionHeader) {
                            targetElement = sectionHeader as HTMLElement;
                          }
                        }
                      } else if (firstErrorKey === 'otherSampleText') {
                        targetElement = document.getElementById('other_sample_text') as HTMLElement;
                      } else {
                        // 일반 필드
                        targetElement =
                          document.getElementById(firstErrorKey) ||
                          (document.querySelector(`[name="${firstErrorKey}"]`) as HTMLElement);
                      }

                      if (targetElement) {
                        targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => {
                          if (targetElement) {
                            // label인 경우 내부의 input에 포커스
                            if (targetElement.tagName === 'LABEL') {
                              const input = targetElement.querySelector('input') as HTMLElement;
                              if (input) {
                                input.focus();
                              } else {
                                // input이 없으면 label 자체에 포커스 (tabindex 추가 필요할 수 있음)
                                targetElement.focus();
                              }
                            } else if (
                              targetElement.tagName === 'INPUT' ||
                              targetElement.tagName === 'BUTTON'
                            ) {
                              targetElement.focus();
                            }
                          }
                        }, 300);
                      } else {
                        // 찾을 수 없으면 섹션 헤더로 스크롤
                        const sectionHeaders = Array.from(document.querySelectorAll('h2'));
                        const sectionHeader = sectionHeaders.find((h) =>
                          h.textContent?.includes('도면 및 샘플')
                        );
                        if (sectionHeader) {
                          sectionHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }
                    }, 100);
                    return;
                  }

                  setFieldErrors({});
                  // 모두 준비되었으니 바로 목형 의뢰할께요 선택 시 납품업체 단계로 이동
                  setCurrentStep(3);
                  // 화면 상단으로 스크롤
                  setTimeout(() => {
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }, 100);
                }}
                className={getStyle('button')}
              >
                다음 단계
              </button>
            </div>
          </ContactFileUploadSection>

          {/* 세 번째 섹션: 일정 조율 또는 납품업체 */}
          <ContactVisitBookingSection
            active={currentStep === 3}
            className={isMobile ? 'space-y-4' : 'space-y-6'}
          >
            {drawingType === 'have' ? (
              <>
                <h2 className={`${getStyle('sectionTitle')} ${TEXT_COLOR.primary}`}>납품업체</h2>

                {/* 납품 방법 선택 (라디오) */}
                <div className="mb-6">
                  <Label required mb="lg">
                    납품 방법
                  </Label>
                  <div className="space-y-3">
                    <RadioButton
                      name="delivery_method"
                      value="company_address"
                      checked={deliveryMethod === 'company_address'}
                      onChange={(e) => {
                        setDeliveryMethod(e.target.value as 'company_address' | 'delivery_company');
                        setSelectedDeliveryCompanyId('');
                        setNewDeliveryCompany({ name: '', phone: '', address: '' });
                      }}
                      label="회사주소로 납품받겠습니다."
                      underlineKey="delivery-method-company"
                      size={isMobile ? 'sm' : 'md'}
                    />
                    <RadioButton
                      name="delivery_method"
                      value="delivery_company"
                      checked={deliveryMethod === 'delivery_company'}
                      onChange={(e) => {
                        setDeliveryMethod(e.target.value as 'company_address' | 'delivery_company');
                      }}
                      label="납품받을 업체가 있습니다."
                      underlineKey="delivery-method-company-select"
                      size={isMobile ? 'sm' : 'md'}
                    />
                  </div>
                </div>

                {/* 회사주소 선택 시 */}
                {deliveryMethod === 'company_address' && (
                  <div className="mb-6">
                    <Label>납품 주소</Label>
                    <p className={`text-xs ${TEXT_COLOR.tertiary} mb-3`}>
                      업체 등록했던 사업장 주소로 보내드리겠습니다!
                    </p>
                    {isLoadingAddress ? (
                      <InfoBox>
                        <p
                          className={`${isMobile ? 'text-[12px]' : 'text-sm'} font-medium ${TEXT_COLOR.primary}`}
                        >
                          업체정보에 등록된 주소를 불러오는 중...
                        </p>
                      </InfoBox>
                    ) : addressError === 'not_logged_in' ? (
                      <InfoBox>
                        <p
                          className={`${isMobile ? 'text-[12px]' : 'text-sm'} font-medium ${TEXT_COLOR.primary} mb-2`}
                        >
                          현재 로그인을 하지않아서 업체주소가 없습니다.
                        </p>
                        <p
                          className={`${isMobile ? 'text-[11px]' : 'text-xs'} ${TEXT_COLOR.tertiary}`}
                        >
                          업체등록을 먼저 해주시면 편하게 사용가능하십니다!
                        </p>
                      </InfoBox>
                    ) : companyAddress ? (
                      <InfoBox>
                        <p
                          className={`${isMobile ? 'text-[12px]' : 'text-sm'} font-medium ${TEXT_COLOR.primary}`}
                        >
                          {companyAddress}
                        </p>
                      </InfoBox>
                    ) : (
                      <InfoBox>
                        <p
                          className={`${isMobile ? 'text-[12px]' : 'text-sm'} font-medium ${TEXT_COLOR.primary}`}
                        >
                          업체정보에 등록된 주소를 불러올 수 없습니다.
                        </p>
                      </InfoBox>
                    )}
                  </div>
                )}

                {/* 납품업체 선택 시 */}
                {deliveryMethod === 'delivery_company' && (
                  <div className="space-y-6">
                    {/* 저장된 납품처 드롭다운 - 로그인한 업체만 표시 */}
                    {isCompanyLoggedIn === true && (
                      <div className="mb-6">
                        <Label htmlFor="saved_delivery_company">저장된 납품처</Label>
                        <select
                          id="saved_delivery_company"
                          value={selectedDeliveryCompanyId}
                          onChange={(e) => {
                            const id = e.target.value ? Number(e.target.value) : '';
                            setSelectedDeliveryCompanyId(id);
                            if (id) {
                              const company = savedDeliveryCompanies.find((c) => c.id === id);
                              if (company) {
                                setNewDeliveryCompany({
                                  name: company.name,
                                  phone: company.phone,
                                  address: company.address,
                                });
                              }
                            } else {
                              setNewDeliveryCompany({ name: '', phone: '', address: '' });
                            }
                          }}
                          className={getStyle('inputSelectTwoThirds')}
                        >
                          <option value="">
                            {savedDeliveryCompanies.length === 0
                              ? '아직 저장한 업체가 없습니다.'
                              : '납품처를 선택하세요'}
                          </option>
                          {savedDeliveryCompanies.map((company) => (
                            <option key={company.id} value={company.id}>
                              {company.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* 로그인하지 않은 경우 안내 메시지 */}
                    {isCompanyLoggedIn === false && (
                      <div className="my-6">
                        <InfoBox>
                          <p
                            className={`${isMobile ? 'text-[11px]' : 'text-xs'} ${TEXT_COLOR.primary}`}
                          >
                            <Link
                              href="/register"
                              className="underline !text-brand hover:!text-brand-hover transition-colors font-medium"
                            >
                              업체 등록
                            </Link>
                            을 하면 납품처를 저장하여 쉽게 작성하실수있습니다.
                          </p>
                        </InfoBox>
                      </div>
                    )}

                    {/* 납품업체 입력 폼 */}
                    <div className="space-y-6">
                      <div>
                        <Label htmlFor="delivery_company_name" required>
                          납품업체명
                        </Label>
                        <input
                          type="text"
                          id="delivery_company_name"
                          value={newDeliveryCompany.name}
                          onChange={(e) => {
                            setNewDeliveryCompany((prev) => ({ ...prev, name: e.target.value }));
                            if (fieldErrors.delivery_company_name) {
                              setFieldErrors((prev) => {
                                const newErrors = { ...prev };
                                delete newErrors.delivery_company_name;
                                return newErrors;
                              });
                            }
                          }}
                          className={`${getStyle('inputTwoThirds')} ${fieldErrors.delivery_company_name ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                          placeholder="납품업체명을 입력해주세요"
                          required
                        />
                        {fieldErrors.delivery_company_name && (
                          <p className={getStyle('errorText')}>
                            {fieldErrors.delivery_company_name}
                          </p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="delivery_company_phone" required>
                          연락처
                        </Label>
                        <input
                          type="tel"
                          id="delivery_company_phone"
                          value={newDeliveryCompany.phone}
                          onChange={(e) => {
                            setNewDeliveryCompany((prev) => ({ ...prev, phone: e.target.value }));
                            if (fieldErrors.delivery_company_phone) {
                              setFieldErrors((prev) => {
                                const newErrors = { ...prev };
                                delete newErrors.delivery_company_phone;
                                return newErrors;
                              });
                            }
                          }}
                          className={`${getStyle('inputTwoThirds')} ${fieldErrors.delivery_company_phone ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                          placeholder="010-1234-5678"
                          required
                        />
                        {fieldErrors.delivery_company_phone && (
                          <p className={getStyle('errorText')}>
                            {fieldErrors.delivery_company_phone}
                          </p>
                        )}
                      </div>

                      <div>
                        <Label htmlFor="delivery_company_address" required>
                          주소
                        </Label>
                        <input
                          type="text"
                          id="delivery_company_address"
                          value={newDeliveryCompany.address}
                          onChange={(e) => {
                            setNewDeliveryCompany((prev) => ({ ...prev, address: e.target.value }));
                            if (fieldErrors.delivery_company_address) {
                              setFieldErrors((prev) => {
                                const newErrors = { ...prev };
                                delete newErrors.delivery_company_address;
                                return newErrors;
                              });
                            }
                          }}
                          className={`${getStyle('inputTwoThirds')} ${fieldErrors.delivery_company_address ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                          placeholder="주소를 입력해주세요"
                          required
                        />
                        {fieldErrors.delivery_company_address && (
                          <p className={getStyle('errorText')}>
                            {fieldErrors.delivery_company_address}
                          </p>
                        )}
                      </div>

                      {/* 거래처 저장 버튼 - 로그인한 업체만 표시 */}
                      {isCompanyLoggedIn === true && (
                        <div className="pt-2">
                          <button
                            type="button"
                            onClick={async () => {
                              const newFieldErrors: Record<string, string> = {};
                              if (!newDeliveryCompany.name.trim()) {
                                newFieldErrors.delivery_company_name = '납품업체명을 입력해주세요.';
                              }
                              if (!newDeliveryCompany.phone.trim()) {
                                newFieldErrors.delivery_company_phone =
                                  '납품업체 연락처를 입력해주세요.';
                              }
                              if (!newDeliveryCompany.address.trim()) {
                                newFieldErrors.delivery_company_address =
                                  '납품업체 주소를 입력해주세요.';
                              }

                              if (Object.keys(newFieldErrors).length > 0) {
                                setFieldErrors((prev) => ({ ...prev, ...newFieldErrors }));
                                setTimeout(() => {
                                  const firstErrorKey = Object.keys(newFieldErrors)[0];
                                  const errorField = document.getElementById(firstErrorKey);
                                  if (errorField) {
                                    errorField.scrollIntoView({
                                      behavior: 'smooth',
                                      block: 'center',
                                    });
                                    setTimeout(() => errorField.focus(), 300);
                                  }
                                }, 100);
                                return;
                              }

                              setIsSavingCompany(true);
                              try {
                                const response = await fetch('/api/company/delivery-companies', {
                                  method: 'POST',
                                  headers: {
                                    'Content-Type': 'application/json',
                                  },
                                  body: JSON.stringify(newDeliveryCompany),
                                });

                                const result = await response.json();

                                if (result.success) {
                                  setSavedDeliveryCompanies((prev) => [
                                    result.deliveryCompany,
                                    ...prev,
                                  ]);
                                  setSelectedDeliveryCompanyId(result.deliveryCompany.id);
                                  // 폼 데이터 유지 (초기화하지 않음)
                                  // 성공 메시지는 표시하지 않음 (사용자 요청에 따라)
                                } else {
                                  setFieldErrors((prev) => ({
                                    ...prev,
                                    delivery_company_save:
                                      result.error || '거래처 저장에 실패했습니다.',
                                  }));
                                }
                              } catch (error) {
                                log.error('Error saving company', error);
                                setFieldErrors((prev) => ({
                                  ...prev,
                                  delivery_company_save: '거래처 저장 중 오류가 발생했습니다.',
                                }));
                              } finally {
                                setIsSavingCompany(false);
                              }
                            }}
                            disabled={isSavingCompany}
                            className={`${getStyle('buttonSecondary')} ${isSavingCompany ? 'opacity-50 cursor-not-allowed' : ''}`}
                          >
                            {isSavingCompany ? '저장 중...' : '거래처 저장'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 네비게이션 버튼 */}
                <div className="flex justify-between pt-4">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className={getStyle('buttonSecondary')}
                  >
                    이전
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (deliveryMethod === 'delivery_company') {
                        if (
                          !newDeliveryCompany.name?.trim() ||
                          !newDeliveryCompany.phone?.trim() ||
                          !newDeliveryCompany.address?.trim()
                        ) {
                          const newFieldErrors: Record<string, string> = {};
                          if (!newDeliveryCompany.name.trim()) {
                            newFieldErrors.delivery_company_name = '납품업체명을 입력해주세요.';
                          }
                          if (!newDeliveryCompany.phone.trim()) {
                            newFieldErrors.delivery_company_phone =
                              '납품업체 연락처를 입력해주세요.';
                          }
                          if (!newDeliveryCompany.address.trim()) {
                            newFieldErrors.delivery_company_address =
                              '납품업체 주소를 입력해주세요.';
                          }
                          if (Object.keys(newFieldErrors).length > 0) {
                            setFieldErrors((prev) => ({ ...prev, ...newFieldErrors }));
                            setTimeout(() => {
                              const firstErrorKey = Object.keys(newFieldErrors)[0];
                              const errorField = document.getElementById(firstErrorKey);
                              if (errorField) {
                                errorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                setTimeout(() => errorField.focus(), 300);
                              }
                            }, 100);
                            return;
                          }
                        }
                      }
                      setCurrentStep(4);
                      // 화면 상단으로 스크롤
                      setTimeout(() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }, 100);
                    }}
                    className={getStyle('button')}
                  >
                    다음 단계
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className={`${getStyle('sectionTitle')} ${TEXT_COLOR.primary}`}>일정 조율</h2>

                {/* 샘플 완료후 수령방법 선택 */}
                <div>
                  <Label required mb="lg">
                    샘플 완료후 수령방법 선택
                  </Label>
                  {fieldErrors.receiptMethod && (
                    <p className="mb-2 text-xs text-red-500">{fieldErrors.receiptMethod}</p>
                  )}

                  {/* 안내사항 */}
                  <InfoBox label="안내사항" className="mb-4" labelInside={true}>
                    <div className="space-y-2">
                      <p
                        className={`${isMobile ? 'text-[11px]' : 'text-xs'} ${TEXT_COLOR.primary}`}
                      >
                        • 샘플제작은 대략 1~2일 정도 소요되며, 고객사에 따라 도면의 유무, 당사
                        일정관계상 더 소요될수있습니다.
                      </p>
                      <p
                        className={`${isMobile ? 'text-[11px]' : 'text-xs'} ${TEXT_COLOR.primary}`}
                      >
                        • 즉시 수정 피드백을 원하시면 방문수령을, 그렇지않으시면 택배 및 퀵으로
                        수령하시면 원할한 진행이 되십니다.
                      </p>
                    </div>
                  </InfoBox>

                  <div className="space-y-4">
                    {/* 방문 수령 */}
                    <div
                      className={`overflow-hidden transition-all duration-300 ${
                        receiptMethod === 'visit'
                          ? `border ${BORDER_COLOR.orangeAlpha} rounded-lg`
                          : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setReceiptMethod(receiptMethod === 'visit' ? '' : 'visit');
                          if (fieldErrors.receiptMethod) {
                            setFieldErrors((prev) => {
                              const newErrors = { ...prev };
                              delete newErrors.receiptMethod;
                              return newErrors;
                            });
                          }
                        }}
                        className={`w-full flex items-center justify-between ${isMobile ? 'px-2 py-2' : 'px-4 py-3'} transition-all duration-300 focus:outline-none ${
                          receiptMethod === 'visit'
                            ? `${BG_COLOR.orange} border-b ${BORDER_COLOR.orange}/50`
                            : `${BG_COLOR.whiteDark} border ${BORDER_COLOR.dark} rounded-lg ${BG_COLOR.hoverLighterDark}`
                        }`}
                      >
                        <div className="flex items-center">
                          <div
                            className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} rounded border-2 flex items-center justify-center ${isMobile ? 'mr-2' : 'mr-3'} transition-colors ${
                              receiptMethod === 'visit'
                                ? 'bg-brand border-brand'
                                : '${BG_COLOR.white} ${BORDER_COLOR.stronger}'
                            }`}
                          >
                            {receiptMethod === 'visit' && (
                              <svg
                                className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-white`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                          <span
                            className={`${isMobile ? 'text-[12px]' : 'text-sm'} font-medium ${TEXT_COLOR.primary}`}
                          >
                            방문 수령
                          </span>
                        </div>
                        <svg
                          className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} ${TEXT_COLOR.primary} transition-transform duration-200 ${
                            receiptMethod === 'visit' ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>

                      {receiptMethod === 'visit' && (
                        <div
                          className={`space-y-4 ${isMobile ? 'p-2' : 'p-4'} ${BG_COLOR.orangeAlpha} transition-all duration-300`}
                        >
                          <InfoBox label="회사위치">
                            <p
                              className={`${isMobile ? 'text-[12px]' : 'text-sm'} font-medium mb-1`}
                            >
                              서울 중구 퇴계로39길 20, 2층 유진레이져목형 사무실
                            </p>
                            <p
                              className={`${isMobile ? 'text-[11px]' : 'text-xs'} ${TEXT_COLOR.tertiary}`}
                            >
                              (평일 9:00 ~ 19:00 주말 및 공휴일 휴무)
                            </p>
                          </InfoBox>

                          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            {/* 날짜 선택 - 왼쪽 */}
                            <div>
                              <Label htmlFor="visit_date" required>
                                날짜 선택
                              </Label>
                              <input
                                type="date"
                                id="visit_date"
                                name="visit_date"
                                value={visitDate}
                                className={`${getStyle('inputTwoThirds')} ${fieldErrors.visitDate ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                                onChange={(e) => {
                                  const selectedDate = new Date(e.target.value);
                                  const dayOfWeek = selectedDate.getDay(); // 0 = 일요일, 6 = 토요일

                                  // 주말 체크 (토요일=6, 일요일=0)
                                  if (dayOfWeek === 0 || dayOfWeek === 6) {
                                    setFieldErrors((prev) => ({
                                      ...prev,
                                      visitDate: '평일만 선택 가능합니다. (주말 제외)',
                                    }));
                                    setVisitDate('');
                                    setVisitTimeSlot('');
                                    return;
                                  }

                                  // 평일 범위 체크
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);

                                  // 오늘 +2일 계산 (시작 날짜)
                                  const startDate = new Date(today);
                                  startDate.setDate(startDate.getDate() + 2);

                                  // +2일이 주말이면 가장 가까운 평일로 이동
                                  while (startDate.getDay() === 0 || startDate.getDay() === 6) {
                                    startDate.setDate(startDate.getDate() + 1);
                                  }

                                  // 평일 10일 범위 계산 (주말 제외)
                                  const endDate = new Date(startDate);
                                  let weekdaysCount = 0;
                                  while (weekdaysCount < 9) {
                                    // 10일이므로 9일 더 추가
                                    endDate.setDate(endDate.getDate() + 1);
                                    if (endDate.getDay() >= 1 && endDate.getDay() <= 5) {
                                      weekdaysCount++;
                                    }
                                  }

                                  // 선택한 날짜가 범위 내에 있는지 확인
                                  if (selectedDate < startDate || selectedDate > endDate) {
                                    setFieldErrors((prev) => ({
                                      ...prev,
                                      visitDate: '선택 가능한 평일 범위를 벗어났습니다.',
                                    }));
                                    setVisitDate('');
                                    setVisitTimeSlot('');
                                    return;
                                  }

                                  const selectedDateValue = e.target.value;
                                  setVisitDate(selectedDateValue);
                                  setVisitTimeSlot(''); // 날짜 변경 시 시간 슬롯 초기화
                                  if (fieldErrors.visitDate) {
                                    setFieldErrors((prev) => {
                                      const newErrors = { ...prev };
                                      delete newErrors.visitDate;
                                      return newErrors;
                                    });
                                  }

                                  // 날짜 변경 시 예약 가능 여부 확인
                                  if (selectedDateValue) {
                                    checkBookingAvailability(selectedDateValue);
                                  }
                                }}
                                min={getMinVisitDate()}
                                max={(() => {
                                  const today = new Date();
                                  today.setHours(0, 0, 0, 0);

                                  // 오늘 +2일 계산 (시작 날짜)
                                  const startDate = new Date(today);
                                  startDate.setDate(startDate.getDate() + 2);

                                  // +2일이 주말이면 가장 가까운 평일로 이동
                                  while (startDate.getDay() === 0 || startDate.getDay() === 6) {
                                    startDate.setDate(startDate.getDate() + 1);
                                  }

                                  // 평일 10일 범위 계산 (주말 제외)
                                  const endDate = new Date(startDate);
                                  let weekdaysCount = 0;
                                  while (weekdaysCount < 9) {
                                    // 10일이므로 9일 더 추가
                                    endDate.setDate(endDate.getDate() + 1);
                                    if (endDate.getDay() >= 1 && endDate.getDay() <= 5) {
                                      weekdaysCount++;
                                    }
                                  }

                                  // ISO 문자열로 변환 (로컬 시간대 고려)
                                  const year = endDate.getFullYear();
                                  const month = String(endDate.getMonth() + 1).padStart(2, '0');
                                  const day = String(endDate.getDate()).padStart(2, '0');
                                  return `${year}-${month}-${day}`;
                                })()}
                                required
                              />
                              {fieldErrors.visitDate && (
                                <p className={getStyle('errorText')}>{fieldErrors.visitDate}</p>
                              )}
                            </div>

                            {/* 시간 슬롯 선택 - 오른쪽, 세로 배치 */}
                            {visitDate && (
                              <div>
                                <Label required mb="lg">
                                  시간 선택
                                </Label>
                                {fieldErrors.visitTimeSlot && (
                                  <p className="mb-2 text-xs text-red-500">
                                    {fieldErrors.visitTimeSlot}
                                  </p>
                                )}
                                <BookingSlotList
                                  availability={bookingAvailability}
                                  selected={visitTimeSlot}
                                  loading={bookingLoading}
                                  onSelect={(timeSlot) => {
                                    setVisitTimeSlot(timeSlot);
                                    if (fieldErrors.visitTimeSlot) {
                                      setFieldErrors((prev) => {
                                        const newErrors = { ...prev };
                                        delete newErrors.visitTimeSlot;
                                        return newErrors;
                                      });
                                    }
                                  }}
                                />
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 택배 및 퀵으로 수령 */}
                    <div
                      className={`overflow-hidden transition-all duration-300 ${
                        receiptMethod === 'delivery'
                          ? `border ${BORDER_COLOR.orangeAlpha} rounded-lg`
                          : ''
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setReceiptMethod(receiptMethod === 'delivery' ? '' : 'delivery');
                          if (fieldErrors.receiptMethod) {
                            setFieldErrors((prev) => {
                              const newErrors = { ...prev };
                              delete newErrors.receiptMethod;
                              return newErrors;
                            });
                          }
                        }}
                        className={`w-full flex items-center justify-between ${isMobile ? 'px-2 py-2' : 'px-4 py-3'} transition-all duration-300 focus:outline-none ${
                          receiptMethod === 'delivery'
                            ? `${BG_COLOR.orange} border-b ${BORDER_COLOR.orange}/50`
                            : `${BG_COLOR.whiteDark} border ${BORDER_COLOR.dark} rounded-lg ${BG_COLOR.hoverLighterDark}`
                        }`}
                      >
                        <div className="flex items-center">
                          <div
                            className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} rounded border-2 flex items-center justify-center ${isMobile ? 'mr-2' : 'mr-3'} transition-colors ${
                              receiptMethod === 'delivery'
                                ? 'bg-brand border-brand'
                                : '${BG_COLOR.white} ${BORDER_COLOR.stronger}'
                            }`}
                          >
                            {receiptMethod === 'delivery' && (
                              <svg
                                className={`${isMobile ? 'w-2.5 h-2.5' : 'w-3 h-3'} text-white`}
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                              >
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={3}
                                  d="M5 13l4 4L19 7"
                                />
                              </svg>
                            )}
                          </div>
                          <span
                            className={`${isMobile ? 'text-[12px]' : 'text-sm'} font-medium ${TEXT_COLOR.primary}`}
                          >
                            택배 및 퀵으로 수령
                          </span>
                        </div>
                        <svg
                          className={`${isMobile ? 'w-4 h-4' : 'w-5 h-5'} ${TEXT_COLOR.primary} transition-transform duration-200 ${
                            receiptMethod === 'delivery' ? 'rotate-180' : ''
                          }`}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M19 9l-7 7-7-7"
                          />
                        </svg>
                      </button>

                      {receiptMethod === 'delivery' && (
                        <div
                          className={`space-y-4 ${isMobile ? 'p-2' : 'p-4'} ${BG_COLOR.orangeAlpha} transition-all duration-300`}
                        >
                          <div>
                            <Label required mb="lg">
                              배송 방법
                            </Label>
                            <div className="flex gap-3 sm:gap-6">
                              <RadioButton
                                name="delivery_type"
                                value="parcel"
                                checked={deliveryType === 'parcel'}
                                onChange={(e) => {
                                  setDeliveryType(e.target.value as 'parcel' | 'quick');
                                  if (fieldErrors.deliveryType) {
                                    setFieldErrors((prev) => {
                                      const newErrors = { ...prev };
                                      delete newErrors.deliveryType;
                                      return newErrors;
                                    });
                                  }
                                }}
                                label="택배"
                                underlineKey="delivery-type-parcel"
                                size={isMobile ? 'sm' : 'md'}
                              />
                              <RadioButton
                                name="delivery_type"
                                value="quick"
                                checked={deliveryType === 'quick'}
                                onChange={(e) => {
                                  setDeliveryType(e.target.value as 'parcel' | 'quick');
                                  if (fieldErrors.deliveryType) {
                                    setFieldErrors((prev) => {
                                      const newErrors = { ...prev };
                                      delete newErrors.deliveryType;
                                      return newErrors;
                                    });
                                  }
                                }}
                                label="퀵"
                                underlineKey="delivery-type-quick"
                                size={isMobile ? 'sm' : 'md'}
                              />
                            </div>
                            {fieldErrors.deliveryType && (
                              <p className="mt-2 text-xs text-red-500">
                                {fieldErrors.deliveryType}
                              </p>
                            )}
                          </div>

                          <div>
                            <Label htmlFor="delivery_address" required>
                              택배 받을 주소
                            </Label>
                            <input
                              type="text"
                              id="delivery_address"
                              name="delivery_address"
                              value={deliveryAddress}
                              onChange={(e) => {
                                setDeliveryAddress(e.target.value);
                                if (fieldErrors.deliveryAddress) {
                                  setFieldErrors((prev) => {
                                    const newErrors = { ...prev };
                                    delete newErrors.deliveryAddress;
                                    return newErrors;
                                  });
                                }
                              }}
                              className={`${getStyle('inputTwoThirds')} ${fieldErrors.deliveryAddress ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                              placeholder="택배 받을 주소를 입력해주세요"
                              required
                            />
                            {fieldErrors.deliveryAddress && (
                              <p className={getStyle('errorText')}>{fieldErrors.deliveryAddress}</p>
                            )}
                          </div>

                          <div>
                            <Label htmlFor="delivery_name" required>
                              이름
                            </Label>
                            <input
                              type="text"
                              id="delivery_name"
                              name="delivery_name"
                              value={deliveryName}
                              onChange={(e) => {
                                setDeliveryName(e.target.value);
                                if (fieldErrors.deliveryName) {
                                  setFieldErrors((prev) => {
                                    const newErrors = { ...prev };
                                    delete newErrors.deliveryName;
                                    return newErrors;
                                  });
                                }
                              }}
                              className={`${getStyle('inputTwoThirds')} ${fieldErrors.deliveryName ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                              placeholder="이름을 입력해주세요"
                              required
                            />
                            {fieldErrors.deliveryName && (
                              <p className={getStyle('errorText')}>{fieldErrors.deliveryName}</p>
                            )}
                          </div>

                          <div>
                            <Label htmlFor="delivery_phone" required>
                              연락처
                            </Label>
                            <input
                              type="tel"
                              id="delivery_phone"
                              name="delivery_phone"
                              value={deliveryPhone}
                              onChange={(e) => {
                                setDeliveryPhone(e.target.value);
                                if (fieldErrors.deliveryPhone) {
                                  setFieldErrors((prev) => {
                                    const newErrors = { ...prev };
                                    delete newErrors.deliveryPhone;
                                    return newErrors;
                                  });
                                }
                              }}
                              className={`${getStyle('inputTwoThirds')} ${fieldErrors.deliveryPhone ? 'border-red-500 focus:border-red-500 focus:ring-red-500' : ''}`}
                              placeholder="010-1234-5678"
                              required
                            />
                            {fieldErrors.deliveryPhone && (
                              <p className={getStyle('errorText')}>{fieldErrors.deliveryPhone}</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* 네비게이션 버튼 */}
                <div className="flex justify-between pt-4">
                  <button
                    type="button"
                    onClick={() => setCurrentStep(2)}
                    className={getStyle('buttonSecondary')}
                  >
                    이전
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const newFieldErrors: Record<string, string> = {};
                      // 납품업체 검증 (이미 drawingType === 'have' 컨텍스트 안에 있음)
                      if (deliveryMethod === 'delivery_company') {
                        if (!newDeliveryCompany.name?.trim()) {
                          newFieldErrors.delivery_company_name = '납품업체명을 입력해주세요.';
                        }
                        if (!newDeliveryCompany.phone?.trim()) {
                          newFieldErrors.delivery_company_phone = '납품업체 연락처를 입력해주세요.';
                        }
                        if (!newDeliveryCompany.address?.trim()) {
                          newFieldErrors.delivery_company_address = '납품업체 주소를 입력해주세요.';
                        }
                      }
                      // deliveryMethod === 'company_address'인 경우는 검증 불필요

                      if (Object.keys(newFieldErrors).length > 0) {
                        setFieldErrors((prev) => ({ ...prev, ...newFieldErrors }));
                        setTimeout(() => {
                          const firstErrorKey = Object.keys(newFieldErrors)[0];
                          let targetElement: HTMLElement | null = null;

                          // 특정 필드에 대한 포커싱 처리
                          if (firstErrorKey === 'receiptMethod') {
                            // 라디오 버튼 그룹 찾기
                            const radioButtons = document.querySelectorAll(
                              'input[name="receipt_method"]'
                            );
                            if (radioButtons.length > 0) {
                              targetElement = radioButtons[0] as HTMLElement;
                            }
                          } else if (firstErrorKey === 'visitDate') {
                            targetElement = document.getElementById('visit_date') as HTMLElement;
                          } else if (firstErrorKey === 'visitTimeSlot') {
                            // 시간 슬롯 버튼 중 첫 번째 찾기
                            const timeSlotButtons =
                              document.querySelectorAll('button[type="button"]');
                            const timeSlotButton = Array.from(timeSlotButtons).find(
                              (btn) =>
                                btn.textContent?.includes('시간 선택') ||
                                btn.textContent?.match(/\d{1,2}:\d{2}~\d{1,2}:\d{2}/)
                            );
                            if (timeSlotButton) {
                              targetElement = timeSlotButton as HTMLElement;
                            }
                          } else if (firstErrorKey === 'deliveryType') {
                            // 라디오 버튼 그룹 찾기
                            const radioButtons = document.querySelectorAll(
                              'input[name="delivery_type"]'
                            );
                            if (radioButtons.length > 0) {
                              targetElement = radioButtons[0] as HTMLElement;
                            }
                          } else {
                            targetElement =
                              document.getElementById(firstErrorKey) ||
                              (document.querySelector(`[name="${firstErrorKey}"]`) as HTMLElement);
                          }

                          if (targetElement) {
                            targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            setTimeout(() => {
                              if (targetElement) {
                                targetElement.focus();
                              }
                            }, 300);
                          } else {
                            // 찾을 수 없으면 섹션 헤더로 스크롤
                            const sectionHeaders = Array.from(document.querySelectorAll('h2'));
                            const sectionHeader = sectionHeaders.find(
                              (h) =>
                                h.textContent?.includes('일정 조율') ||
                                h.textContent?.includes('납품업체')
                            );
                            if (sectionHeader) {
                              sectionHeader.scrollIntoView({ behavior: 'smooth', block: 'start' });
                            }
                          }
                        }, 100);
                        return;
                      }

                      setFieldErrors({});
                      setCurrentStep(4);
                      // 화면 상단으로 스크롤
                      setTimeout(() => {
                        window.scrollTo({ top: 0, behavior: 'smooth' });
                      }, 100);
                    }}
                    className={getStyle('button')}
                  >
                    다음 단계
                  </button>
                </div>
              </>
            )}
          </ContactVisitBookingSection>

          {/* 네 번째 섹션: 내용 확인 */}
          <ContactEstimateMethodSection active={currentStep === 4} className="space-y-6">
            <h2 className={`${getStyle('sectionTitle')} ${TEXT_COLOR.primary}`}>내용 확인</h2>
            <p className={`${TEXT_COLOR.tertiary} mb-6`}>
              입력하신 내용을 확인해주세요. 수정이 필요하시면 해당 섹션의 수정 버튼을 클릭해주세요.
            </p>

            {/* 참고 제품 정보 (포트폴리오에서 문의한 경우) */}
            {portfolioProduct && (
              <div
                className={`${BG_COLOR.orange} border ${BORDER_COLOR.orange} rounded-lg ${getStyle('sectionPadding')} transition-colors duration-300`}
              >
                <h3 className={`text-sm font-semibold ${TEXT_COLOR.orange} mb-4`}>참고 제품</h3>
                <div className="flex gap-4">
                  {portfolioProduct.imageUrl && (
                    <div className="flex-shrink-0">
                      <img
                        src={portfolioProduct.imageUrl}
                        alt={portfolioProduct.title}
                        className="w-20 h-20 object-cover rounded-lg"
                      />
                    </div>
                  )}
                  <div className="flex-1 space-y-1 text-sm">
                    {portfolioProduct.field && (
                      <span
                        className={`inline-block px-2 py-0.5 ${BG_COLOR.orangeMedium}/40 ${TEXT_COLOR.orange} rounded text-xs`}
                      >
                        {portfolioProduct.field}
                      </span>
                    )}
                    <p className={`font-medium ${TEXT_COLOR.primary}`}>{portfolioProduct.title}</p>
                    <div className={`${TEXT_COLOR.tertiary} space-y-0.5`}>
                      {portfolioProduct.format && (
                        <p>
                          <span className="text-gray-500">형태:</span> {portfolioProduct.format}
                        </p>
                      )}
                      {portfolioProduct.size && (
                        <p>
                          <span className="text-gray-500">크기:</span> {portfolioProduct.size}
                        </p>
                      )}
                      {portfolioProduct.paper && (
                        <p>
                          <span className="text-gray-500">용지:</span> {portfolioProduct.paper}
                        </p>
                      )}
                      {portfolioProduct.finishing && (
                        <p>
                          <span className="text-gray-500">후가공:</span>{' '}
                          {portfolioProduct.finishing}
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 1: 연락처 정보 */}
            <div
              className={`${BG_COLOR.white} border ${BORDER_COLOR.default} rounded-lg ${getStyle('sectionPadding')} transition-colors duration-300`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>1. 연락처 정보</h3>
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className={`text-sm ${TEXT_COLOR.orange} ${TEXT_COLOR.hoverOrangeMid} font-medium underline focus:outline-none`}
                >
                  수정
                </button>
              </div>
              <div className={`space-y-2 text-sm ${TEXT_COLOR.secondary}`}>
                <div>
                  <span className={`font-medium ${TEXT_COLOR.tertiary}`}>패키지명:</span>
                  <span className="ml-2">{inquiryTitle || '-'}</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className={`font-medium ${TEXT_COLOR.tertiary}`}>문의 유형:</span>
                    <span className="ml-2">{contactType === 'company' ? '업체' : '개인'}</span>
                  </div>
                  {contactType === 'individual' && (
                    <div>
                      <span className={`font-medium ${TEXT_COLOR.tertiary}`}>서비스 유형:</span>
                      <span className="ml-2">
                        {serviceType === 'moldRequest'
                          ? '목형 만 제작 의뢰합니다.'
                          : serviceType === 'deliveryBrokerage'
                            ? '목형제작 및 납품까지 중개 를 원합니다.'
                            : '없음'}
                      </span>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className={`font-medium ${TEXT_COLOR.tertiary}`}>
                      {contactType === 'company' ? '업체명' : '이름'}:
                    </span>
                    <span className="ml-2">{companyName || '-'}</span>
                  </div>
                  {contactType === 'company' && (
                    <>
                      <div>
                        <span className={`font-medium ${TEXT_COLOR.tertiary}`}>담당자명:</span>
                        <span className="ml-2">{name || '-'}</span>
                      </div>
                      <div>
                        <span className={`font-medium ${TEXT_COLOR.tertiary}`}>직책:</span>
                        <span className="ml-2">{position || '-'}</span>
                      </div>
                    </>
                  )}
                  <div>
                    <span className={`font-medium ${TEXT_COLOR.tertiary}`}>연락처:</span>
                    <span className="ml-2">{phone || '-'}</span>
                  </div>
                  <div>
                    <span className={`font-medium ${TEXT_COLOR.tertiary}`}>이메일:</span>
                    <span className="ml-2">{email || '-'}</span>
                  </div>
                  <div>
                    <span className={`font-medium ${TEXT_COLOR.tertiary}`}>유입경로:</span>
                    <span className="ml-2">
                      {referralSource === '기타' || referralSource === '거래처 소개'
                        ? referralSourceOther
                        : referralSource || '-'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Step 2: 도면 및 샘플 */}
            <div
              className={`${BG_COLOR.white} border ${BORDER_COLOR.default} rounded-lg ${getStyle('sectionPadding')} transition-colors duration-300`}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>2. 도면 및 샘플</h3>
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className={`text-sm ${TEXT_COLOR.orange} ${TEXT_COLOR.hoverOrangeMid} font-medium underline focus:outline-none`}
                >
                  수정
                </button>
              </div>
              <div className={`space-y-2 text-sm ${TEXT_COLOR.secondary}`}>
                {drawingType ? (
                  <>
                    <div>
                      <span className={`font-medium ${TEXT_COLOR.tertiary}`}>도면 상태:</span>
                      <span className="ml-2">
                        {drawingType === 'create'
                          ? '도면 제작이 필요합니다'
                          : '도면을 가지고 있습니다'}
                      </span>
                    </div>

                    {drawingType === 'create' && (
                      <div className={`mt-3 space-y-2 pl-4 border-l-2 ${BORDER_COLOR.orange}`}>
                        <div>
                          <span className={`font-medium ${TEXT_COLOR.tertiary}`}>실물 샘플:</span>
                          <span className="ml-2">{hasPhysicalSample ? '있음' : '없음'}</span>
                        </div>
                        {hasPhysicalSample && (
                          <div className="mt-2">
                            <span className={`font-medium ${TEXT_COLOR.tertiary}`}>
                              샘플 특이사항:
                            </span>
                            <p className={`mt-1 ${TEXT_COLOR.secondary} whitespace-pre-wrap`}>
                              {sampleNotes || '-'}
                            </p>
                          </div>
                        )}
                        <div>
                          <span className={`font-medium ${TEXT_COLOR.tertiary}`}>제작 자료:</span>
                          <span className="ml-2">{hasReferencePhotos ? '있음' : '없음'}</span>
                        </div>
                      </div>
                    )}

                    {drawingType === 'have' && (
                      <div className={`mt-3 space-y-2 pl-4 border-l-2 ${BORDER_COLOR.orange}`}>
                        <div>
                          <span className={`font-medium ${TEXT_COLOR.tertiary}`}>도면 수정:</span>
                          <span className="ml-2">
                            {drawingModification === 'needed'
                              ? '도면의 수정이 필요합니다'
                              : drawingModification === 'not_needed'
                                ? '도면의 수정이 필요없습니다'
                                : '-'}
                          </span>
                        </div>
                        <div>
                          <span className={`font-medium ${TEXT_COLOR.tertiary}`}>도면 파일:</span>
                          <span className="ml-2" id="review_drawing_files">
                            파일 업로드 필요
                          </span>
                        </div>
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <span className={`font-medium ${TEXT_COLOR.tertiary}`}>박스 형태:</span>
                        <span className="ml-2">{boxShape || '-'}</span>
                      </div>
                      <div>
                        <span className={`font-medium ${TEXT_COLOR.tertiary}`}>재질:</span>
                        <span className="ml-2">{material || '-'}</span>
                      </div>
                      <div className="md:col-span-2">
                        <span className={`font-medium ${TEXT_COLOR.tertiary}`}>
                          크기 (장×폭×고):
                        </span>
                        <span className="ml-2">
                          {length || '-'} mm × {width || '-'} mm × {height || '-'} mm
                        </span>
                      </div>
                      <div className="md:col-span-2">
                        <span className={`font-medium ${TEXT_COLOR.tertiary}`}>
                          도면 및 샘플 제작 시 유의사항:
                        </span>
                        <p className={`mt-1 ${TEXT_COLOR.secondary} whitespace-pre-wrap`}>
                          {drawingNotes || '-'}
                        </p>
                      </div>
                    </div>
                  </>
                ) : (
                  <p className={TEXT_COLOR.subtle}>입력된 정보가 없습니다.</p>
                )}
              </div>
            </div>

            {/* Step 3: 일정 조율 또는 납품업체 */}
            {drawingType === 'have' ? (
              <div
                className={`${BG_COLOR.white} border ${BORDER_COLOR.default} rounded-lg ${getStyle('sectionPadding')} transition-colors duration-300`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>3. 납품업체</h3>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className={`text-sm ${TEXT_COLOR.orange} ${TEXT_COLOR.hoverOrangeMid} font-medium underline focus:outline-none`}
                  >
                    수정
                  </button>
                </div>
                <div className={`space-y-2 text-sm ${TEXT_COLOR.secondary}`}>
                  {deliveryMethod === 'company_address' ? (
                    <div>
                      <span className={`font-medium ${TEXT_COLOR.tertiary}`}>납품 방법:</span>
                      <span className="ml-2">회사주소로 납품</span>
                    </div>
                  ) : (
                    <>
                      <div>
                        <span className={`font-medium ${TEXT_COLOR.tertiary}`}>납품업체명:</span>
                        <span className="ml-2">{newDeliveryCompany.name || '-'}</span>
                      </div>
                      <div>
                        <span className={`font-medium ${TEXT_COLOR.tertiary}`}>연락처:</span>
                        <span className="ml-2">{newDeliveryCompany.phone || '-'}</span>
                      </div>
                      <div>
                        <span className={`font-medium ${TEXT_COLOR.tertiary}`}>주소:</span>
                        <span className="ml-2">{newDeliveryCompany.address || '-'}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : (
              <div
                className={`${BG_COLOR.white} border ${BORDER_COLOR.default} rounded-lg ${getStyle('sectionPadding')} transition-colors duration-300`}
              >
                <div className="flex items-center justify-between mb-4">
                  <h3 className={`text-sm font-semibold ${TEXT_COLOR.primary}`}>3. 일정 조율</h3>
                  <button
                    type="button"
                    onClick={() => setCurrentStep(3)}
                    className={`text-sm ${TEXT_COLOR.orange} ${TEXT_COLOR.hoverOrangeMid} font-medium underline focus:outline-none`}
                  >
                    수정
                  </button>
                </div>
                <div className={`space-y-2 text-sm ${TEXT_COLOR.secondary}`}>
                  {receiptMethod ? (
                    <>
                      <div>
                        <span className={`font-medium ${TEXT_COLOR.tertiary}`}>수령 방법:</span>
                        <span className="ml-2">
                          {receiptMethod === 'visit' ? '방문 수령' : '택배 및 퀵으로 수령'}
                        </span>
                      </div>

                      {receiptMethod === 'visit' && (
                        <div className={`mt-3 space-y-2 pl-4 border-l-2 ${BORDER_COLOR.orange}`}>
                          <div>
                            <span className={`font-medium ${TEXT_COLOR.tertiary}`}>회사위치:</span>
                            <p className={`mt-1 ${TEXT_COLOR.secondary}`}>
                              서울 중구 퇴계로39길 20, 2층 유진레이져목형 사무실
                            </p>
                            <p className={`text-xs ${TEXT_COLOR.subtle}`}>
                              (평일 9:00 ~ 19:00 주말 및 공휴일 휴무)
                            </p>
                          </div>
                          <div>
                            <span className={`font-medium ${TEXT_COLOR.tertiary}`}>방문 날짜:</span>
                            <span className="ml-2">{visitDate || '-'}</span>
                          </div>
                          <div>
                            <span className={`font-medium ${TEXT_COLOR.tertiary}`}>방문 시간:</span>
                            <span className="ml-2">{visitTimeSlot || '-'}</span>
                          </div>
                        </div>
                      )}

                      {receiptMethod === 'delivery' && (
                        <div className={`mt-3 space-y-2 pl-4 border-l-2 ${BORDER_COLOR.orange}`}>
                          <div>
                            <span className={`font-medium ${TEXT_COLOR.tertiary}`}>배송 방법:</span>
                            <span className="ml-2">
                              {deliveryType === 'parcel'
                                ? '택배'
                                : deliveryType === 'quick'
                                  ? '퀵'
                                  : '-'}
                            </span>
                          </div>
                          <div>
                            <span className={`font-medium ${TEXT_COLOR.tertiary}`}>배송 주소:</span>
                            <span className="ml-2">{deliveryAddress || '-'}</span>
                          </div>
                          <div>
                            <span className={`font-medium ${TEXT_COLOR.tertiary}`}>수령인:</span>
                            <span className="ml-2">{deliveryName || '-'}</span>
                          </div>
                          <div>
                            <span className={`font-medium ${TEXT_COLOR.tertiary}`}>연락처:</span>
                            <span className="ml-2">{deliveryPhone || '-'}</span>
                          </div>
                        </div>
                      )}
                    </>
                  ) : (
                    <p className={TEXT_COLOR.subtle}>입력된 정보가 없습니다.</p>
                  )}
                </div>
              </div>
            )}

            {/* 네비게이션 버튼 */}
            <div className="flex justify-between pt-4">
              <button
                type="button"
                onClick={() => {
                  // 모두 준비되었을 경우 Step 2로, 아니면 Step 3으로 이동
                  if (drawingType === 'have') {
                    setCurrentStep(2);
                  } else {
                    setCurrentStep(3);
                  }
                }}
                className={getStyle('buttonSecondary')}
              >
                이전
              </button>
              <ContactSubmitButton
                isSubmitting={isSubmitting}
                onClick={async (e) => {
                  e.preventDefault();
                  if (isSubmitting) return;

                  log.debug('Submit button clicked');
                  const form = e.currentTarget.closest('form') as HTMLFormElement;
                  if (!form) {
                    log.error('Form element not found');
                    return;
                  }
                  log.debug('Form element found');

                  // 전체 필드 검증
                  let firstErrorField: HTMLElement | null = null;
                  let errorStep = 1;
                  let errorMessage = '';

                  // Step 1: 연락처 정보 검증
                  const companyNameInput = form.querySelector(
                    'input[name="company_name"]'
                  ) as HTMLInputElement;
                  const nameInput = form.querySelector('input[name="name"]') as HTMLInputElement;
                  const positionInput = form.querySelector(
                    'input[name="position"]'
                  ) as HTMLInputElement;
                  const phoneInput = form.querySelector('input[name="phone"]') as HTMLInputElement;
                  const emailInput = form.querySelector('input[name="email"]') as HTMLInputElement;

                  if (!companyNameInput?.value?.trim()) {
                    errorMessage = '업체명(또는 이름)을 입력해주세요.';
                    firstErrorField = companyNameInput;
                    errorStep = 1;
                  } else if (
                    contactType === 'company' &&
                    (!nameInput?.value?.trim() || !positionInput?.value?.trim())
                  ) {
                    errorMessage = '담당자명과 직책을 입력해주세요.';
                    firstErrorField = nameInput?.value?.trim() ? positionInput : nameInput;
                    errorStep = 1;
                  } else if (!phoneInput?.value?.trim()) {
                    errorMessage = '연락처를 입력해주세요.';
                    firstErrorField = phoneInput;
                    errorStep = 1;
                  } else if (!emailInput?.value?.trim()) {
                    errorMessage = '이메일을 입력해주세요.';
                    firstErrorField = emailInput;
                    errorStep = 1;
                  } else if (!drawingType) {
                    // Step 2: 도면 및 샘플 검증
                    errorMessage = '필요한 사항을 선택해주세요.';
                    errorStep = 2;
                  } else if (drawingType === 'have' && !drawingModification) {
                    errorMessage = '도면 수정 필요 여부를 선택해주세요.';
                    errorStep = 2;
                  } else if (drawingType === 'have') {
                    if (drawingFile.length === 0) {
                      errorMessage = '도면 파일을 업로드해주세요.';
                      firstErrorField = null;
                      errorStep = 2;
                    } else if (deliveryMethod === 'delivery_company') {
                      // Step 3: 납품업체 검증
                      if (
                        !newDeliveryCompany.name?.trim() ||
                        !newDeliveryCompany.phone?.trim() ||
                        !newDeliveryCompany.address?.trim()
                      ) {
                        errorMessage = '납품업체명, 연락처, 주소를 모두 입력해주세요.';
                        errorStep = 3;
                      }
                    }
                  } else if (drawingType === 'create' && !receiptMethod) {
                    // Step 3: 일정 조율 검증 (모두 준비되었을 경우 제외)
                    errorMessage = '수령방법을 선택해주세요.';
                    errorStep = 3;
                  } else if (drawingType === 'create' && receiptMethod === 'visit') {
                    if (!visitDate) {
                      errorMessage = '방문 날짜를 선택해주세요.';
                      errorStep = 3;
                    } else if (!visitTimeSlot) {
                      errorMessage = '방문 시간을 선택해주세요.';
                      errorStep = 3;
                    }
                  } else if (drawingType === 'create' && receiptMethod === 'delivery') {
                    if (!deliveryType) {
                      errorMessage = '배송 방법을 선택해주세요.';
                      errorStep = 3;
                    } else if (!deliveryAddress?.trim()) {
                      errorMessage = '배송 주소를 입력해주세요.';
                      errorStep = 3;
                    } else if (!deliveryName?.trim()) {
                      errorMessage = '수령인 이름을 입력해주세요.';
                      errorStep = 3;
                    } else if (!deliveryPhone?.trim()) {
                      errorMessage = '수령인 연락처를 입력해주세요.';
                      errorStep = 3;
                    }
                  }

                  if (errorMessage) {
                    log.warn('Validation failed', { errorMessage });

                    // 에러 상태 설정
                    const newFieldErrors: Record<string, string> = {};

                    // 각 필드별 에러 메시지 설정
                    if (!companyNameInput?.value?.trim()) {
                      newFieldErrors.company_name = '업체명(또는 이름)을 입력해주세요.';
                    } else if (
                      contactType === 'company' &&
                      (!nameInput?.value?.trim() || !positionInput?.value?.trim())
                    ) {
                      if (!nameInput?.value?.trim()) {
                        newFieldErrors.name = '담당자명을 입력해주세요.';
                      }
                      if (!positionInput?.value?.trim()) {
                        newFieldErrors.position = '담당자 직책을 입력해주세요.';
                      }
                    } else if (!phoneInput?.value?.trim()) {
                      newFieldErrors.phone = '연락처를 입력해주세요.';
                    } else if (!emailInput?.value?.trim()) {
                      newFieldErrors.email = '이메일을 입력해주세요.';
                    } else if (!drawingType) {
                      newFieldErrors.drawingType = '필요한 사항을 선택해주세요.';
                    } else if (drawingType === 'have' && !drawingModification) {
                      newFieldErrors.drawingModification = '도면 수정 필요 여부를 선택해주세요.';
                    } else if (drawingType === 'have' && drawingFile.length === 0) {
                      newFieldErrors.drawingFile = '도면 파일을 업로드해주세요.';
                    } else if (drawingType === 'have' && deliveryMethod === 'delivery_company') {
                      if (!newDeliveryCompany.name?.trim()) {
                        newFieldErrors.delivery_company_name = '납품업체명을 입력해주세요.';
                      }
                      if (!newDeliveryCompany.phone?.trim()) {
                        newFieldErrors.delivery_company_phone = '납품업체 연락처를 입력해주세요.';
                      }
                      if (!newDeliveryCompany.address?.trim()) {
                        newFieldErrors.delivery_company_address = '납품업체 주소를 입력해주세요.';
                      }
                    } else if (drawingType === 'create' && !receiptMethod) {
                      newFieldErrors.receiptMethod = '수령방법을 선택해주세요.';
                    } else if (drawingType === 'create' && receiptMethod === 'visit') {
                      if (!visitDate) {
                        newFieldErrors.visitDate = '방문 날짜를 선택해주세요.';
                      } else if (!visitTimeSlot) {
                        newFieldErrors.visitTimeSlot = '방문 시간을 선택해주세요.';
                      }
                    } else if (drawingType === 'create' && receiptMethod === 'delivery') {
                      if (!deliveryType) {
                        newFieldErrors.deliveryType = '배송 방법을 선택해주세요.';
                      } else if (!deliveryAddress?.trim()) {
                        newFieldErrors.deliveryAddress = '배송 주소를 입력해주세요.';
                      } else if (!deliveryName?.trim()) {
                        newFieldErrors.deliveryName = '수령인 이름을 입력해주세요.';
                      } else if (!deliveryPhone?.trim()) {
                        newFieldErrors.deliveryPhone = '수령인 연락처를 입력해주세요.';
                      }
                    }

                    setFieldErrors(newFieldErrors);

                    // 해당 단계로 이동
                    setCurrentStep(errorStep);

                    // 해당 필드로 스크롤 및 포커스
                    setTimeout(() => {
                      if (firstErrorField) {
                        firstErrorField.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => firstErrorField.focus(), 300);
                      } else {
                        // 직접 단계별 헤더 찾기
                        const headings = document.querySelectorAll('h2');
                        let targetHeading: Element | null = null;
                        if (errorStep === 1) {
                          targetHeading =
                            Array.from(headings).find((h) =>
                              h.textContent?.includes('연락처 정보')
                            ) || null;
                        } else if (errorStep === 2) {
                          targetHeading =
                            Array.from(headings).find((h) =>
                              h.textContent?.includes('도면 및 샘플')
                            ) || null;
                        } else if (errorStep === 3) {
                          targetHeading =
                            Array.from(headings).find(
                              (h) =>
                                h.textContent?.includes('일정 조율') ||
                                h.textContent?.includes('납품업체')
                            ) || null;
                        }
                        if (targetHeading) {
                          targetHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }
                    }, 100);
                    return;
                  }

                  // 검증 통과 시 에러 상태 초기화
                  setFieldErrors({});

                  // 모든 검증 통과 시 폼 제출
                  setIsSubmitting(true);

                  try {
                    const attachmentInput = form.querySelector(
                      'input[name="attachment"]'
                    ) as HTMLInputElement;

                    const formData = buildContactSubmitFormData({
                      inquiryTitle,
                      contactType,
                      serviceType,
                      companyName,
                      name,
                      position,
                      phone,
                      email,
                      referralSource,
                      referralSourceOther,
                      drawingType,
                      hasPhysicalSample,
                      hasReferencePhotos,
                      drawingModification,
                      boxShape,
                      length,
                      width,
                      height,
                      material,
                      drawingNotes,
                      sampleNotes,
                      deliveryMethod,
                      newDeliveryCompany,
                      receiptMethod,
                      visitLocation,
                      visitDate,
                      visitTimeSlot,
                      deliveryAddress,
                      deliveryName,
                      deliveryPhone,
                      deliveryType,
                      referencePhotosFiles,
                      drawingFile,
                      attachmentFile: attachmentInput?.files?.[0] ?? null,
                      portfolioProduct,
                      origin: window.location.origin,
                    });

                    // submitContact 호출
                    const result = await submitContactForm(formData);

                    if (result && result.success) {
                      // 제출 상태 해제
                      setIsSubmitting(false);

                      // 리다이렉트 URL이 있으면 저장 (모달에서 처리)
                      if (result.redirectUrl) {
                        setSuccessRedirectUrl(`${result.redirectUrl}?from=contact`);
                      }
                      // hotfix v2 (task 23 R5): booking 생성 실패 시 contact 는
                      // 저장됐으므로 성공 처리하되, 사용자에게 booking 실패 사실을
                      // 별도 모달로 명시한다. 직전에는 silent log 라 사용자가 admin
                      // 캘린더에서 예약을 못 찾는 이유를 인지할 수 없었음.
                      if (result.fileUploadError) {
                        log.warn('File upload failed but contact saved', {
                          error: result.fileUploadError,
                        });
                        setErrorMessage(
                          `문의는 정상 접수되었지만 파일 업로드에 실패했습니다.\n${result.fileUploadError}\n관리자에게 문의해주세요.`
                        );
                        setShowErrorModal(true);
                      } else if (result.bookingError) {
                        log.warn('Booking creation failed but contact saved', {
                          error: result.bookingError,
                        });
                        setErrorMessage(
                          `문의는 정상 접수되었지만 방문 예약 등록에 실패했습니다.\n${result.bookingError}\n관리자에게 문의해주세요.`
                        );
                        setShowErrorModal(true);
                      } else {
                        // 성공 모달 표시 (로그인 여부와 관계없이)
                        setShowSuccessModal(true);
                      }
                    } else {
                      // 실패 시 에러 모달 표시
                      setErrorMessage(
                        result?.error || '문의 제출에 실패했습니다. 다시 시도해주세요.'
                      );
                      setShowErrorModal(true);
                      setIsSubmitting(false);
                    }
                  } catch (error) {
                    // Next.js redirect 에러는 무시 (정상적인 리다이렉트)
                    if (
                      error instanceof Error &&
                      (error.message === 'NEXT_REDIRECT' ||
                        (error as { digest?: string }).digest?.startsWith('NEXT_REDIRECT'))
                    ) {
                      // 리다이렉트는 정상 동작이므로 에러로 처리하지 않음
                      return;
                    }
                    log.error('Form submission error', error);
                    setErrorMessage(
                      `폼 제출 중 오류가 발생했습니다: ${error instanceof Error ? error.message : String(error)}`
                    );
                    setShowErrorModal(true);
                    setIsSubmitting(false);
                  }
                }}
              />
            </div>
          </ContactEstimateMethodSection>

          {/* 모든 섹션의 hidden input을 form 태그 바로 안에 배치 */}
          <input
            type="hidden"
            name="referral_source"
            value={
              referralSource === '기타' || referralSource === '거래처 소개'
                ? referralSourceOther
                : referralSource
            }
          />
          <input type="hidden" name="receipt_method" value={receiptMethod || ''} />
          <input type="hidden" name="visit_location" value={visitLocation || ''} />
          <input type="hidden" name="visit_date" value={visitDate || ''} />
          <input type="hidden" name="visit_time_slot" value={visitTimeSlot || ''} />
          <input type="hidden" name="delivery_address" value={deliveryAddress || ''} />
          <input type="hidden" name="delivery_name" value={deliveryName || ''} />
          <input type="hidden" name="delivery_phone" value={deliveryPhone || ''} />
          <input type="hidden" name="delivery_type" value={deliveryType || ''} />
        </form>
      </div>

      {/* 성공 모달 */}
      <SuccessModal
        isOpen={showSuccessModal}
        onClose={() => {
          setShowSuccessModal(false);
          // 리다이렉트 URL이 있으면 리다이렉트
          if (successRedirectUrl) {
            router.push(successRedirectUrl);
            setSuccessRedirectUrl(null);
          }
        }}
        title="문의가 전송되었습니다"
        message="빠른 시일 내에 연락드리겠습니다."
      />

      {/* 에러 모달 */}
      <ErrorModal
        isOpen={showErrorModal}
        onClose={() => {
          setShowErrorModal(false);
        }}
        title="문의 제출 실패"
        message={errorMessage}
      />
    </div>
  );
}
