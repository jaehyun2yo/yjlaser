// Contact Form 데이터 처리 유틸리티

import type { ContactFormData } from '@/app/actions/contacts';

export interface ProcessedContactData {
  inquiryTitle: string;
  companyName: string;
  name: string;
  position: string;
  phone: string;
  email: string;
  referralSource?: string | null;
  contactType?: string | null;
  serviceMoldRequest?: boolean;
  serviceDeliveryBrokerage?: boolean;
  drawingType?: string | null;
  hasPhysicalSample?: boolean;
  hasReferencePhotos?: boolean;
  drawingModification?: string | null;
  boxShape?: string | null;
  length?: string | null;
  width?: string | null;
  height?: string | null;
  material?: string | null;
  drawingNotes?: string | null;
  sampleNotes?: string | null;
  receiptMethod?: string | null;
  visitLocation?: string | null;
  visitDate?: string | null;
  visitTimeSlot?: string | null;
  deliveryType?: string | null;
  deliveryAddress?: string | null;
  deliveryName?: string | null;
  deliveryPhone?: string | null;
  deliveryMethod?: string | null;
  deliveryCompanyName?: string | null;
  deliveryCompanyPhone?: string | null;
  deliveryCompanyAddress?: string | null;
  attachmentFilename?: string | null;
  attachmentUrl?: string | null;
  drawingFileUrl?: string | null;
  drawingFileName?: string | null;
  referencePhotosUrls?: string | null;
  status?: string;
  source?: string;
  inquiryType?: string | null;
  processStage?: string | null;
  // 포트폴리오 참고 정보
  portfolioReferenceUrl?: string | null;
  portfolioReferenceInfo?: string | null;
}

/**
 * FormData에서 문자열 필드 추출 (빈 문자열을 null로 변환)
 */
export function extractStringField(formData: FormData, key: string): string | null {
  const value = formData.get(key);
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed ? trimmed : null;
}

/**
 * FormData에서 불린 필드 추출
 */
export function extractBooleanField(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === '1' || value === 'true';
}

/**
 * Contact Form 데이터를 데이터베이스 저장용 형식으로 변환
 */
export function prepareContactInsertData(
  contactData: ContactFormData,
  metadata: {
    contact_type: string;
    service_mold_request: boolean;
    service_delivery_brokerage: boolean;
    receipt_method?: string | null;
    visit_location?: string | null;
    visit_date?: string | null;
    visit_time_slot?: string | null;
    delivery_type?: string | null;
    delivery_address?: string | null;
    delivery_name?: string | null;
    delivery_phone?: string | null;
    delivery_method?: string | null;
    delivery_company_name?: string | null;
    delivery_company_phone?: string | null;
    delivery_company_address?: string | null;
    attachmentFilename?: string | null;
    attachmentUrl?: string | null;
    drawingFileUrl?: string | null;
    drawingFileName?: string | null;
    referencePhotosUrls?: string[];
    // 포트폴리오 참고 정보
    portfolioReferenceUrl?: string | null;
    portfolioReferenceInfo?: {
      id: string | number;
      title: string;
      field?: string;
      type?: string;
      format?: string;
      size?: string;
      paper?: string;
      printing?: string;
      finishing?: string;
      imageUrl?: string;
    } | null;
  }
): ProcessedContactData {
  // 공개 문의 폼 자동 분류
  // - service_mold_request=true (개인의 "목형만 제작" 옵션) 또는 drawing_type='have' (도면 준비됨, 바로 목형 의뢰)
  //   → mold_request: status='confirmed', processStage='drawing_confirmed' (현장 직행)
  // - drawing_type='create' (샘플 제작 필요)
  //   → cutting_request: status='received', processStage=null (worker 가 사무실 "공정 시작 전" 탭에서 [도면작업 시작] 으로 진행)
  // - 위 어느 조건에도 해당 안 되면 inquiry_type=null (분류 안 함, worker 가 수동 분류)
  // NestJS contacts.service.create() 의 autoStatus/autoProcessStage 매핑과 일치시켜
  // frontend 에서 명시적으로 보내 NestJS 의 fallback 으로 덮어씌워지지 않게 한다.
  let autoInquiryType: string | null = null;
  let autoStatus: string = 'received';
  let autoProcessStage: string | null = null;
  if (metadata.service_mold_request || contactData.drawing_type === 'have') {
    autoInquiryType = 'mold_request';
    autoStatus = 'confirmed';
    autoProcessStage = 'drawing_confirmed';
  } else if (contactData.drawing_type === 'create') {
    autoInquiryType = 'cutting_request';
    autoStatus = 'received';
    autoProcessStage = null;
  }

  const insertData: ProcessedContactData = {
    inquiryTitle: contactData.inquiry_title,
    companyName: contactData.company_name,
    name: contactData.name,
    position: contactData.position,
    phone: contactData.phone,
    email: contactData.email,
    referralSource: contactData.referral_source || null,
    contactType: metadata.contact_type || null,
    serviceMoldRequest: metadata.service_mold_request || false,
    serviceDeliveryBrokerage: metadata.service_delivery_brokerage || false,
    inquiryType: autoInquiryType,
    processStage: autoProcessStage,
    drawingType: contactData.drawing_type || null,
    hasPhysicalSample: contactData.has_physical_sample || false,
    hasReferencePhotos: contactData.has_reference_photos || false,
    drawingModification: contactData.drawing_modification || null,
    boxShape: contactData.box_shape || null,
    length: contactData.length || null,
    width: contactData.width || null,
    height: contactData.height || null,
    material: contactData.material || null,
    drawingNotes: contactData.drawing_notes || null,
    sampleNotes: contactData.sample_notes || null,
    receiptMethod: metadata.receipt_method || null,
    visitLocation: metadata.visit_location || null,
    visitDate: metadata.visit_date || null,
    visitTimeSlot: metadata.visit_time_slot || null,
    deliveryType: metadata.delivery_type || null,
    deliveryAddress: metadata.delivery_address || null,
    deliveryName: metadata.delivery_name || null,
    deliveryPhone: metadata.delivery_phone || null,
    deliveryMethod: metadata.delivery_method || null,
    deliveryCompanyName: metadata.delivery_company_name || null,
    deliveryCompanyPhone: metadata.delivery_company_phone || null,
    deliveryCompanyAddress: metadata.delivery_company_address || null,
    attachmentFilename: metadata.attachmentFilename || null,
    attachmentUrl: metadata.attachmentUrl || null,
    drawingFileUrl: metadata.drawingFileUrl || null,
    drawingFileName: metadata.drawingFileName || null,
    referencePhotosUrls:
      metadata.referencePhotosUrls && metadata.referencePhotosUrls.length > 0
        ? JSON.stringify(metadata.referencePhotosUrls)
        : null,
    status: autoStatus,
    source: 'website',
    // 포트폴리오 참고 정보
    portfolioReferenceUrl: metadata.portfolioReferenceUrl || null,
    portfolioReferenceInfo: metadata.portfolioReferenceInfo
      ? JSON.stringify(metadata.portfolioReferenceInfo)
      : null,
  };

  // undefined 값 제거
  Object.keys(insertData).forEach((key) => {
    if (insertData[key as keyof ProcessedContactData] === undefined) {
      delete insertData[key as keyof ProcessedContactData];
    }
  });

  return insertData;
}
