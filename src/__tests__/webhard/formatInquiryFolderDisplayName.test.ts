import { formatInquiryFolderDisplayName } from '@/app/webhard/_lib/formatInquiryFolderDisplayName';

describe('formatInquiryFolderDisplayName', () => {
  it('사무실+현장 문의 폴더명을 slash 표시로 변환한다', () => {
    expect(formatInquiryFolderDisplayName('260511-O-001_260511-F-001')).toBe(
      '260511-O-001 / 260511-F-001'
    );
  });

  it('사무실 문의번호만 있으면 현장 칸을 비워 표시한다', () => {
    expect(formatInquiryFolderDisplayName('260511-O-001')).toBe('260511-O-001 /');
  });

  it('현장 문의번호만 있으면 사무실 칸을 비워 표시한다', () => {
    expect(formatInquiryFolderDisplayName('260511-F-001')).toBe('/ 260511-F-001');
  });

  it('문의 번호 폴더가 아니면 원래 이름을 유지한다', () => {
    expect(formatInquiryFolderDisplayName('테스트업체')).toBe('테스트업체');
    expect(formatInquiryFolderDisplayName('260511-O-001_도면')).toBe('260511-O-001_도면');
  });
});
