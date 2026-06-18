import {
  buildContactSubmitFormData,
  validateContactSubmitState,
  type ContactSubmitState,
} from '@/app/contact/_lib/contactSubmission';
import { CONTACT_FORM_SECTIONS } from '@/app/contact/_components/contactFormSections';

function makeState(overrides: Partial<ContactSubmitState> = {}): ContactSubmitState {
  return {
    inquiryTitle: '테스트 패키지',
    contactType: 'company',
    serviceType: 'moldRequest',
    companyName: '유진레이저',
    name: '홍길동',
    position: '팀장',
    phone: '010-1234-5678',
    email: 'test@example.com',
    referralSource: '기타',
    referralSourceOther: '전시회',
    drawingType: 'create',
    hasPhysicalSample: false,
    hasReferencePhotos: true,
    drawingModification: '',
    boxShape: 'A형',
    length: '100',
    width: '80',
    height: '30',
    material: '종이',
    drawingNotes: '도면 유의사항',
    sampleNotes: '샘플 유의사항',
    deliveryMethod: 'company_address',
    newDeliveryCompany: { name: '', phone: '', address: '' },
    receiptMethod: 'visit',
    visitLocation: '',
    visitDate: '2026-05-13',
    visitTimeSlot: '10:00-11:00',
    deliveryAddress: '',
    deliveryName: '',
    deliveryPhone: '',
    deliveryType: '',
    referencePhotosFiles: [new File(['ref-a'], 'ref-a.png'), new File(['ref-b'], 'ref-b.png')],
    drawingFile: [],
    attachmentFile: null,
    portfolioProduct: { id: 'portfolio-1' },
    origin: 'https://yjlaser.example',
    ...overrides,
  };
}

describe('AUDIT-17 contact submission contracts', () => {
  it('keeps create+visit payload and promotes first reference file to drawing_file', () => {
    const formData = buildContactSubmitFormData(makeState());

    expect(formData.get('inquiry_title')).toBe('테스트 패키지');
    expect(formData.get('contact_type')).toBe('company');
    expect(formData.get('service_mold_request')).toBe('1');
    expect(formData.get('service_delivery_brokerage')).toBe('0');
    expect(formData.get('referral_source')).toBe('전시회');
    expect(formData.get('drawing_type')).toBe('create');
    expect(formData.get('has_reference_photos')).toBe('1');
    expect(formData.get('receipt_method')).toBe('visit');
    expect(formData.get('visit_date')).toBe('2026-05-13');
    expect(formData.get('visit_time_slot')).toBe('10:00-11:00');

    const promotedDrawing = formData.get('drawing_file') as File;
    expect(promotedDrawing.name).toBe('ref-a.png');
    expect(formData.getAll('reference_photos').map((file) => (file as File).name)).toEqual([
      'ref-b.png',
    ]);
    expect(formData.get('portfolio_reference_url')).toBe(
      'https://yjlaser.example/portfolio/portfolio-1'
    );
  });

  it('keeps explicit drawing upload and blocks stale reference files when the toggle is off', () => {
    const drawingFile = new File(['drawing'], 'drawing.ai');
    const staleReference = new File(['stale'], 'stale.png');

    const formData = buildContactSubmitFormData(
      makeState({
        drawingType: 'have',
        drawingModification: 'needed',
        hasReferencePhotos: false,
        drawingFile: [drawingFile],
        referencePhotosFiles: [staleReference],
        deliveryMethod: 'company_address',
        receiptMethod: '',
        portfolioProduct: null,
      })
    );

    expect((formData.get('drawing_file') as File).name).toBe('drawing.ai');
    expect(formData.getAll('reference_photos')).toEqual([]);
    expect(formData.get('delivery_method')).toBe('company_address');
    expect(formData.get('delivery_company_address')).toBe('company_address');
  });

  it('keeps visit booking validation before submission', () => {
    const result = validateContactSubmitState(
      makeState({
        receiptMethod: 'visit',
        visitTimeSlot: '',
      })
    );

    expect(result).toEqual({
      valid: false,
      errorMessage: '방문 시간을 선택해주세요.',
      errorStep: 3,
      fieldErrors: { visitTimeSlot: '방문 시간을 선택해주세요.' },
    });
  });

  it('keeps delivery method required field validation before submission', () => {
    const result = validateContactSubmitState(
      makeState({
        drawingType: 'create',
        receiptMethod: 'delivery',
        deliveryType: '',
        deliveryAddress: '',
        deliveryName: '',
        deliveryPhone: '',
      })
    );

    expect(result).toEqual({
      valid: false,
      errorMessage: '배송 방법을 선택해주세요.',
      errorStep: 3,
      fieldErrors: { deliveryType: '배송 방법을 선택해주세요.' },
    });
  });

  it('declares the public contact form section split order', () => {
    expect(CONTACT_FORM_SECTIONS).toEqual([
      { step: 1, key: 'company-info', label: 'company info section' },
      { step: 2, key: 'file-upload', label: 'file upload section' },
      { step: 3, key: 'visit-booking', label: 'visit booking section' },
      { step: 4, key: 'estimate-method', label: 'estimate method section' },
    ]);
  });
});
