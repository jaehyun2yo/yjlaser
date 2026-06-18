/**
 * @jest-environment node
 *
 * Phase 6: stage-transition-errors 유틸 단위 테스트.
 * NestJS 422 응답 payload (`{ code, message }`) 를 UI 에서 사용할 한글 title/message 로 매핑한다.
 */

import { mapStageTransitionError } from '@/lib/utils/stage-transition-errors';

describe('mapStageTransitionError', () => {
  it('INQUIRY_NUMBER_REQUIRED code → "도면 확정 불가" title 과 문의번호 안내 문구', () => {
    const result = mapStageTransitionError({
      code: 'INQUIRY_NUMBER_REQUIRED',
      message: '도면 확정 전에 문의번호(O) 또는 작업번호(F) 가 할당되어야 합니다.',
      statusCode: 422,
    });

    expect(result.title).toBe('도면 확정 불가');
    expect(result.message).toMatch(/문의번호\(O-번호\)/);
    expect(result.message).toMatch(/관리자에게/);
  });

  it('FOLDER_CREATION_FAILED code → "웹하드 폴더 생성 실패" title 과 업체 등록 확인 문구', () => {
    const result = mapStageTransitionError({
      code: 'FOLDER_CREATION_FAILED',
      message: '문의 폴더 생성에 실패하여 도면 확정으로 전환할 수 없습니다.',
      statusCode: 422,
    });

    expect(result.title).toBe('웹하드 폴더 생성 실패');
    expect(result.message).toMatch(/업체 정보\(Company\)/);
  });

  it('문자열 에러 → "전환 실패" title + 원본 문자열 message', () => {
    const result = mapStageTransitionError('네트워크 오류 문자열');
    expect(result.title).toBe('전환 실패');
    expect(result.message).toBe('네트워크 오류 문자열');
  });

  it('undefined → "전환 실패" title + 기본 안내 문구', () => {
    const result = mapStageTransitionError(undefined);
    expect(result.title).toBe('전환 실패');
    expect(result.message).toBe('공정 단계 전환에 실패했습니다.');
  });

  it('code 없는 object → "전환 실패" title + object 의 message 그대로', () => {
    const result = mapStageTransitionError({ message: 'API error: 500' });
    expect(result.title).toBe('전환 실패');
    expect(result.message).toBe('API error: 500');
  });

  it('null → 기본 안내 문구', () => {
    const result = mapStageTransitionError(null);
    expect(result.title).toBe('전환 실패');
    expect(result.message).toBe('공정 단계 전환에 실패했습니다.');
  });

  it('알 수 없는 code 값 → 기본 fallback (전환 실패)', () => {
    const result = mapStageTransitionError({
      code: 'UNKNOWN_CODE',
      message: '서버 내부 오류',
    });
    expect(result.title).toBe('전환 실패');
    expect(result.message).toBe('서버 내부 오류');
  });

  it('기술 용어(FOLDER_CREATION_FAILED / inquiryNumber) 를 그대로 노출하지 않는다', () => {
    const inquiryResult = mapStageTransitionError({
      code: 'INQUIRY_NUMBER_REQUIRED',
      message: '서버 원본 메시지',
    });
    expect(inquiryResult.message).not.toContain('INQUIRY_NUMBER_REQUIRED');
    expect(inquiryResult.message).not.toContain('inquiryNumber');

    const folderResult = mapStageTransitionError({
      code: 'FOLDER_CREATION_FAILED',
      message: '서버 원본 메시지',
    });
    expect(folderResult.message).not.toContain('FOLDER_CREATION_FAILED');
  });
});
