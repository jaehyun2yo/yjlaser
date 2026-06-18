/**
 * 문의 데이터 처리 유틸리티 테스트
 */

import {
  prepareContactInsertData,
  extractStringField,
  extractBooleanField,
} from '@/lib/utils/contactDataProcessor';
import type { ContactFormData } from '@/app/actions/contacts';

// 기본 ContactFormData 픽스처
const baseContactData: ContactFormData = {
  inquiry_title: '도무송 목형 제작 문의',
  company_name: '테스트업체',
  name: '홍길동',
  position: '대리',
  phone: '010-1234-5678',
  email: 'test@example.com',
  referral_source: 'search',
  drawing_type: 'dxf',
  has_physical_sample: false,
  has_reference_photos: false,
};

// 기본 metadata 픽스처
// service_mold_request=false 로 두어 "그 외" 분기(자동 분류 대상 아님)에서 시작.
// 이렇게 해야 status/processStage 가 기본값(received/null) 으로 떨어지므로
// 분류와 무관한 매핑 검증 테스트들이 안정적으로 동작한다.
const baseMetadata = {
  contact_type: 'new_order',
  service_mold_request: false,
  service_delivery_brokerage: false,
};

describe('prepareContactInsertData', () => {
  it('기본 연락처 정보가 올바르게 매핑된다', () => {
    const result = prepareContactInsertData(baseContactData, baseMetadata);

    expect(result.inquiryTitle).toBe('도무송 목형 제작 문의');
    expect(result.companyName).toBe('테스트업체');
    expect(result.name).toBe('홍길동');
    expect(result.position).toBe('대리');
    expect(result.phone).toBe('010-1234-5678');
    expect(result.email).toBe('test@example.com');
  });

  it('status가 항상 received로 설정된다', () => {
    const result = prepareContactInsertData(baseContactData, baseMetadata);
    expect(result.status).toBe('received');
  });

  it('source가 항상 website로 설정된다', () => {
    const result = prepareContactInsertData(baseContactData, baseMetadata);
    expect(result.source).toBe('website');
  });

  it('metadata의 serviceMoldRequest가 올바르게 매핑된다', () => {
    const result = prepareContactInsertData(baseContactData, {
      ...baseMetadata,
      service_mold_request: true,
    });
    expect(result.serviceMoldRequest).toBe(true);
  });

  // 공개 문의 폼 자동 분류 (worker-contact-classification.md 표 동기화)
  describe('공개 문의 폼 자동 분류', () => {
    it('service_mold_request=true → mold_request + confirmed + drawing_confirmed (현장 직행)', () => {
      const result = prepareContactInsertData(baseContactData, {
        ...baseMetadata,
        service_mold_request: true,
      });
      expect(result.inquiryType).toBe('mold_request');
      expect(result.status).toBe('confirmed');
      expect(result.processStage).toBe('drawing_confirmed');
    });

    it('drawing_type="have" → mold_request + confirmed + drawing_confirmed (현장 직행)', () => {
      const result = prepareContactInsertData(
        { ...baseContactData, drawing_type: 'have' },
        baseMetadata
      );
      expect(result.inquiryType).toBe('mold_request');
      expect(result.status).toBe('confirmed');
      expect(result.processStage).toBe('drawing_confirmed');
    });

    it('drawing_type="create" → cutting_request + received + processStage=null (공정 시작 전)', () => {
      // hotfix v2 (task 23): worker 사무실 탭의 "공정 시작 전" 필터에 노출되어
      // [도면작업 시작] 버튼으로 진행하도록 받침. status='drawing' 으로 두면
      // 분류 버튼이 사라지면서 "공정 시작 전" 필터에서도 빠지는 회귀를 회피.
      const result = prepareContactInsertData(
        { ...baseContactData, drawing_type: 'create' },
        baseMetadata
      );
      expect(result.inquiryType).toBe('cutting_request');
      expect(result.status).toBe('received');
      expect(result.processStage).toBeNull();
    });

    it('자동 분류 조건 미해당 → inquiryType=null + status=received + processStage=null', () => {
      const result = prepareContactInsertData(
        { ...baseContactData, drawing_type: undefined },
        baseMetadata
      );
      expect(result.inquiryType).toBeNull();
      expect(result.status).toBe('received');
      expect(result.processStage).toBeNull();
    });
  });

  it('metadata의 serviceDeliveryBrokerage가 false이면 false로 저장된다', () => {
    const result = prepareContactInsertData(baseContactData, {
      ...baseMetadata,
      service_delivery_brokerage: false,
    });
    expect(result.serviceDeliveryBrokerage).toBe(false);
  });

  it('referencePhotosUrls 배열이 JSON 문자열로 직렬화된다', () => {
    const urls = ['https://example.com/photo1.jpg', 'https://example.com/photo2.jpg'];
    const result = prepareContactInsertData(baseContactData, {
      ...baseMetadata,
      referencePhotosUrls: urls,
    });
    expect(result.referencePhotosUrls).toBe(JSON.stringify(urls));
  });

  it('빈 referencePhotosUrls 배열이면 null로 저장된다', () => {
    const result = prepareContactInsertData(baseContactData, {
      ...baseMetadata,
      referencePhotosUrls: [],
    });
    expect(result.referencePhotosUrls).toBeNull();
  });

  it('portfolioReferenceInfo 객체가 JSON 문자열로 직렬화된다', () => {
    const portfolioInfo = {
      id: 42,
      title: '박스 도무송',
      field: 'packaging',
    };
    const result = prepareContactInsertData(baseContactData, {
      ...baseMetadata,
      portfolioReferenceInfo: portfolioInfo,
    });
    expect(result.portfolioReferenceInfo).toBe(JSON.stringify(portfolioInfo));
  });

  it('portfolioReferenceInfo가 null이면 null로 저장된다', () => {
    const result = prepareContactInsertData(baseContactData, {
      ...baseMetadata,
      portfolioReferenceInfo: null,
    });
    expect(result.portfolioReferenceInfo).toBeNull();
  });

  it('수령 방법(receiptMethod)이 metadata에서 올바르게 매핑된다', () => {
    const result = prepareContactInsertData(baseContactData, {
      ...baseMetadata,
      receipt_method: 'delivery',
    });
    expect(result.receiptMethod).toBe('delivery');
  });

  it('방문 정보(visitDate, visitTimeSlot)가 올바르게 매핑된다', () => {
    const result = prepareContactInsertData(baseContactData, {
      ...baseMetadata,
      visit_date: '2024-03-15',
      visit_time_slot: '오전',
    });
    expect(result.visitDate).toBe('2024-03-15');
    expect(result.visitTimeSlot).toBe('오전');
  });

  it('배송 정보가 null이면 null로 저장된다', () => {
    const result = prepareContactInsertData(baseContactData, {
      ...baseMetadata,
      delivery_address: null,
      delivery_name: null,
    });
    expect(result.deliveryAddress).toBeNull();
    expect(result.deliveryName).toBeNull();
  });

  it('첨부파일 URL이 올바르게 매핑된다', () => {
    const result = prepareContactInsertData(baseContactData, {
      ...baseMetadata,
      attachmentFilename: 'drawing.dxf',
      attachmentUrl: 'https://r2.example.com/drawing.dxf',
    });
    expect(result.attachmentFilename).toBe('drawing.dxf');
    expect(result.attachmentUrl).toBe('https://r2.example.com/drawing.dxf');
  });
});

describe('extractStringField', () => {
  it('FormData에서 문자열 값을 올바르게 추출한다', () => {
    const formData = new FormData();
    formData.append('name', '홍길동');
    expect(extractStringField(formData, 'name')).toBe('홍길동');
  });

  it('빈 문자열은 null로 반환한다', () => {
    const formData = new FormData();
    formData.append('name', '');
    expect(extractStringField(formData, 'name')).toBeNull();
  });

  it('공백만 있는 값은 null로 반환한다', () => {
    const formData = new FormData();
    formData.append('name', '   ');
    expect(extractStringField(formData, 'name')).toBeNull();
  });

  it('존재하지 않는 키는 null을 반환한다', () => {
    const formData = new FormData();
    expect(extractStringField(formData, 'nonexistent')).toBeNull();
  });

  it('앞뒤 공백을 trim한다', () => {
    const formData = new FormData();
    formData.append('name', '  홍길동  ');
    expect(extractStringField(formData, 'name')).toBe('홍길동');
  });
});

describe('extractBooleanField', () => {
  it('"1" 값은 true를 반환한다', () => {
    const formData = new FormData();
    formData.append('flag', '1');
    expect(extractBooleanField(formData, 'flag')).toBe(true);
  });

  it('"true" 값은 true를 반환한다', () => {
    const formData = new FormData();
    formData.append('flag', 'true');
    expect(extractBooleanField(formData, 'flag')).toBe(true);
  });

  it('"0" 값은 false를 반환한다', () => {
    const formData = new FormData();
    formData.append('flag', '0');
    expect(extractBooleanField(formData, 'flag')).toBe(false);
  });

  it('존재하지 않는 키는 false를 반환한다', () => {
    const formData = new FormData();
    expect(extractBooleanField(formData, 'nonexistent')).toBe(false);
  });

  it('"false" 문자열은 false를 반환한다', () => {
    const formData = new FormData();
    formData.append('flag', 'false');
    expect(extractBooleanField(formData, 'flag')).toBe(false);
  });
});
