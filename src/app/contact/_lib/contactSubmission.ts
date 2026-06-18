export type ContactType = 'company' | 'individual';
export type ContactServiceType = 'moldRequest' | 'deliveryBrokerage' | '';
export type ContactDrawingType = 'create' | 'have' | '';
export type ContactDrawingModification = 'needed' | 'not_needed' | '';
export type ContactDeliveryMethod = 'company_address' | 'delivery_company';
export type ContactReceiptMethod = 'visit' | 'delivery' | '';
export type ContactDeliveryType = 'parcel' | 'quick' | '';

export type ContactPortfolioReference = {
  id: string | number;
};

export type ContactDeliveryCompanyInput = {
  name: string;
  phone: string;
  address: string;
};

export type ContactSubmitState = {
  inquiryTitle: string;
  contactType: ContactType;
  serviceType: ContactServiceType;
  companyName: string;
  name: string;
  position: string;
  phone: string;
  email: string;
  referralSource: string;
  referralSourceOther: string;
  drawingType: ContactDrawingType;
  hasPhysicalSample: boolean;
  hasReferencePhotos: boolean;
  drawingModification: ContactDrawingModification;
  boxShape: string;
  length: string;
  width: string;
  height: string;
  material: string;
  drawingNotes: string;
  sampleNotes: string;
  deliveryMethod: ContactDeliveryMethod;
  newDeliveryCompany: ContactDeliveryCompanyInput;
  receiptMethod: ContactReceiptMethod;
  visitLocation: string;
  visitDate: string;
  visitTimeSlot: string;
  deliveryAddress: string;
  deliveryName: string;
  deliveryPhone: string;
  deliveryType: ContactDeliveryType;
  referencePhotosFiles: File[];
  drawingFile: File[];
  attachmentFile?: File | null;
  portfolioProduct?: ContactPortfolioReference | null;
  origin?: string;
};

export type ContactSubmitValidationResult =
  | { valid: true; errorMessage: ''; errorStep: null; fieldErrors: Record<string, never> }
  | {
      valid: false;
      errorMessage: string;
      errorStep: 1 | 2 | 3;
      fieldErrors: Record<string, string>;
    };

export function validateContactSubmitState(
  state: ContactSubmitState
): ContactSubmitValidationResult {
  if (!state.companyName.trim()) {
    return invalid(1, '업체명(또는 이름)을 입력해주세요.', {
      company_name: '업체명(또는 이름)을 입력해주세요.',
    });
  }

  if (state.contactType === 'company' && (!state.name.trim() || !state.position.trim())) {
    const fieldErrors: Record<string, string> = {};
    if (!state.name.trim()) {
      fieldErrors.name = '담당자명을 입력해주세요.';
    }
    if (!state.position.trim()) {
      fieldErrors.position = '담당자 직책을 입력해주세요.';
    }
    return invalid(1, '담당자명과 직책을 입력해주세요.', fieldErrors);
  }

  if (!state.phone.trim()) {
    return invalid(1, '연락처를 입력해주세요.', { phone: '연락처를 입력해주세요.' });
  }

  if (!state.email.trim()) {
    return invalid(1, '이메일을 입력해주세요.', { email: '이메일을 입력해주세요.' });
  }

  if (!state.drawingType) {
    return invalid(2, '필요한 사항을 선택해주세요.', {
      drawingType: '필요한 사항을 선택해주세요.',
    });
  }

  if (state.drawingType === 'have' && !state.drawingModification) {
    return invalid(2, '도면 수정 필요 여부를 선택해주세요.', {
      drawingModification: '도면 수정 필요 여부를 선택해주세요.',
    });
  }

  if (state.drawingType === 'have' && state.drawingFile.length === 0) {
    return invalid(2, '도면 파일을 업로드해주세요.', {
      drawingFile: '도면 파일을 업로드해주세요.',
    });
  }

  if (state.drawingType === 'have' && state.deliveryMethod === 'delivery_company') {
    const fieldErrors: Record<string, string> = {};
    if (!state.newDeliveryCompany.name.trim()) {
      fieldErrors.delivery_company_name = '납품업체명을 입력해주세요.';
    }
    if (!state.newDeliveryCompany.phone.trim()) {
      fieldErrors.delivery_company_phone = '납품업체 연락처를 입력해주세요.';
    }
    if (!state.newDeliveryCompany.address.trim()) {
      fieldErrors.delivery_company_address = '납품업체 주소를 입력해주세요.';
    }
    if (Object.keys(fieldErrors).length > 0) {
      return invalid(3, '납품업체명, 연락처, 주소를 모두 입력해주세요.', fieldErrors);
    }
  }

  if (state.drawingType === 'create' && !state.receiptMethod) {
    return invalid(3, '수령방법을 선택해주세요.', {
      receiptMethod: '수령방법을 선택해주세요.',
    });
  }

  if (state.drawingType === 'create' && state.receiptMethod === 'visit') {
    if (!state.visitDate) {
      return invalid(3, '방문 날짜를 선택해주세요.', {
        visitDate: '방문 날짜를 선택해주세요.',
      });
    }
    if (!state.visitTimeSlot) {
      return invalid(3, '방문 시간을 선택해주세요.', {
        visitTimeSlot: '방문 시간을 선택해주세요.',
      });
    }
  }

  if (state.drawingType === 'create' && state.receiptMethod === 'delivery') {
    if (!state.deliveryType) {
      return invalid(3, '배송 방법을 선택해주세요.', {
        deliveryType: '배송 방법을 선택해주세요.',
      });
    }
    if (!state.deliveryAddress.trim()) {
      return invalid(3, '배송 주소를 입력해주세요.', {
        deliveryAddress: '배송 주소를 입력해주세요.',
      });
    }
    if (!state.deliveryName.trim()) {
      return invalid(3, '수령인 이름을 입력해주세요.', {
        deliveryName: '수령인 이름을 입력해주세요.',
      });
    }
    if (!state.deliveryPhone.trim()) {
      return invalid(3, '수령인 연락처를 입력해주세요.', {
        deliveryPhone: '수령인 연락처를 입력해주세요.',
      });
    }
  }

  return { valid: true, errorMessage: '', errorStep: null, fieldErrors: {} };
}

export function buildContactSubmitFormData(state: ContactSubmitState): FormData {
  const formData = new FormData();

  formData.append('inquiry_title', state.inquiryTitle);
  formData.append('contact_type', state.contactType);
  formData.append('service_mold_request', state.serviceType === 'moldRequest' ? '1' : '0');
  formData.append(
    'service_delivery_brokerage',
    state.serviceType === 'deliveryBrokerage' ? '1' : '0'
  );
  formData.append('company_name', state.companyName);
  formData.append('name', state.name);
  formData.append('position', state.position);
  formData.append('phone', state.phone);
  formData.append('email', state.email);
  formData.append(
    'referral_source',
    state.referralSource === '기타' || state.referralSource === '거래처 소개'
      ? state.referralSourceOther
      : state.referralSource
  );

  formData.append('drawing_type', state.drawingType || '');
  formData.append('has_physical_sample', state.hasPhysicalSample ? '1' : '0');
  formData.append('has_reference_photos', state.hasReferencePhotos ? '1' : '0');
  formData.append('drawing_modification', state.drawingModification || '');
  formData.append('box_shape', state.boxShape || '');
  formData.append('length', state.length || '');
  formData.append('width', state.width || '');
  formData.append('height', state.height || '');
  formData.append('material', state.material || '');
  formData.append('drawing_notes', state.drawingNotes || '');
  formData.append('sample_notes', state.sampleNotes || '');

  if (state.drawingType === 'have') {
    formData.append('delivery_method', state.deliveryMethod);
    if (state.deliveryMethod === 'company_address') {
      formData.append('delivery_company_address', 'company_address');
    } else {
      formData.append('delivery_company_name', state.newDeliveryCompany.name || '');
      formData.append('delivery_company_phone', state.newDeliveryCompany.phone || '');
      formData.append('delivery_company_address', state.newDeliveryCompany.address || '');
    }
  } else {
    formData.append('receipt_method', state.receiptMethod || '');
    formData.append('visit_location', state.visitLocation || '');
    formData.append('visit_date', state.visitDate || '');
    formData.append('visit_time_slot', state.visitTimeSlot || '');
    formData.append('delivery_address', state.deliveryAddress || '');
    formData.append('delivery_name', state.deliveryName || '');
    formData.append('delivery_phone', state.deliveryPhone || '');
    formData.append('delivery_type', state.deliveryType || '');
  }

  if (state.attachmentFile) {
    formData.append('attachment', state.attachmentFile);
  }

  const referencePhotosForUpload = [...state.referencePhotosFiles];
  let drawingFileForUpload: File | null = state.drawingFile[0] ?? null;
  if (
    state.drawingType !== 'have' &&
    state.hasReferencePhotos &&
    !drawingFileForUpload &&
    referencePhotosForUpload.length > 0
  ) {
    drawingFileForUpload = referencePhotosForUpload.shift() ?? null;
  }

  if (drawingFileForUpload) {
    formData.append('drawing_file', drawingFileForUpload);
  }

  if (state.hasReferencePhotos) {
    referencePhotosForUpload.forEach((file) => {
      formData.append('reference_photos', file);
    });
  }

  if (state.portfolioProduct && state.origin) {
    formData.append(
      'portfolio_reference_url',
      `${state.origin}/portfolio/${state.portfolioProduct.id}`
    );
    formData.append('portfolio_reference_info', JSON.stringify(state.portfolioProduct));
  }

  return formData;
}

function invalid(
  errorStep: 1 | 2 | 3,
  errorMessage: string,
  fieldErrors: Record<string, string>
): ContactSubmitValidationResult {
  return {
    valid: false,
    errorMessage,
    errorStep,
    fieldErrors,
  };
}
