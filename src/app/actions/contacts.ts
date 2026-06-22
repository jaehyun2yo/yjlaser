'use server';

import crypto from 'crypto';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { prepareContactInsertData } from '@/lib/utils/contactDataProcessor';
import { logger } from '@/lib/utils/logger';
import { FILE_SIZE_LIMITS } from '@/lib/utils/constants';
import { revalidatePath } from 'next/cache';
import { buildForwardedCookieHeader } from '@/lib/api/headerEncoding';
import type { ProcessStage } from '@/lib/utils/processStages';
import {
  serverUpdateContact,
  serverCreateContact,
  serverUpdateContactStatus,
  serverUpdateContactProcessStage,
  serverGetCompany,
  serverGetContact,
  serverGetContactTimeline,
  serverGetContactTimelineForSession,
  serverToggleUrgent,
  serverAddWorkerNote,
  serverDeleteWorkerNote,
  serverBatchStartDelivery,
  serverBatchCompleteDelivery,
  serverSplitContact,
  serverToggleStageCompleted,
  serverAdvanceSplitGroupStage,
  serverCompleteLaserOnlyContact,
  type StageTransitionError,
  type DeliveryProofFileMetadata,
} from '@/lib/api/nestjs-server-client';
import { getSessionUser } from '@/lib/auth/session';
import { getErpWorkerSession } from '@/lib/auth/erp-session';

const contactsLogger = logger.createLogger('CONTACTS_ACTIONS');
const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';

interface ContactDriveFileUploadInput {
  attachment?: File | null;
  drawingFile?: File | null;
  referencePhotos?: File[];
}

async function uploadCreatedContactFilesToDrive(
  contactId: string,
  input: ContactDriveFileUploadInput
): Promise<{ success: boolean; error?: string }> {
  const formData = new FormData();
  let fileCount = 0;

  if (input.attachment && input.attachment.size > 0) {
    formData.append('attachment', input.attachment, input.attachment.name);
    fileCount += 1;
  }

  if (input.drawingFile && input.drawingFile.size > 0) {
    formData.append('drawing_file', input.drawingFile, input.drawingFile.name);
    fileCount += 1;
  }

  for (const file of input.referencePhotos ?? []) {
    if (file.size <= 0) continue;
    formData.append('reference_photos', file, file.name);
    fileCount += 1;
  }

  if (fileCount === 0) {
    return { success: true };
  }

  const response = await fetch(
    `${NESTJS_API_URL}/api/v1/contacts/${encodeURIComponent(contactId)}/files/drive`,
    {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.MIGRATION_API_KEY || '',
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ message: '파일 업로드 실패' }));
    const message =
      typeof errorData === 'object' &&
      errorData !== null &&
      'message' in errorData &&
      typeof errorData.message === 'string'
        ? errorData.message
        : '파일 업로드 실패';
    return { success: false, error: message };
  }

  return { success: true };
}

type SessionUser = NonNullable<Awaited<ReturnType<typeof getSessionUser>>>;
type AuthorizedActor = { actorType: 'admin' | 'worker'; actorName: string };
type ForwardedCookie = { name: string; value: string };

const WORKER_MUTATION_COOKIES = ['erp-session', 'csrf-token'] as const;
const ADMIN_MUTATION_COOKIES = ['admin-session', 'csrf-token'] as const;

async function buildWorkflowMutationHeaders(
  actor: AuthorizedActor
): Promise<Record<string, string>> {
  const cookieStore = await cookies();
  const cookieNames =
    actor.actorType === 'worker' ? WORKER_MUTATION_COOKIES : ADMIN_MUTATION_COOKIES;
  const forwardedCookies = cookieNames
    .map((name) => cookieStore.get(name))
    .filter((cookie): cookie is ForwardedCookie => Boolean(cookie?.name && cookie.value));

  let csrfToken = cookieStore.get('csrf-token')?.value;
  const hasSessionCookie = forwardedCookies.some((cookie) => cookie.name !== 'csrf-token');
  if (hasSessionCookie && !csrfToken) {
    csrfToken = crypto.randomBytes(32).toString('hex');
    forwardedCookies.push({ name: 'csrf-token', value: csrfToken });
  }

  const headers: Record<string, string> = {};
  if (forwardedCookies.length > 0) {
    headers.Cookie = buildForwardedCookieHeader(forwardedCookies);
  }
  if (csrfToken) {
    headers['X-CSRF-Token'] = csrfToken;
  }
  return headers;
}

function getRecordCompanyName(record: Record<string, unknown> | null | undefined): string | null {
  if (!record) return null;

  const value = record.company_name ?? record.companyName;
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function getSessionCompanyName(user: SessionUser): Promise<string | null> {
  if (user.userType !== 'company') return null;

  const companyId = Number(user.userId);
  if (!Number.isFinite(companyId)) return null;

  const company = await serverGetCompany(companyId);
  return getRecordCompanyName(company as Record<string, unknown> | null);
}

/**
 * 현재 세션에서 actor 정보 추출 (작업자 PIN 세션 우선, 없으면 관리자/업체 세션)
 */
async function getActorFromSession(): Promise<AuthorizedActor | undefined> {
  const workerSession = await getErpWorkerSession();
  if (workerSession) {
    return { actorType: 'worker', actorName: workerSession.workerName };
  }
  const sessionUser = await getSessionUser();
  if (sessionUser?.userType === 'admin') {
    return { actorType: 'admin', actorName: String(sessionUser.userId) };
  }
  return undefined;
}

function unauthorizedActionResult(error = '인증이 필요합니다.') {
  return { success: false, error };
}

/**
 * 공정 단계 업데이트
 * 백엔드 API가 상태 변경 로직을 통합 처리하므로 단일 호출로 충분.
 *
 * error 는 string 또는 `{ code, message, statusCode }` (422 구조화 에러) 양쪽을
 * 반환할 수 있다. 호출부는 `mapStageTransitionError` 로 양쪽을 통일 처리.
 */
export async function updateProcessStage(
  contactId: string,
  processStage: ProcessStage
): Promise<{ success: boolean; error?: string | StageTransitionError }> {
  'use server';

  try {
    const actor = await getActorFromSession();
    if (!actor) return unauthorizedActionResult();

    // 공정 단계 변경 (백엔드에서 상태 자동 업데이트 포함)
    const stageResult = await serverUpdateContactProcessStage(contactId, processStage, actor);
    if (!stageResult.success) {
      contactsLogger.error('Failed to update process stage', { error: stageResult.error });
      return { success: false, error: stageResult.error };
    }

    revalidatePath('/admin/contacts');
    revalidatePath(`/admin/contacts/${contactId}`);
    revalidatePath('/company/dashboard');

    contactsLogger.debug('Process stage updated successfully', {
      contactId,
      processStage,
    });
    return { success: true };
  } catch (error) {
    contactsLogger.error('Exception updating process stage', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 납품 시작 (작업자가 "납품" 버튼 클릭 시 호출)
 * status를 'delivered'로 변경하고 updated_at 갱신 → 30분 카운트다운 시작
 * 백엔드에서 상태 검증을 수행하므로 사전 GET 호출 불필요
 */
export async function startDelivery(contactId: string) {
  'use server';

  try {
    const actor = await getActorFromSession();
    if (!actor) return unauthorizedActionResult();

    // 전용 API로 상태 변경 (백엔드에서 조건 검증 + 타임라인 기록)
    const result = await serverUpdateContactStatus(contactId, 'delivered', actor);

    if (!result.success) {
      contactsLogger.error('Failed to start delivery', { error: result.error });
      return { success: false, error: result.error };
    }

    revalidatePath('/admin/contacts');
    return { success: true };
  } catch (error) {
    contactsLogger.error('Exception starting delivery', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 레이저 전용 문의 완료 처리
 * inquiry_type='laser_cutting' 문의를 completed 상태로 전환
 */
export async function completeLaserOnly(contactId: string) {
  'use server';

  try {
    const actor = await getActorFromSession();
    if (!actor) return unauthorizedActionResult();

    const result = await serverCompleteLaserOnlyContact(contactId, actor);

    if (!result.success) {
      contactsLogger.error('Failed to complete laser-only contact', { error: result.error });
      return { success: false, error: result.error };
    }

    revalidatePath('/admin/contacts');
    revalidatePath('/company/dashboard');

    contactsLogger.debug('Laser-only contact completed', { contactId });
    return { success: true };
  } catch (error) {
    contactsLogger.error('Exception completing laser-only contact', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 납품 자동완료 (납품 시작 후 30분 경과 시 호출)
 * processStage를 null로 설정하여 작업자 목록에서 제거
 * updateProcessStage 전용 엔드포인트를 사용하여 타임라인 기록 보장
 */
export async function completeDelivery(contactId: string) {
  'use server';

  try {
    const result = await serverUpdateContactProcessStage(contactId, null, {
      actorType: 'system',
      actorName: '자동완료',
    });

    if (!result.success) {
      contactsLogger.error('Failed to complete delivery', { error: result.error });
      return { success: false, error: result.error };
    }

    revalidatePath('/admin/contacts');
    return { success: true };
  } catch (error) {
    contactsLogger.error('Exception completing delivery', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 일괄 납품 시작 (여러 건을 한 번에 납품 처리)
 */
export async function batchStartDelivery(
  contactIds: string[],
  deliveryProofImage?: string,
  deliveryProofFile?: DeliveryProofFileMetadata
): Promise<{
  success: boolean;
  results?: Array<{ contactId: string; success: boolean; error?: string }>;
  error?: string;
}> {
  'use server';

  try {
    const actor = await getActorFromSession();
    if (!actor) return unauthorizedActionResult();

    const result = await serverBatchStartDelivery(
      contactIds,
      deliveryProofImage,
      actor,
      deliveryProofFile
    );

    if (!result.success) {
      contactsLogger.error('Failed to batch start delivery', { error: result.error });
      return { success: false, error: result.error };
    }

    revalidatePath('/admin/contacts');
    revalidatePath('/worker/dashboard');
    revalidatePath('/worker/delivery');
    revalidatePath('/worker/delivered');
    revalidatePath('/company/dashboard');

    return { success: true, results: result.results };
  } catch (error) {
    contactsLogger.error('Exception in batch start delivery', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 납품증빙 파일을 Google Drive 문의폴더에 직접 저장하면서 일괄 납품 완료 처리
 */
export async function batchStartDeliveryWithProofFile(formData: FormData): Promise<{
  success: boolean;
  results?: Array<{ contactId: string; success: boolean; error?: string }>;
  error?: string;
}> {
  'use server';

  try {
    const actor = await getActorFromSession();
    if (!actor) return unauthorizedActionResult();

    const file = formData.get('file') as File | null;
    const contactIdsRaw = formData.get('contactIds');
    if (!file || file.size === 0) {
      return { success: false, error: '납품증빙 파일이 없습니다.' };
    }
    if (file.size > FILE_SIZE_LIMITS.REFERENCE_PHOTO) {
      return { success: false, error: '파일 크기가 너무 큽니다. (최대 10MB)' };
    }
    if (typeof contactIdsRaw !== 'string') {
      return { success: false, error: '납품 처리 대상이 없습니다.' };
    }

    const backendForm = new FormData();
    backendForm.append('contactIds', contactIdsRaw);
    backendForm.append('actorType', actor.actorType);
    backendForm.append('actorName', actor.actorName);
    backendForm.append('file', file, file.name);

    const response = await fetch(
      `${NESTJS_API_URL}/api/v1/contacts/batch-start-delivery/drive-proof`,
      {
        method: 'POST',
        headers: await buildWorkflowMutationHeaders(actor),
        body: backendForm,
      }
    );

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ message: '납품 완료 실패' }));
      const message =
        typeof errorData === 'object' &&
        errorData !== null &&
        'message' in errorData &&
        typeof errorData.message === 'string'
          ? errorData.message
          : `API error: ${response.status}`;
      return { success: false, error: message };
    }

    const data = (await response.json()) as {
      results?: Array<{ contactId: string; success: boolean; error?: string }>;
    };

    revalidatePath('/admin/contacts');
    revalidatePath('/worker/dashboard');
    revalidatePath('/worker/delivery');
    revalidatePath('/worker/delivered');
    revalidatePath('/company/dashboard');

    return { success: true, results: data.results };
  } catch (error) {
    contactsLogger.error('Exception in batch start delivery with proof file', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 일괄 납품 완료 (delivering → delivered)
 */
export async function batchCompleteDelivery(
  contactIds: string[],
  deliveryCompleteImage?: string
): Promise<{
  success: boolean;
  results?: Array<{ contactId: string; success: boolean; error?: string }>;
  error?: string;
}> {
  'use server';

  try {
    const actor = await getActorFromSession();
    if (!actor) return unauthorizedActionResult();

    const result = await serverBatchCompleteDelivery(contactIds, deliveryCompleteImage, actor);

    if (!result.success) {
      contactsLogger.error('Failed to batch complete delivery', { error: result.error });
      return { success: false, error: result.error };
    }

    revalidatePath('/admin/contacts');
    revalidatePath('/worker/dashboard');
    revalidatePath('/worker/delivery');

    return { success: true, results: result.results };
  } catch (error) {
    contactsLogger.error('Exception in batch complete delivery', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 문의 타임라인 조회
 */
export async function getContactTimeline(contactId: string) {
  try {
    const sessionUser = await getSessionUser();
    if (sessionUser?.userType === 'company') {
      const [sessionCompanyName, contact] = await Promise.all([
        getSessionCompanyName(sessionUser),
        serverGetContact(contactId),
      ]);

      if (!sessionCompanyName || getRecordCompanyName(contact) !== sessionCompanyName) {
        return { success: false, data: [] };
      }

      const timeline = await serverGetContactTimelineForSession(contactId);
      return { success: true, data: timeline };
    }

    const timeline = await serverGetContactTimeline(contactId);
    return { success: true, data: timeline };
  } catch (error) {
    contactsLogger.error('Failed to fetch timeline', error);
    return { success: false, data: [] };
  }
}

/**
 * 작업자 메모/이슈 보고 저장
 */
export async function saveWorkerMemo(
  contactId: string,
  data: { memo: string; isIssue: boolean; workerName: string }
) {
  'use server';

  try {
    const actor = await getActorFromSession();
    if (!actor) return unauthorizedActionResult();

    const result = await serverUpdateContact(contactId, {
      workerMemo: data.memo,
      workerIssue: data.isIssue,
      workerMemoBy: actor.actorName,
    });

    if (!result.success) {
      contactsLogger.error('Failed to save worker memo', { error: result.error });
      return { success: false, error: result.error };
    }

    revalidatePath('/worker/dashboard');
    return { success: true };
  } catch (error) {
    contactsLogger.error('Exception saving worker memo', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 긴급 토글
 */
export async function toggleContactUrgent(contactId: string) {
  'use server';

  try {
    const actor = await getActorFromSession();
    if (!actor) return unauthorizedActionResult();

    const result = await serverToggleUrgent(contactId, actor);
    if (!result.success) {
      contactsLogger.error('Failed to toggle urgent', { error: result.error });
      return { success: false, error: result.error };
    }
    revalidatePath('/worker/dashboard');
    return { success: true, data: result.data };
  } catch (error) {
    contactsLogger.error('Exception toggling urgent', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 작업자 노트 추가
 */
export async function addWorkerNote(
  contactId: string,
  data: { type: string; content: string; workerName: string }
) {
  'use server';

  try {
    const actor = await getActorFromSession();
    if (!actor) return unauthorizedActionResult();

    const result = await serverAddWorkerNote(
      contactId,
      {
        type: data.type,
        content: data.content,
        createdBy: actor.actorName,
      },
      actor
    );
    if (!result.success) {
      contactsLogger.error('Failed to add worker note', { error: result.error });
      return { success: false, error: result.error };
    }
    revalidatePath('/worker/dashboard');
    revalidatePath('/company/dashboard');
    return { success: true, data: result.data };
  } catch (error) {
    contactsLogger.error('Exception adding worker note', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 작업자 노트 삭제
 */
export async function deleteWorkerNoteAction(contactId: string, noteId: number) {
  'use server';

  try {
    const actor = await getActorFromSession();
    if (!actor) return unauthorizedActionResult();

    const result = await serverDeleteWorkerNote(contactId, noteId, actor);
    if (!result.success) {
      contactsLogger.error('Failed to delete worker note', { error: result.error });
      return { success: false, error: result.error };
    }
    revalidatePath('/worker/dashboard');
    return { success: true };
  } catch (error) {
    contactsLogger.error('Exception deleting worker note', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 문의 분할
 */
export async function splitContact(
  id: string,
  data: { count: number; items?: Array<{ subject?: string; description?: string }> }
) {
  'use server';

  try {
    const actor = await getActorFromSession();
    if (!actor) return unauthorizedActionResult();

    const result = await serverSplitContact(id, data);

    if (!result.success) {
      contactsLogger.error('Failed to split contact', { error: result.error });
      return { success: false, error: result.error };
    }

    revalidatePath('/admin/contacts');

    return { success: true, data: result.data };
  } catch (error) {
    contactsLogger.error('Exception splitting contact', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 단계 완료 체크 토글
 */
export async function toggleStageCompleted(id: string, stageCompleted: boolean) {
  'use server';

  try {
    const actor = await getActorFromSession();
    if (!actor) return unauthorizedActionResult();

    const result = await serverToggleStageCompleted(id, { stageCompleted }, actor);

    if (!result.success) {
      contactsLogger.error('Failed to toggle stage completed', { error: result.error });
      return { success: false, error: result.error };
    }

    revalidatePath('/admin/contacts');

    return { success: true, data: result.data };
  } catch (error) {
    contactsLogger.error('Exception toggling stage completed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 그룹 일괄 다음 단계 이동
 */
export async function advanceSplitGroupStage(
  parentId: string,
  nextStage: string,
  forceComplete?: boolean
) {
  'use server';

  try {
    const actor = await getActorFromSession();
    if (!actor) return unauthorizedActionResult();

    const result = await serverAdvanceSplitGroupStage(parentId, {
      nextStage,
      forceComplete,
      ...actor,
    });

    if (!result.success) {
      contactsLogger.error('Failed to advance split group stage', { error: result.error });
      return { success: false, error: result.error };
    }

    revalidatePath('/admin/contacts');
    revalidatePath('/company/dashboard');

    return { success: true, data: result.data };
  } catch (error) {
    contactsLogger.error('Exception advancing split group stage', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * 문의 폼 데이터 인터페이스
 */
export interface ContactFormData {
  inquiry_title: string;
  company_name: string;
  name: string;
  position: string;
  phone: string;
  email: string;
  referral_source?: string;
  // 도면 및 샘플
  drawing_type?: string;
  has_physical_sample?: boolean;
  has_reference_photos?: boolean;
  drawing_modification?: string;
  box_shape?: string;
  length?: string;
  width?: string;
  height?: string;
  material?: string;
  drawing_notes?: string;
  sample_notes?: string;
  // 일정 조율
  receipt_method?: string;
  visit_date?: string;
  visit_time_slot?: string;
  delivery_type?: string;
  delivery_address?: string;
  delivery_name?: string;
  delivery_phone?: string;
  attachment?: File | null;
}
export async function submitContact(formData: FormData) {
  'use server';

  // 폼 데이터 추출 및 검증
  const raw_inquiry_title = String(formData.get('inquiry_title') || '').trim();
  const form_company_name = String(formData.get('company_name') || '').trim();
  // 업체명 자동 접두사: "업체명 문의명" 형태로 저장 (중복 방지)
  const inquiry_title = raw_inquiry_title.startsWith(form_company_name)
    ? raw_inquiry_title
    : `${form_company_name} ${raw_inquiry_title}`.trim();
  const contact_type = String(formData.get('contact_type') || 'company').trim();
  const service_mold_request =
    formData.get('service_mold_request') === '1' || formData.get('service_mold_request') === 'true';
  const service_delivery_brokerage =
    formData.get('service_delivery_brokerage') === '1' ||
    formData.get('service_delivery_brokerage') === 'true';
  const company_name = String(formData.get('company_name') || '').trim();
  let name = String(formData.get('name') || '').trim();
  let position = String(formData.get('position') || '').trim();
  const phone = String(formData.get('phone') || '').trim();
  const email = String(formData.get('email') || '').trim();
  const referral_source = String(formData.get('referral_source') || '').trim();

  // 도면 및 샘플 필드
  const drawing_type = String(formData.get('drawing_type') || '').trim();
  const has_physical_sample =
    formData.get('has_physical_sample') === 'true' || formData.get('has_physical_sample') === '1';
  const has_reference_photos =
    formData.get('has_reference_photos') === 'true' || formData.get('has_reference_photos') === '1';
  const drawing_modification = String(formData.get('drawing_modification') || '').trim();
  const box_shape = String(formData.get('box_shape') || '').trim();
  const length = String(formData.get('length') || '').trim();
  const width = String(formData.get('width') || '').trim();
  const height = String(formData.get('height') || '').trim();
  const material = String(formData.get('material') || '').trim();
  const drawing_notes = String(formData.get('drawing_notes') || '').trim();
  const sample_notes = String(formData.get('sample_notes') || '').trim();

  // 일정 조율 필드
  const receipt_method_raw = formData.get('receipt_method');
  const visit_location_raw = formData.get('visit_location');
  const visit_date_raw = formData.get('visit_date');
  const visit_time_slot_raw = formData.get('visit_time_slot');
  const delivery_type_raw = formData.get('delivery_type');
  const delivery_address_raw = formData.get('delivery_address');
  const delivery_name_raw = formData.get('delivery_name');
  const delivery_phone_raw = formData.get('delivery_phone');

  // 납품업체 필드 (drawing_type === 'have'일 때)
  const delivery_method_raw = formData.get('delivery_method');
  const delivery_company_name_raw = formData.get('delivery_company_name');
  const delivery_company_phone_raw = formData.get('delivery_company_phone');
  const delivery_company_address_raw = formData.get('delivery_company_address');

  // 포트폴리오 참고 정보
  const portfolio_reference_url_raw = formData.get('portfolio_reference_url');
  const portfolio_reference_info_raw = formData.get('portfolio_reference_info');

  // 빈 문자열이나 null을 null로 변환 (빈 문자열도 null로 처리)
  const receipt_method =
    receipt_method_raw && String(receipt_method_raw).trim()
      ? String(receipt_method_raw).trim()
      : null;
  const visit_location =
    visit_location_raw && String(visit_location_raw).trim()
      ? String(visit_location_raw).trim()
      : null;
  const visit_date =
    visit_date_raw && String(visit_date_raw).trim() ? String(visit_date_raw).trim() : null;
  const visit_time_slot =
    visit_time_slot_raw && String(visit_time_slot_raw).trim()
      ? String(visit_time_slot_raw).trim()
      : null;
  const delivery_type =
    delivery_type_raw && String(delivery_type_raw).trim() ? String(delivery_type_raw).trim() : null;
  const delivery_address =
    delivery_address_raw && String(delivery_address_raw).trim()
      ? String(delivery_address_raw).trim()
      : null;
  const delivery_name =
    delivery_name_raw && String(delivery_name_raw).trim() ? String(delivery_name_raw).trim() : null;
  const delivery_phone =
    delivery_phone_raw && String(delivery_phone_raw).trim()
      ? String(delivery_phone_raw).trim()
      : null;

  // 납품업체 정보 처리
  const delivery_method =
    delivery_method_raw && String(delivery_method_raw).trim()
      ? String(delivery_method_raw).trim()
      : null;
  const delivery_company_name =
    delivery_company_name_raw && String(delivery_company_name_raw).trim()
      ? String(delivery_company_name_raw).trim()
      : null;
  const delivery_company_phone =
    delivery_company_phone_raw && String(delivery_company_phone_raw).trim()
      ? String(delivery_company_phone_raw).trim()
      : null;
  const delivery_company_address =
    delivery_company_address_raw && String(delivery_company_address_raw).trim()
      ? String(delivery_company_address_raw).trim()
      : null;

  // 포트폴리오 참고 정보 처리
  const portfolio_reference_url =
    portfolio_reference_url_raw && String(portfolio_reference_url_raw).trim()
      ? String(portfolio_reference_url_raw).trim()
      : null;
  let portfolio_reference_info: {
    id: string | number;
    title: string;
    field?: string;
    type?: string;
    format?: string;
    size?: string;
    paper?: string;
    printing?: string;
    finishing?: string;
    imageUrl?: string;
  } | null = null;
  if (portfolio_reference_info_raw && String(portfolio_reference_info_raw).trim()) {
    try {
      portfolio_reference_info = JSON.parse(String(portfolio_reference_info_raw).trim());
    } catch {
      contactsLogger.warn('Failed to parse portfolio_reference_info');
    }
  }

  // 파일 업로드 필드
  const attachment = formData.get('attachment') as File | null;
  const drawing_file = formData.get('drawing_file') as File | null;
  const reference_photos = formData.getAll('reference_photos') as File[];

  // 개인일 때는 name을 company_name과 동일하게 처리
  if (contact_type === 'individual') {
    name = company_name;
    if (!position || position === '') {
      position = '개인';
    }
  }

  // 필수 필드 검증
  // 개인일 때는 name과 position이 자동으로 설정되므로 company_name만 확인
  const isIndividual = contact_type === 'individual';
  if (
    !inquiry_title ||
    !company_name ||
    (!isIndividual && (!name || !position)) ||
    !phone ||
    !email
  ) {
    redirect('/contact?error=invalid');
  }

  // 개인일 때는 name과 position을 다시 확인 (서버에서 설정한 값)
  if (isIndividual && (!name || !position)) {
    redirect('/contact?error=invalid');
  }

  // 이메일 형식 검증
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    redirect('/contact?error=invalid_email');
  }

  // 파일 크기 검증 (빠른 검증)
  if (attachment && attachment.size > FILE_SIZE_LIMITS.ATTACHMENT) {
    return {
      success: false,
      error: `첨부 파일 크기가 너무 큽니다. (최대 ${FILE_SIZE_LIMITS.ATTACHMENT / 1024 / 1024}MB)`,
    };
  }
  if (drawing_file && drawing_file.size > FILE_SIZE_LIMITS.DRAWING) {
    return {
      success: false,
      error: `도면 파일 크기가 너무 큽니다. (최대 ${FILE_SIZE_LIMITS.DRAWING / 1024 / 1024}MB)`,
    };
  }
  const oversizedPhoto = reference_photos.find(
    (p) => p && p.size > FILE_SIZE_LIMITS.REFERENCE_PHOTO
  );
  if (oversizedPhoto) {
    return {
      success: false,
      error: `참고 사진 크기가 너무 큽니다. (최대 ${FILE_SIZE_LIMITS.REFERENCE_PHOTO / 1024 / 1024}MB)`,
    };
  }

  const contactData: ContactFormData = {
    inquiry_title,
    company_name,
    name,
    position,
    phone,
    email,
    referral_source: referral_source || undefined,
    drawing_type: drawing_type || undefined,
    has_physical_sample: has_physical_sample || undefined,
    has_reference_photos: has_reference_photos || undefined,
    drawing_modification: drawing_modification || undefined,
    box_shape: box_shape || undefined,
    length: length || undefined,
    width: width || undefined,
    height: height || undefined,
    material: material || undefined,
    drawing_notes: drawing_notes || undefined,
    sample_notes: sample_notes || undefined,
    receipt_method: receipt_method || undefined,
    visit_date: visit_date || undefined,
    visit_time_slot: visit_time_slot || undefined,
    delivery_type: delivery_type || undefined,
    delivery_address: delivery_address || undefined,
    delivery_name: delivery_name || undefined,
    delivery_phone: delivery_phone || undefined,
    attachment,
  };

  try {
    // inquiry_number는 서버(NumberService)가 자동 생성 — 클라이언트에서 전달하지 않음

    // 저장할 데이터 준비 (유틸리티 함수 사용)
    const insertData = prepareContactInsertData(contactData, {
      contact_type,
      service_mold_request,
      service_delivery_brokerage,
      receipt_method,
      visit_location,
      visit_date,
      visit_time_slot,
      delivery_type,
      delivery_address,
      delivery_name,
      delivery_phone,
      delivery_method,
      delivery_company_name,
      delivery_company_phone,
      delivery_company_address,
      attachmentFilename: undefined,
      attachmentUrl: undefined,
      drawingFileUrl: undefined,
      drawingFileName: undefined,
      referencePhotosUrls: [],
      // 포트폴리오 참고 정보
      portfolioReferenceUrl: portfolio_reference_url,
      portfolioReferenceInfo: portfolio_reference_info,
    });

    // NestJS API로 contacts 생성
    const createResult = await serverCreateContact(
      insertData as unknown as Record<string, unknown>
    );
    const insertedData = createResult.success && createResult.data ? [createResult.data] : null;
    const dbError = createResult.success
      ? null
      : { message: createResult.error || 'Unknown error' };

    if (dbError) {
      contactsLogger.error('Database insert error via NestJS API', {
        message: dbError.message,
        insertData,
      });
    }

    const createdContactId =
      !dbError && insertedData && insertedData.length > 0
        ? String((insertedData[0] as { id: string | number }).id)
        : null;

    let fileUploadError: string | undefined;
    if (createdContactId) {
      const fileUploadResult = await uploadCreatedContactFilesToDrive(createdContactId, {
        attachment,
        drawingFile: drawing_file,
        referencePhotos: reference_photos,
      });
      if (!fileUploadResult.success) {
        fileUploadError = fileUploadResult.error ?? '파일 업로드 실패';
        contactsLogger.error('Contact file Drive upload failed after contact creation', {
          contactId: createdContactId,
          error: fileUploadError,
        });
      }
    }

    // 방문 예약인 경우 예약 생성 (contact 생성 성공 후)
    //
    // hotfix v2 (task 23 R5): 직전 round 에서 admin /admin/bookings 에 예약이 보이지
    // 않고 폼 슬롯의 자리수가 갱신되지 않는다는 제보가 있었지만, contact 자체가 booking
    // 생성 분기에 도달했는지/실패했는지 사용자가 확인할 방법이 silent 로그뿐이었다.
    // 진단성 fix 로 booking 생성 결과(bookingCreated/bookingError) 를 응답에 포함시켜
    // ContactForm 이 사용자에게 명시적으로 노출하도록 한다. 또한 슬롯 정원 비교를
    // 하드코딩 (>= 2) 대신 NestJS 응답의 maxCapacity 로 일치시킨다.
    let bookingCreated = false;
    let bookingError: string | undefined;
    if (
      !dbError &&
      insertedData &&
      insertedData.length > 0 &&
      createdContactId &&
      receipt_method === 'visit' &&
      visit_date &&
      visit_time_slot &&
      company_name
    ) {
      try {
        // visit_bookings는 NestJS API 경유
        const { serverGetAvailableSlots, serverCreateBooking } =
          await import('@/lib/api/nestjs-server-client');
        // 예약 가능 여부 확인
        const slotsInfo = await serverGetAvailableSlots(visit_date);
        const slotCount = slotsInfo.slotCounts[visit_time_slot] || 0;
        const slotMaxCapacity = slotsInfo.maxCapacity ?? 2;

        if (slotCount >= slotMaxCapacity) {
          bookingError = `해당 시간대는 이미 예약이 가득 찼습니다. (${slotCount}/${slotMaxCapacity})`;
          contactsLogger.warn('Booking slot is full, skipping booking creation', {
            visit_date,
            visit_time_slot,
            slotCount,
            slotMaxCapacity,
          });
        } else {
          // 예약 생성
          const bookingResult = await serverCreateBooking({
            visitDate: visit_date,
            visitTimeSlot: visit_time_slot,
            companyName: company_name,
            contactId: createdContactId,
            createdBy: 'company',
          });

          if (!bookingResult.success) {
            bookingError = `예약 생성 실패: ${bookingResult.error ?? '알 수 없는 오류'}`;
            contactsLogger.error('Error creating booking', {
              error: bookingResult.error,
              visit_date,
              visit_time_slot,
              company_name,
              contactId: createdContactId,
            });
          } else {
            bookingCreated = true;
            contactsLogger.info('Booking created successfully', {
              contactId: createdContactId,
              visit_date,
              visit_time_slot,
            });
          }
        }
      } catch (bookingErr) {
        bookingError = `예약 생성 중 오류: ${bookingErr instanceof Error ? bookingErr.message : String(bookingErr)}`;
        contactsLogger.error('Exception while creating booking', {
          error: bookingErr,
          visit_date,
          visit_time_slot,
          company_name,
          contactId: createdContactId,
        });
        // 예약 생성 실패해도 문의는 저장
      }
    }

    // DB 저장 실패 시 처리 (이메일 알림은 NestJS에서 처리)
    if (dbError) {
      return {
        success: false,
        error: '데이터베이스 저장에 실패했습니다.',
      };
    }

    contactsLogger.info('Contact saved successfully');

    // Integration Order 자동 생성 (문의 = 주문 1:1)
    if (insertedData && insertedData.length > 0) {
      const contactId = insertedData[0].id;
      const inquiryNumber = (insertedData[0] as Record<string, unknown>).inquiry_number as
        | string
        | null;
      try {
        const apiUrl = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';
        const apiKey = process.env.INTEGRATION_API_KEY;

        if (apiKey) {
          const orderResponse = await fetch(`${apiUrl}/api/v1/integration/orders`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-API-Key': apiKey,
            },
            body: JSON.stringify({
              contactId: contactId,
              inquiryNumber: inquiryNumber,
              companyName: company_name,
              customerName: name,
              customerPhone: phone,
              title: inquiry_title,
              description: drawing_notes || sample_notes || undefined,
              deliveryMethod: delivery_method || delivery_type || undefined,
              deliveryAddress: delivery_address || delivery_company_address || undefined,
            }),
          });

          if (orderResponse.ok) {
            contactsLogger.info(`Integration Order 자동 생성 완료 (contactId: ${contactId})`);
          } else {
            contactsLogger.warn(`Integration Order 생성 실패: ${orderResponse.status}`);
          }
        } else {
          contactsLogger.debug('INTEGRATION_API_KEY not set, skipping order creation');
        }
      } catch (orderError) {
        contactsLogger.warn('Integration Order 생성 중 오류 (non-blocking)', orderError);
        // Order 생성 실패해도 문의 저장은 성공으로 처리
      }
    }

    // 로그인 여부 확인 (업체 대시보드로 리다이렉트하기 위해)
    const { getSessionUser } = await import('@/lib/auth/session');
    const user = await getSessionUser();

    // 로그인되어 있고 업체 사용자인 경우 리다이렉트 URL 반환
    // hotfix v2 (task 23 R5): bookingCreated/bookingError 를 함께 노출해 사용자가
    // contact 저장 성공 + booking 생성 결과를 분리 인지하도록 한다.
    if (user && user.userType === 'company') {
      return {
        success: true,
        redirectUrl: '/company/dashboard',
        bookingCreated,
        bookingError,
        fileUploadError,
      };
    }

    return { success: true, bookingCreated, bookingError, fileUploadError };
  } catch (error) {
    // Next.js redirect 에러는 다시 throw
    if (
      error instanceof Error &&
      (error.message === 'NEXT_REDIRECT' ||
        (error as { digest?: string }).digest?.startsWith('NEXT_REDIRECT'))
    ) {
      throw error;
    }

    contactsLogger.error('Exception', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}

/**
 * @deprecated 납품증빙은 `batchStartDeliveryWithProofFile`로 문의 Drive 폴더에 직접 저장한다.
 */
export async function uploadDeliveryProofImage(
  formData: FormData
): Promise<{ success: boolean; url?: string; file?: DeliveryProofFileMetadata; error?: string }> {
  'use server';

  try {
    const file = formData.get('file') as File | null;
    if (!file || file.size === 0) {
      return { success: false, error: '파일이 없습니다.' };
    }

    if (file.size > FILE_SIZE_LIMITS.REFERENCE_PHOTO) {
      return { success: false, error: '파일 크기가 너무 큽니다. (최대 10MB)' };
    }

    return {
      success: false,
      error: '납품증빙은 납품완료 처리와 함께 Drive 문의폴더에 직접 저장해야 합니다.',
    };
  } catch (error) {
    contactsLogger.error('Delivery proof image upload failed', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.',
    };
  }
}
