'use server';

import { logger } from '@/lib/utils/logger';
import { revalidatePath } from 'next/cache';
import type { ProxyContactInput } from '@/app/(admin)/admin/process-board/_lib/types';
import type { ActionResult, ActionResultWithCount, ApiListResponse } from '@/lib/types/api';
import type { Contact } from '@/lib/types/contact';
import {
  serverGetContacts,
  serverGetContact,
  serverCreateContact,
  serverGetDistinctCompanyNames,
} from '@/lib/api/nestjs-server-client';
import { getSessionUser } from '@/lib/auth/session';
import { getErpWorkerSession } from '@/lib/auth/erp-session';

const log = logger.createLogger('PROCESS_BOARD');

async function hasAdminOrWorkerSession(): Promise<boolean> {
  const workerSession = await getErpWorkerSession();
  if (workerSession) return true;

  const user = await getSessionUser();
  return user?.userType === 'admin';
}

function unauthorizedListResponse<T>(): ApiListResponse<T> {
  return {
    success: false,
    error: '인증이 필요합니다.',
    data: [],
  };
}

/**
 * 테스트 문의 생성
 */
export async function createTestContact(count: 1 | 5): Promise<ActionResultWithCount> {
  'use server';

  try {
    const companyNames = ['테스트업체A', '테스트업체B', '테스트업체C'];
    let createdCount = 0;

    for (let i = 0; i < count; i++) {
      const companyName = companyNames[Math.floor(Math.random() * companyNames.length)];

      const result = await serverCreateContact({
        inquiryTitle: `[테스트] 테스트 패키지 ${Date.now()}-${i + 1}`,
        companyName,
        name: '테스트 담당자',
        position: '담당',
        phone: '010-0000-0000',
        email: 'test@example.com',
        contactType: 'company',
        status: 'drawing',
        processStage: 'drawing',
      });

      if (result.success) createdCount++;
    }

    revalidatePath('/admin/contacts');
    revalidatePath('/admin/process-board');

    log.info(`테스트 문의 ${createdCount}개 생성 완료`);
    return { success: true, count: createdCount };
  } catch (error) {
    log.error('테스트 문의 생성 중 예외 발생', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 대리 문의 등록 (전화/방문 고객)
 */
export async function createProxyContact(
  data: ProxyContactInput
): Promise<ActionResult<{ id: number; inquiry_number: string }>> {
  'use server';

  try {
    const result = await serverCreateContact({
      inquiryTitle: data.inquiry_title,
      companyName: data.company_name,
      name: data.name,
      phone: data.phone,
      email: data.email || '',
      position: '',
      contactType: 'company',
      status: 'received',
      processStage: undefined,
      length: data.length || undefined,
      width: data.width || undefined,
      height: data.height || undefined,
      material: data.material || undefined,
      drawingNotes: data.drawing_notes || undefined,
    });

    if (!result.success) {
      log.error('대리 문의 등록 실패', { error: result.error });
      return { success: false, error: result.error || '대리 문의 등록에 실패했습니다.' };
    }

    revalidatePath('/admin/contacts');
    revalidatePath('/admin/process-board');

    log.info('대리 문의 등록 완료', { companyName: data.company_name });
    return {
      success: true,
      data: result.data as unknown as { id: number; inquiry_number: string },
    };
  } catch (error) {
    log.error('대리 문의 등록 중 예외 발생', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 공정 보드용 문의 조회
 */
export async function getProcessBoardContacts(filters?: {
  companyName?: string;
  dateFilter?: 'today' | 'week' | 'month' | 'all';
  workCategory?: 'unclassified' | 'office' | 'field';
  stageFilter?: string;
  limit?: number;
}): Promise<ApiListResponse<Contact>> {
  'use server';

  try {
    if (!(await hasAdminOrWorkerSession())) {
      return unauthorizedListResponse<Contact>();
    }

    // processStages 파라미터 구성 (specific stage → workCategory 필터 우선)
    let processStages: string | undefined;
    if (filters?.stageFilter && filters.stageFilter !== 'all') {
      if (filters.stageFilter === 'pre-process') {
        processStages = 'null'; // 공정 시작 전 (processStage가 null인 문의)
      } else {
        processStages = filters.stageFilter;
      }
    }

    const result = await serverGetContacts(
      {
        status: 'all',
        companyName: filters?.companyName,
        workCategory: filters?.workCategory,
        processStages,
        sortBy: 'createdAt',
        sortOrder: 'desc',
        limit: filters?.limit ?? 1000,
        includeWorkerNotes: true,
      },
      { revalidate: 0 }
    );

    const contacts = (result.contacts || []) as unknown as Contact[];

    return { success: true, data: contacts, total: result.totalCount };
  } catch (error) {
    log.error('공정 보드 데이터 조회 중 예외 발생', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      data: [],
    };
  }
}

/**
 * 작업 카테고리별 문의 수 조회
 */
export async function getWorkCategoryCounts(): Promise<
  ActionResult<{ unclassified: number; office: number; field: number }>
> {
  'use server';

  try {
    if (!(await hasAdminOrWorkerSession())) {
      return { success: false, error: '인증이 필요합니다.' };
    }

    // 각 카테고리별 카운트를 NestJS API로 조회
    const [unclassifiedResult, officeResult, fieldResult] = await Promise.all([
      serverGetContacts(
        { status: 'all', workCategory: 'unclassified', limit: 1, page: 1 },
        { revalidate: 30 }
      ),
      serverGetContacts(
        { status: 'all', workCategory: 'office', limit: 1, page: 1 },
        { revalidate: 30 }
      ),
      serverGetContacts(
        { status: 'all', workCategory: 'field', limit: 1, page: 1 },
        { revalidate: 30 }
      ),
    ]);

    return {
      success: true,
      data: {
        unclassified: unclassifiedResult.totalCount || 0,
        office: officeResult.totalCount || 0,
        field: fieldResult.totalCount || 0,
      },
    };
  } catch (error) {
    log.error('작업 카테고리 카운트 조회 실패', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 납품 완료 문의 조회
 */
export async function getDeliveredContacts(filters?: {
  dateFrom?: string;
  dateTo?: string;
  search?: string;
  companyNames?: string[];
}): Promise<ApiListResponse<Contact>> {
  'use server';

  try {
    if (!(await hasAdminOrWorkerSession())) {
      return unauthorizedListResponse<Contact>();
    }

    const isSearchQuery = !!filters?.search?.trim();
    const result = await serverGetContacts({
      status: 'delivered',
      dateFrom: filters?.dateFrom,
      dateTo: filters?.dateTo,
      search: filters?.search,
      companyNames: filters?.companyNames?.join(','),
      sortBy: 'updatedAt',
      sortOrder: 'desc',
      limit: isSearchQuery ? 20 : 1000,
      includeTimeline: !isSearchQuery,
    });

    const contacts = (result.contacts || []) as unknown as Contact[];

    return { success: true, data: contacts, total: result.totalCount };
  } catch (error) {
    log.error('납품 완료 데이터 조회 중 예외 발생', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      data: [],
    };
  }
}

/**
 * 납품 완료 검색 이동 강조 대상 단건 조회
 */
export async function getDeliveredContactById(contactId: string): Promise<{
  success: boolean;
  data?: Contact | null;
  error?: string;
}> {
  'use server';

  try {
    if (!(await hasAdminOrWorkerSession())) {
      return { success: false, error: '인증이 필요합니다.', data: null };
    }

    const contact = (await serverGetContact(contactId)) as Contact | null;
    if (!contact || contact.status !== 'delivered') {
      return { success: false, error: '납품 완료 문의를 찾을 수 없습니다.', data: null };
    }

    return { success: true, data: contact };
  } catch (error) {
    log.error('납품 완료 단건 조회 중 예외 발생', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
      data: null,
    };
  }
}

/**
 * 납품 완료 문의의 고유 업체명 목록 조회
 */
export async function getDeliveredCompanyNames(): Promise<ActionResult<string[]>> {
  'use server';

  try {
    if (!(await hasAdminOrWorkerSession())) {
      return { success: false, error: '인증이 필요합니다.' };
    }

    const companies = await serverGetDistinctCompanyNames('delivered');
    return { success: true, data: companies };
  } catch (error) {
    log.error('납품 완료 업체명 목록 조회 실패', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}
