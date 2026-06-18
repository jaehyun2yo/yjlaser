/**
 * 사무실 → 현장 전환(공정 단계 변경) 에러 메시지 매핑 유틸.
 *
 * Phase 5 에서 NestJS 가 `UnprocessableEntityException` 의 payload 로 전달하는
 * `{ code, message }` 를 worker / admin 양쪽 UI 가 동일한 한글 문구로 매핑한다.
 * 기술 용어(`inquiryNumber`, `FOLDER_CREATION_FAILED` 등) 를 사용자에게 그대로
 * 노출하지 않기 위해 title + message 로 분리한다.
 */

export interface StageTransitionErrorDetail {
  title: string;
  message: string;
}

export interface StageTransitionErrorInput {
  code?: string;
  message: string;
  statusCode?: number;
}

function extractCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function extractMessage(error: unknown): string {
  if (typeof error === 'string') return error;
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === 'string' ? message : '';
  }
  return '';
}

export function mapStageTransitionError(error: unknown): StageTransitionErrorDetail {
  const code = extractCode(error);
  const message = extractMessage(error);

  if (code === 'INQUIRY_NUMBER_REQUIRED') {
    return {
      title: '도면 확정 불가',
      message:
        '이 문의에 문의번호(O-번호)가 할당되어 있지 않아 현장 작업으로 전환할 수 없습니다. 관리자에게 문의번호 발급을 요청하세요.',
    };
  }

  if (code === 'FOLDER_CREATION_FAILED') {
    return {
      title: '웹하드 폴더 생성 실패',
      message:
        '문의 폴더를 생성할 수 없습니다. 업체 정보(Company) 가 정상 등록되어 있는지 확인하세요.',
    };
  }

  return {
    title: '전환 실패',
    message: message || '공정 단계 전환에 실패했습니다.',
  };
}
