import { getCompanyInquiryDisplayTitle } from '@/app/company/dashboard/displayTitle';

describe('getCompanyInquiryDisplayTitle', () => {
  it('문의 제목 앞의 업체명을 제거해 패키지명만 반환한다', () => {
    expect(
      getCompanyInquiryDisplayTitle({
        inquiryTitle: '테스트업체 518테스트',
        companyName: '테스트업체',
        fallbackTitle: '문의명 없음',
      })
    ).toBe('518테스트');
  });

  it('업체명 뒤 구분자가 있으면 구분자도 함께 제거한다', () => {
    expect(
      getCompanyInquiryDisplayTitle({
        inquiryTitle: '테스트업체 - 518테스트',
        companyName: '테스트업체',
        fallbackTitle: '문의명 없음',
      })
    ).toBe('518테스트');
  });

  it('문의 제목이 없으면 대체 제목을 사용한다', () => {
    expect(
      getCompanyInquiryDisplayTitle({
        inquiryTitle: null,
        alternateTitle: '홍길동',
        companyName: '테스트업체',
        fallbackTitle: '문의명 없음',
      })
    ).toBe('홍길동');
  });

  it('표시할 제목이 없으면 fallback을 사용한다', () => {
    expect(
      getCompanyInquiryDisplayTitle({
        inquiryTitle: '',
        alternateTitle: null,
        companyName: '테스트업체',
        fallbackTitle: '문의명 없음',
      })
    ).toBe('문의명 없음');
  });
});
