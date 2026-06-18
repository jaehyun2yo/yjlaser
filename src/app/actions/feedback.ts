'use server';

import { getSessionUser } from '@/lib/auth/session';
import { logger } from '@/lib/utils/logger';

const feedbackLogger = logger.createLogger('COMPANY_FEEDBACK');

/**
 * 불편사항 제출 데이터 인터페이스
 */
export interface FeedbackFormData {
  category: string;
  category_other?: string;
  content: string;
}

/**
 * 불편사항 제출 서버 액션
 *
 * @param formData - 폼 데이터 (content 포함)
 * @returns 제출 결과
 */
export async function submitFeedback(formData: FormData) {
  'use server';

  try {
    // 세션 확인
    const user = await getSessionUser();
    if (!user || user.userType !== 'company' || !user.userId) {
      feedbackLogger.warn('Unauthorized feedback submission attempt');
      return {
        success: false,
        error: '로그인이 필요합니다.',
      };
    }

    // 폼 데이터 추출
    const category = formData.get('category') as string | null;
    const categoryOther = formData.get('category_other') as string | null;
    const content = formData.get('content') as string | null;

    // 유효성 검사
    if (!category) {
      return {
        success: false,
        error: '불편한 카테고리를 선택해주세요.',
      };
    }

    if (category === 'other' && (!categoryOther || !categoryOther.trim())) {
      return {
        success: false,
        error: '기타 카테고리를 입력해주세요.',
      };
    }

    if (!content || content.trim().length === 0) {
      return {
        success: false,
        error: '불편사항 내용을 입력해주세요.',
      };
    }

    if (content.trim().length < 10) {
      return {
        success: false,
        error: '불편사항 내용은 최소 10자 이상 입력해주세요.',
      };
    }

    if (content.length > 5000) {
      return {
        success: false,
        error: '불편사항 내용은 5000자 이하로 입력해주세요.',
      };
    }

    // 업체 정보 가져오기 (NestJS API)
    const { serverGetCompany, serverCreateFeedback } =
      await import('@/lib/api/nestjs-server-client');

    // user.userId가 숫자인지 확인
    const companyId =
      typeof user.userId === 'number' ? user.userId : parseInt(String(user.userId), 10);

    if (isNaN(companyId)) {
      feedbackLogger.error('Invalid company ID', { userId: user.userId });
      return {
        success: false,
        error: '유효하지 않은 업체 정보입니다.',
      };
    }

    const companyData = await serverGetCompany(companyId);

    if (!companyData) {
      feedbackLogger.error('Company not found', { companyId, userId: user.userId });
      return {
        success: false,
        error: '업체 정보를 찾을 수 없습니다.',
      };
    }

    // 불편사항 저장 (NestJS API)
    feedbackLogger.debug('Creating feedback via NestJS API', {
      companyId: companyData.id,
      companyName: companyData.company_name,
      category,
    });

    const feedbackResult = await serverCreateFeedback({
      companyId: companyData.id,
      companyName: companyData.company_name,
      companyEmail: companyData.manager_email || undefined,
      content: content.trim(),
      category: category,
      categoryOther: category === 'other' && categoryOther ? categoryOther.trim() : undefined,
    });

    if (!feedbackResult.success) {
      feedbackLogger.error('Error creating feedback', { error: feedbackResult.error });
      return {
        success: false,
        error: `불편사항 저장에 실패했습니다: ${feedbackResult.error || '알 수 없는 오류'}`,
      };
    }

    // feedback created successfully - skip the old insertedData check
    if (false) {
      feedbackLogger.error('No data returned from insert', {});
      return {
        success: false,
        error: '불편사항 저장에 실패했습니다. 데이터가 반환되지 않았습니다.',
      };
    }

    feedbackLogger.info('Feedback saved successfully', {
      companyId: companyData.id,
      companyName: companyData.company_name,
    });

    return { success: true };
  } catch (error) {
    feedbackLogger.error('Unexpected error in submitFeedback', error);
    return {
      success: false,
      error: '서버 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
    };
  }
}
