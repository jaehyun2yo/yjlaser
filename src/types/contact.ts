// Contact Form 관련 타입 정의

export interface PortfolioProductInfo {
  id: string | number; // UUID 또는 숫자 ID 모두 지원
  title: string;
  field?: string;
  type?: string;
  format?: string;
  size?: string;
  paper?: string;
  printing?: string;
  finishing?: string;
  imageUrl?: string;
}

export interface ContactFormInitialValues {
  companyName?: string;
  name?: string;
  position?: string;
  phone?: string;
  email?: string;
}

export interface ContactFormProps {
  success?: boolean;
  error?: string;
  initialValues?: ContactFormInitialValues | null;
  portfolioProduct?: PortfolioProductInfo | null;
}

export type ContactType = 'company' | 'individual';

export interface ServiceTypes {
  moldRequest: boolean;
  deliveryBrokerage: boolean;
}

export type DrawingType = 'create' | 'have' | '';
export type DrawingModification = 'needed' | 'not_needed' | '';
export type ReceiptMethod = 'visit' | 'delivery' | '';
export type DeliveryType = 'parcel' | 'quick' | '';

export interface ContactFormState {
  // Step 1: 연락처 정보
  contactType: ContactType;
  serviceTypes: ServiceTypes;
  companyName: string;
  name: string;
  position: string;
  phone: string;
  email: string;
  referralSource: string;
  referralSourceOther: string;

  // Step 2: 도면 및 샘플
  drawingType: DrawingType;
  hasPhysicalSample: boolean;
  hasReferencePhotos: boolean;
  drawingModification: DrawingModification;
  boxShape: string;
  length: string;
  width: string;
  height: string;
  material: string;
  drawingNotes: string;
  sampleNotes: string;

  // Step 3: 일정 조율
  receiptMethod: ReceiptMethod;
  visitLocation: string;
  visitDate: string;
  visitTimeSlot: string;
  deliveryAddress: string;
  deliveryName: string;
  deliveryPhone: string;
  deliveryType: DeliveryType;

  // UI 상태
  currentStep: number;
  isSubmitting: boolean;
  showSuccessModal: boolean;
}
