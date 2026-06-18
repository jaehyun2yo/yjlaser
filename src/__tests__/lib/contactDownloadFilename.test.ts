import {
  buildContactDownloadFilename,
  buildWorkerContactCardFilename,
  buildWorkerContactCardFilenameParts,
} from '@/lib/utils/contactDownloadFilename';

describe('buildContactDownloadFilename', () => {
  it('문의번호 - 업체명 - 파일명 형식으로 만든다', () => {
    expect(
      buildContactDownloadFilename({
        inquiryNumber: '260521-O-001',
        workNumber: '260521-F-002',
        companyName: '담다',
        fileName: '패키지.ai',
      })
    ).toBe('260521-O-001 - 담다 - 패키지.ai');
  });

  it('이미 붙은 번호 prefix와 같은 다운로드 prefix를 제거한다', () => {
    expect(
      buildContactDownloadFilename({
        inquiryNumber: '260521-O-001',
        companyName: '담다',
        fileName: '260521-O-001 - 담다 - [260521-O-001] 패키지.ai',
      })
    ).toBe('260521-O-001 - 담다 - 패키지.ai');
  });

  it('서버가 이미 만든 다운로드명을 다시 받아도 prefix를 중복하지 않는다', () => {
    expect(
      buildContactDownloadFilename({
        inquiryNumber: '260518-O-001',
        companyName: '테스트업체',
        fileName: '260518-O-001 - 테스트업체 - 화면 캡처 2025-09-26 124215.png',
      })
    ).toBe('260518-O-001 - 테스트업체 - 화면 캡처 2025-09-26 124215.png');
  });

  it('짧은 O/F 번호로 이미 붙은 업체 prefix도 제거한다', () => {
    expect(
      buildContactDownloadFilename({
        inquiryNumber: '260518-O-001',
        companyName: '테스트업체',
        fileName: 'O-001 - 테스트업체 - 화면 캡처 2025-09-26 124215.png',
      })
    ).toBe('260518-O-001 - 테스트업체 - 화면 캡처 2025-09-26 124215.png');
  });
});

describe('buildWorkerContactCardFilename', () => {
  it('worker 카드 표시명은 업체명 - 파일명 형식으로 만들고 번호 prefix는 숨긴다', () => {
    expect(
      buildWorkerContactCardFilename({
        inquiryNumber: '260518-O-001',
        companyName: '테스트업체',
        fileName: '260518-O-001 - 테스트업체 - [260518-O-001] 화면 캡처.png',
      })
    ).toBe('테스트업체 - 화면 캡처.png');
  });

  it('worker 카드 표시명 parts는 업체명과 파일명을 분리해 반환한다', () => {
    expect(
      buildWorkerContactCardFilenameParts({
        inquiryNumber: '260518-O-001',
        companyName: '테스트업체',
        fileName: '260518-O-001 - 테스트업체 - 화면 캡처.png',
      })
    ).toEqual({
      companyName: '테스트업체',
      fileName: '화면 캡처.png',
    });
  });
});
