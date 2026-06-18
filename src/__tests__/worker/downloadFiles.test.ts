import { prefixFilename } from '@/app/worker/_lib/downloadFiles';

describe('worker download filename prefix', () => {
  it('문의번호, 업체명, 파일명 순서로 다운로드명을 만든다', () => {
    expect(
      prefixFilename('도면.dxf', {
        inquiryNumber: '260512-O-001',
        workNumber: '260512-F-001',
        companyName: '담다',
        processStage: 'drawing',
      })
    ).toBe('260512-O-001 - 담다 - 도면.dxf');
  });

  it('이미 O prefix가 붙은 파일도 새 다운로드명에서는 prefix를 중복하지 않는다', () => {
    expect(
      prefixFilename('[260512-O-001] 도면.dxf', {
        inquiryNumber: '260512-O-001',
        workNumber: '260512-F-001',
        companyName: '담다',
        processStage: 'sample',
      })
    ).toBe('260512-O-001 - 담다 - 도면.dxf');
  });

  it('latest drawing API가 이미 내려준 다운로드명도 중복 prefix 없이 유지한다', () => {
    expect(
      prefixFilename('260512-O-001 - 담다 - 도면.dxf', {
        inquiryNumber: '260512-O-001',
        workNumber: '260512-F-001',
        companyName: '담다',
        processStage: 'drawing',
      })
    ).toBe('260512-O-001 - 담다 - 도면.dxf');
  });

  it('날짜 prefix는 제거한 뒤 문의 다운로드명을 만든다', () => {
    expect(
      prefixFilename('20260521_도면.dxf', {
        inquiryNumber: '260512-O-001',
        workNumber: null,
        companyName: '담다',
        processStage: 'laser',
      })
    ).toBe('260512-O-001 - 담다 - 도면.dxf');
  });
});
