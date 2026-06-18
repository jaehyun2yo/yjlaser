/** Contacts and drawing NestJS server-side client functions. */

import {
  getNestjsClientDiagnostics,
  nestjsFetch,
  nestjsLogger,
  type NestJSRequestOptions,
} from './core.client';
import { AppError } from '@/lib/utils/errors';
import type { DrawingRevision, DrawingRevisionFile, TimelineItem } from '@/lib/types/contact';
// ============ Contacts API ============

export interface ContactQueryParams {
  status?: string;
  page?: number;
  limit?: number;
  search?: string;
  processStages?: string;
  workCategory?: string;
  inquiryType?: string;
  companyName?: string;
  companyNames?: string;
  dateFrom?: string;
  dateTo?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  includeWorkerNotes?: boolean;
  includeTimeline?: boolean;
}

export interface ContactsListResponse {
  contacts: Record<string, unknown>[];
  totalCount: number;
  hasMore: boolean;
  statusCounts?: Record<string, number>;
}

type ContactMutationActor = { actorType: string; actorName: string };
type ServerSessionAuthMode = 'apiKey' | 'session' | 'workerSession';
type ServerSessionAuthOptions = { authMode?: ServerSessionAuthMode };

export interface ServerFileDownloadResult {
  url: string;
  fileName: string;
  provider?: 'R2' | 'GOOGLE_DRIVE';
  fileId?: string;
}

export interface DrawingRevisionUploadUrl {
  uploadUrl: string;
  key: string;
  fileName: string;
  provider?: 'R2' | 'GOOGLE_DRIVE';
  driveFileId?: string;
  uploadHeaders?: Record<string, string>;
}

function mutationAuthOptionsForActor(
  actor?: ContactMutationActor
): Pick<NestJSRequestOptions, 'useApiKey' | 'forwardedCookieNames'> {
  if (actor?.actorType === 'worker') {
    return { forwardedCookieNames: ['erp-session', 'csrf-token'] };
  }
  if (actor?.actorType === 'admin') {
    return {};
  }
  return { useApiKey: true };
}

function readAuthOptions(
  authMode: ServerSessionAuthMode = 'session'
): Pick<NestJSRequestOptions, 'useApiKey' | 'forwardedCookieNames'> {
  if (authMode === 'apiKey') {
    return { useApiKey: true };
  }
  if (authMode === 'workerSession') {
    return { forwardedCookieNames: ['erp-session', 'csrf-token'] };
  }
  return {};
}

function responseMessage(data: unknown, fallback: string): string {
  if (data && typeof data === 'object') {
    const record = data as Record<string, unknown>;
    if (typeof record.message === 'string') return record.message;
    if (typeof record.error === 'string') return record.error;
  }
  return fallback;
}

function throwNestjsResponseError(status: number, data: unknown, fallback: string): never {
  const message = responseMessage(data, fallback);
  const code =
    status === 401
      ? 'AUTHENTICATION_ERROR'
      : status === 403
        ? 'AUTHORIZATION_ERROR'
        : status === 404
          ? 'NOT_FOUND'
          : 'NESTJS_API_ERROR';
  throw new AppError(message, code, status);
}

/**
 * 문의 목록 조회 (NestJS API)
 */
export async function serverGetContacts(
  params: ContactQueryParams,
  cacheOptions?: { revalidate?: number; tags?: string[] }
): Promise<ContactsListResponse> {
  const searchParams = new URLSearchParams();
  if (params.status) searchParams.set('status', params.status);
  if (params.page) searchParams.set('page', String(params.page));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.search) searchParams.set('search', params.search);
  if (params.processStages) searchParams.set('processStages', params.processStages);
  if (params.workCategory) searchParams.set('workCategory', params.workCategory);
  if (params.inquiryType) searchParams.set('inquiryType', params.inquiryType);
  if (params.companyName) searchParams.set('companyName', params.companyName);
  if (params.companyNames) searchParams.set('companyNames', params.companyNames);
  if (params.dateFrom) searchParams.set('dateFrom', params.dateFrom);
  if (params.dateTo) searchParams.set('dateTo', params.dateTo);
  if (params.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params.sortOrder) searchParams.set('sortOrder', params.sortOrder);
  if (params.includeWorkerNotes) searchParams.set('includeWorkerNotes', 'true');
  if (params.includeTimeline) searchParams.set('includeTimeline', 'true');

  const query = searchParams.toString();
  const response = await nestjsFetch<ContactsListResponse>(`/contacts${query ? `?${query}` : ''}`, {
    useApiKey: true,
    ...cacheOptions,
  });

  if (!response.ok) {
    const diagnostics = getNestjsClientDiagnostics();
    nestjsLogger.error('serverGetContacts failed', {
      status: response.status,
      url: `${diagnostics.baseUrl}${diagnostics.apiPrefix}/contacts`,
      apiKeySet: diagnostics.apiKeySet,
      data: response.data,
    });
    throw new Error(
      `NestJS API error: ${response.status} — ${typeof response.data === 'object' ? JSON.stringify(response.data) : response.data}`
    );
  }

  return response.data;
}

/**
 * 고유 업체명 목록 조회 (NestJS API)
 */
export async function serverGetDistinctCompanyNames(status?: string): Promise<string[]> {
  const params = status ? `?status=${status}` : '';
  const response = await nestjsFetch<{ companies: string[] }>(
    `/contacts/distinct-companies${params}`,
    { useApiKey: true }
  );

  if (!response.ok) return [];
  return response.data.companies;
}

/**
 * 문의 단건 조회 (NestJS API)
 */
export async function serverGetContact(id: string): Promise<Record<string, unknown> | null> {
  const response = await nestjsFetch<Record<string, unknown>>(`/contacts/${id}`, {
    useApiKey: true,
  });

  if (!response.ok) return null;
  return response.data;
}

/**
 * 문의 통합 타임라인 조회 (ContactStatusHistory + DrawingRevision 인터리브)
 * NestJS `{ timeline: TimelineItem[] }` 래퍼를 벗겨 배열만 반환한다.
 */
export async function serverGetContactTimeline(
  contactId: string,
  cacheOptions?: { revalidate?: number; tags?: string[] }
): Promise<TimelineItem[]> {
  const response = await nestjsFetch<{ timeline: TimelineItem[] }>(
    `/contacts/${contactId}/timeline`,
    { useApiKey: true, ...cacheOptions }
  );
  if (!response.ok) return [];
  return response.data?.timeline || [];
}

/**
 * 현재 browser session cookie로 문의 통합 타임라인 조회.
 * Company-facing Next routes must use this path so NestJS applies its company timeline filters.
 */
export async function serverGetContactTimelineForSession(
  contactId: string
): Promise<TimelineItem[]> {
  const response = await nestjsFetch<{ timeline: TimelineItem[] }>(
    `/contacts/${contactId}/timeline`,
    { cache: 'no-store' }
  );
  if (!response.ok) return [];
  return response.data?.timeline || [];
}

/**
 * 공정별 소요시간 분석
 */
export async function serverGetStageDurationAnalytics(options?: {
  companyName?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<Record<string, unknown>> {
  const params = new URLSearchParams();
  if (options?.companyName) params.set('companyName', options.companyName);
  if (options?.dateFrom) params.set('dateFrom', options.dateFrom);
  if (options?.dateTo) params.set('dateTo', options.dateTo);
  const qs = params.toString();
  const response = await nestjsFetch<Record<string, unknown>>(
    `/contacts/analytics/stage-duration${qs ? `?${qs}` : ''}`,
    { useApiKey: true }
  );
  if (!response.ok) return { stages: [], total_avg_hours: 0, period: { from: null, to: null } };
  return response.data || {};
}

/**
 * 문의 생성 (NestJS API)
 */
export async function serverCreateContact(
  data: Record<string, unknown>
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const response = await nestjsFetch<Record<string, unknown>>('/contacts', {
    method: 'POST',
    body: data,
    useApiKey: true,
  });

  if (!response.ok) {
    return { success: false, error: `API error: ${response.status}` };
  }
  return { success: true, data: response.data };
}

/**
 * 문의 수정 (NestJS API)
 */
export async function serverUpdateContact(
  id: string,
  data: Record<string, unknown>
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const response = await nestjsFetch<Record<string, unknown>>(`/contacts/${id}`, {
    method: 'PATCH',
    body: data,
    useApiKey: true,
  });

  if (!response.ok) {
    return { success: false, error: `API error: ${response.status}` };
  }
  return { success: true, data: response.data };
}

/**
 * 문의 상태 변경 (NestJS API)
 */
export async function serverUpdateContactStatus(
  id: string,
  status: string,
  actor?: ContactMutationActor
): Promise<{ success: boolean; error?: string }> {
  const response = await nestjsFetch<Record<string, unknown>>(`/contacts/${id}/status`, {
    method: 'PATCH',
    body: { status, ...actor },
    ...mutationAuthOptionsForActor(actor),
  });

  if (!response.ok) {
    return { success: false, error: `API error: ${response.status}` };
  }
  return { success: true };
}

/**
 * 문의 공정 단계 변경 시의 구조화 에러 payload.
 * NestJS `UnprocessableEntityException({ code, message })` 응답을 프론트엔드가
 * `code` 기반으로 분기할 수 있도록 가공한 형태.
 */
export interface StageTransitionError {
  code?: string;
  message: string;
  statusCode?: number;
}

/**
 * 문의 공정 단계 변경 (NestJS API)
 *
 * 422 응답은 `{ code, message }` 구조화 에러로 래핑한다. 그 외 오류는 기존 문자열
 * fallback 을 유지하므로 호출부는 string / object 양쪽을 수용해야 한다.
 */
export async function serverUpdateContactProcessStage(
  id: string,
  processStage: string | null,
  actor?: ContactMutationActor
): Promise<{
  success: boolean;
  data?: { id: string; process_stage: string | null; previous_stage: string | null };
  error?: string | StageTransitionError;
}> {
  const response = await nestjsFetch<{
    id: string;
    process_stage: string | null;
    previous_stage: string | null;
  }>(`/contacts/${id}/process-stage`, {
    method: 'PATCH',
    body: { processStage, ...actor },
    ...mutationAuthOptionsForActor(actor),
  });

  if (!response.ok) {
    const body = response.data as unknown;
    // GlobalExceptionFilter 가 보존한 code 필드가 있으면 구조화 에러로 전달.
    if (
      response.status === 422 &&
      typeof body === 'object' &&
      body !== null &&
      'code' in body &&
      typeof (body as { code?: unknown }).code === 'string'
    ) {
      const typed = body as { code: string; message?: unknown };
      return {
        success: false,
        error: {
          code: typed.code,
          message: typeof typed.message === 'string' ? typed.message : '',
          statusCode: 422,
        },
      };
    }
    // 메시지 string 이 있으면 그걸 사용, 아니면 상태코드 문자열.
    const fallbackMessage =
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      typeof (body as { message?: unknown }).message === 'string'
        ? (body as { message: string }).message
        : `API error: ${response.status}`;
    return { success: false, error: fallbackMessage };
  }
  return { success: true, data: response.data };
}

/**
 * 레이저 전용 문의 완료 처리 (NestJS API)
 */
export async function serverCompleteLaserOnlyContact(
  id: string,
  actor?: ContactMutationActor
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const response = await nestjsFetch<Record<string, unknown>>(`/contacts/${id}/complete-laser`, {
    method: 'POST',
    body: { ...actor },
    ...mutationAuthOptionsForActor(actor),
  });

  if (!response.ok) {
    return { success: false, error: `API error: ${response.status}` };
  }
  return { success: true, data: response.data };
}

/**
 * 문의 유형 변경 (NestJS API)
 */
export async function serverUpdateContactInquiryType(
  id: string,
  inquiryType: string,
  actor?: ContactMutationActor
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const response = await nestjsFetch<Record<string, unknown>>(`/contacts/${id}/inquiry-type`, {
    method: 'PATCH',
    body: { inquiryType, ...actor },
    ...mutationAuthOptionsForActor(actor),
  });

  if (!response.ok) {
    return { success: false, error: `API error: ${response.status}` };
  }
  return { success: true, data: response.data };
}

/**
 * 뱃지 확인 (NestJS API)
 */
export async function serverAcknowledgeBadge(
  id: string,
  field: 'booking_changed_at' | 'delivery_method_changed_at'
): Promise<{ success: boolean; error?: string }> {
  const response = await nestjsFetch<{ success: boolean }>(`/contacts/${id}/acknowledge-badge`, {
    method: 'POST',
    body: { field },
    useApiKey: true,
  });

  if (!response.ok) {
    return { success: false, error: `API error: ${response.status}` };
  }
  return { success: true };
}

/**
 * 문의 삭제 (NestJS API)
 */
export async function serverDeleteContact(
  id: string,
  permanent: boolean = false
): Promise<{ success: boolean; error?: string }> {
  const response = await nestjsFetch<{ success: boolean }>(`/contacts/${id}`, {
    method: 'DELETE',
    body: { permanent },
    useApiKey: true,
  });

  if (!response.ok) {
    return { success: false, error: `API error: ${response.status}` };
  }
  return { success: true };
}

/**
 * 문의 복원 (NestJS API)
 */
export async function serverRestoreContact(
  id: string
): Promise<{ success: boolean; error?: string }> {
  const response = await nestjsFetch<{ success: boolean }>(`/contacts/${id}/restore`, {
    method: 'POST',
    useApiKey: true,
  });

  if (!response.ok) {
    return { success: false, error: `API error: ${response.status}` };
  }
  return { success: true };
}

/**
 * 상태별 카운트 (NestJS API)
 */
export async function serverGetContactStatusCounts(
  search?: string
): Promise<Record<string, number> | null> {
  const params = search ? `?search=${encodeURIComponent(search)}` : '';
  const response = await nestjsFetch<Record<string, number>>(`/contacts/status-counts${params}`, {
    useApiKey: true,
  });

  if (!response.ok) return null;
  return response.data;
}

/**
 * 문의 카운트 (NestJS API)
 */
export async function serverGetContactCount(query: {
  status?: string;
  companyName?: string;
  inquiryNumberLike?: string;
  originalFilename?: string;
}): Promise<number> {
  const params = new URLSearchParams();
  if (query.status) params.set('status', query.status);
  if (query.companyName) params.set('companyName', query.companyName);
  if (query.inquiryNumberLike) params.set('inquiryNumberLike', query.inquiryNumberLike);
  if (query.originalFilename) params.set('originalFilename', query.originalFilename);

  const queryStr = params.toString();
  const response = await nestjsFetch<{ count: number }>(
    `/contacts/count${queryStr ? `?${queryStr}` : ''}`,
    { useApiKey: true }
  );

  if (!response.ok) return 0;
  return response.data.count;
}

/**
 * 업체별 문의 목록 (NestJS API)
 */
export async function serverGetContactsByCompany(
  companyName: string,
  options?: { status?: string; limit?: number }
): Promise<Record<string, unknown>[]> {
  const params = new URLSearchParams();
  params.set('companyName', companyName);
  if (options?.status) params.set('status', options.status);
  if (options?.limit) params.set('limit', String(options.limit));

  const response = await nestjsFetch<Record<string, unknown>[]>(
    `/contacts/by-company?${params.toString()}`,
    { useApiKey: true }
  );

  if (!response.ok) return [];
  return response.data;
}

/**
 * 최근 문의 ID 목록 (NestJS API)
 */
export async function serverGetRecentContactIds(limit: number = 100): Promise<string[]> {
  const response = await nestjsFetch<{ ids: string[] }>(`/contacts/recent-ids?limit=${limit}`, {
    useApiKey: true,
  });

  if (!response.ok) return [];
  return response.data.ids;
}

/**
 * 문의 삭제 건 정리 (NestJS API)
 */
export async function serverCleanupContacts(): Promise<{
  success: boolean;
  deletedCount: number;
  error?: string;
}> {
  const response = await nestjsFetch<{ deletedCount: number; message: string }>(
    '/contacts/cleanup',
    { method: 'POST', useApiKey: true }
  );

  if (!response.ok) {
    return { success: false, deletedCount: 0, error: `API error: ${response.status}` };
  }
  return { success: true, deletedCount: response.data.deletedCount };
}

/**
 * 중복 체크 (NestJS API)
 */
export async function serverFindDuplicateContact(
  companyName: string,
  originalFilename: string
): Promise<{ exists: boolean; contactId: string | null }> {
  const response = await nestjsFetch<{ exists: boolean; contactId: string | null }>(
    '/contacts/find-duplicate',
    {
      method: 'POST',
      body: { companyName, originalFilename },
      useApiKey: true,
    }
  );

  if (!response.ok) return { exists: false, contactId: null };
  return response.data;
}

/**
 * 배치 삭제 (테스트용, NestJS API)
 */
export async function serverDeleteTestContacts(
  pattern: string
): Promise<{ success: boolean; deletedCount: number; error?: string }> {
  const response = await nestjsFetch<{ deletedCount: number; message: string }>(
    '/contacts/batch-by-pattern',
    {
      method: 'DELETE',
      body: { pattern },
      useApiKey: true,
    }
  );

  if (!response.ok) {
    return { success: false, deletedCount: 0, error: `API error: ${response.status}` };
  }
  return { success: true, deletedCount: response.data.deletedCount };
}

/**
 * 모든 문의 삭제 (개발 서버 전용, NestJS API)
 */
export async function serverDeleteAllContacts(): Promise<{
  success: boolean;
  deletedCount: number;
  error?: string;
}> {
  const response = await nestjsFetch<{ deletedCount: number; message: string }>(
    '/contacts/delete-all',
    {
      method: 'DELETE',
      useApiKey: true,
    }
  );

  if (!response.ok) {
    return { success: false, deletedCount: 0, error: `API error: ${response.status}` };
  }
  return { success: true, deletedCount: response.data.deletedCount };
}

/**
 * 문의 첨부파일 다운로드 URL (NestJS API)
 */
export async function serverGetDrawingDownloadUrl(
  id: string
): Promise<ServerFileDownloadResult | null> {
  const response = await nestjsFetch<ServerFileDownloadResult>(`/contacts/${id}/drawing-download`, {
    useApiKey: true,
  });

  if (!response.ok) {
    return null;
  }
  return response.data;
}

/**
 * 파일 타입별 presigned 다운로드 URL 조회 (NestJS API)
 */
export async function serverGetFileDownloadUrl(
  id: string,
  type: string,
  index?: number
): Promise<ServerFileDownloadResult | null> {
  const params = new URLSearchParams({ type });
  if (index !== undefined) params.set('index', String(index));
  const response = await nestjsFetch<ServerFileDownloadResult>(
    `/contacts/${id}/file-download?${params.toString()}`,
    { useApiKey: true }
  );

  if (!response.ok) {
    nestjsLogger.error('파일 다운로드 URL 조회 실패', {
      contactId: id,
      type,
      status: response.status,
    });
    return null;
  }
  return response.data;
}

/**
 * 문의 웹하드 정보 조회 (NestJS API)
 */
export async function serverGetWebhardInfo(id: string): Promise<{
  folderId: string | null;
  folderPath: string | null;
  folderName: string | null;
  fileId: string | null;
} | null> {
  const response = await nestjsFetch<{
    folderId: string | null;
    folderPath: string | null;
    folderName: string | null;
    fileId: string | null;
  }>(`/contacts/${id}/webhard-info`, { useApiKey: true });

  if (!response.ok) {
    return null;
  }
  return response.data;
}

// ============ Drawing Revision API ============

export interface DrawingRevisionInfo {
  id: string;
  contactId: string;
  companyName: string | null;
  isPublic: boolean;
}

/**
 * 도면 수정 이력 조회 (NestJS API)
 */
export async function serverGetDrawingRevisions(
  contactId: string,
  includePrivate: boolean = true
): Promise<DrawingRevision[]> {
  const response = await nestjsFetch<DrawingRevision[]>(
    `/contacts/${contactId}/drawing-revisions?includePrivate=${includePrivate}`
  );

  if (!response.ok) {
    throw new Error(`Failed to get drawing revisions: ${response.status}`);
  }

  return response.data;
}

/**
 * 도면 수정 이력 접근 제어 메타데이터 조회 (NestJS API)
 */
export async function serverGetDrawingRevisionInfo(
  revisionId: string,
  options: ServerSessionAuthOptions = {}
): Promise<DrawingRevisionInfo | null> {
  const response = await nestjsFetch<DrawingRevisionInfo>(
    `/contacts/drawing-revisions/${revisionId}`,
    readAuthOptions(options.authMode)
  );

  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throwNestjsResponseError(
      response.status,
      response.data,
      '도면 수정 이력 접근 권한을 확인할 수 없습니다.'
    );
  }

  return response.data;
}

/**
 * 도면 파일 다운로드 URL (NestJS API)
 *
 * Next.js route 에서 확인한 actor의 세션 쿠키를 NestJS까지 전달해
 * presigned URL 발급 전 backend ACL을 다시 적용한다.
 */
export async function serverGetDrawingRevisionDownloadUrl(
  revisionId: string,
  fileIndex: number,
  options: ServerSessionAuthOptions = {}
): Promise<ServerFileDownloadResult> {
  const response = await nestjsFetch<ServerFileDownloadResult>(
    `/contacts/drawing-revisions/${revisionId}/download?fileIndex=${fileIndex}`,
    readAuthOptions(options.authMode)
  );

  if (!response.ok) {
    throwNestjsResponseError(
      response.status,
      response.data,
      '도면 수정 파일 다운로드 URL을 생성할 수 없습니다.'
    );
  }

  return response.data;
}

/**
 * 문의의 최신 도면 다운로드 URL (NestJS API)
 * 최신 리비전 우선, 없으면 contact.drawingFileUrl fallback
 */
export async function serverGetContactLatestDrawingUrl(
  contactId: string,
  options: ServerSessionAuthOptions = {}
): Promise<ServerFileDownloadResult | null> {
  const response = await nestjsFetch<ServerFileDownloadResult>(
    `/contacts/${contactId}/latest-drawing-url`,
    readAuthOptions(options.authMode)
  );
  if (!response.ok) {
    if (response.status === 404) {
      return null;
    }
    throwNestjsResponseError(response.status, response.data, '도면이 없습니다.');
  }
  return response.data;
}

/**
 * 현재 공정 단계 기준 최신 도면 조회 (NestJS API)
 */
export async function serverGetLatestDrawing(
  contactId: string,
  options: ServerSessionAuthOptions = {}
): Promise<{ drawing: Record<string, unknown> | null }> {
  const response = await nestjsFetch<{ drawing: Record<string, unknown> | null }>(
    `/contacts/${contactId}/latest-drawing`,
    readAuthOptions(options.authMode)
  );

  if (!response.ok) {
    if (response.status === 404) {
      return { drawing: null };
    }
    throwNestjsResponseError(
      response.status,
      response.data,
      '최신 도면 조회 권한을 확인할 수 없습니다.'
    );
  }

  return response.data;
}

/**
 * 도면 수정 등록 (NestJS API)
 */
export async function serverCreateDrawingRevision(
  contactId: string,
  data: {
    reason: string;
    reasonDetail?: string;
    files: DrawingRevisionFile[];
    processStage?: string;
    note?: string;
    isPublic?: boolean;
    source?: string;
  }
): Promise<DrawingRevision> {
  const response = await nestjsFetch<DrawingRevision>(`/contacts/${contactId}/drawing-revisions`, {
    method: 'POST',
    body: data,
  });

  if (!response.ok) {
    throw new Error(`Failed to create drawing revision: ${response.status}`);
  }

  return response.data;
}

/**
 * 도면 업로드 presigned URL 생성 (NestJS API)
 */
export async function serverGetDrawingRevisionUploadUrls(
  contactId: string,
  files: Array<{ name: string; mimeType: string; size?: number }>
): Promise<DrawingRevisionUploadUrl[]> {
  const response = await nestjsFetch<DrawingRevisionUploadUrl[]>(
    `/contacts/${contactId}/drawing-revisions/upload-urls`,
    {
      method: 'POST',
      body: { files },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to get drawing revision upload URLs: ${response.status}`);
  }

  return response.data;
}

/**
 * 수동 문의 연결 — sourceId 도면을 targetId로 복사 + sourceId soft-delete (NestJS API)
 */
export async function serverMergeDrawingFrom(
  targetId: string,
  sourceId: string
): Promise<{ mergedRevisionCount: number; sourceDeleted: boolean }> {
  const response = await nestjsFetch<{
    mergedRevisionCount: number;
    sourceDeleted: boolean;
  }>(`/contacts/${targetId}/merge-drawing-from/${sourceId}`, {
    method: 'POST',
    useApiKey: true,
  });

  if (!response.ok) {
    throw new Error(`Failed to merge drawings: ${response.status}`);
  }

  return response.data;
}

/**
 * 문의 분할 (NestJS API)
 */
export async function serverSplitContact(
  id: string,
  data: { count: number; items?: Array<{ subject?: string; description?: string }> }
): Promise<{
  success: boolean;
  data?: { parent: Record<string, unknown>; children: Record<string, unknown>[] };
  error?: string;
}> {
  const response = await nestjsFetch<{
    parent: Record<string, unknown>;
    children: Record<string, unknown>[];
  }>(`/contacts/${id}/split`, {
    method: 'POST',
    body: data,
  });

  if (!response.ok) {
    const errorData = response.data as Record<string, unknown>;
    return {
      success: false,
      error: (errorData?.message as string) || `API error: ${response.status}`,
    };
  }
  return { success: true, data: response.data };
}

/**
 * 하위 문의 목록 조회 (NestJS API)
 */
export async function serverGetContactChildren(parentId: string): Promise<{
  success: boolean;
  data?: {
    data: Record<string, unknown>[];
    total: number;
    completedCount: number;
    allCompleted: boolean;
  };
  error?: string;
}> {
  const response = await nestjsFetch<{
    data: Record<string, unknown>[];
    total: number;
    completedCount: number;
    allCompleted: boolean;
  }>(`/contacts/${parentId}/children`, {
    useApiKey: true,
  });

  if (!response.ok) {
    return { success: false, error: `API error: ${response.status}` };
  }
  return { success: true, data: response.data };
}

/**
 * 단계 완료 체크 토글 (NestJS API)
 */
export async function serverToggleStageCompleted(
  id: string,
  data: { stageCompleted: boolean },
  actor?: ContactMutationActor
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const response = await nestjsFetch<Record<string, unknown>>(`/contacts/${id}/stage-completed`, {
    method: 'PATCH',
    body: data,
    ...mutationAuthOptionsForActor(actor),
  });

  if (!response.ok) {
    const errorData = response.data as Record<string, unknown>;
    return {
      success: false,
      error: (errorData?.message as string) || `API error: ${response.status}`,
    };
  }
  return { success: true, data: response.data };
}

/**
 * 그룹 일괄 다음 단계 이동 (NestJS API)
 */
export async function serverAdvanceSplitGroupStage(
  parentId: string,
  data: { nextStage: string; forceComplete?: boolean; actorType?: string; actorName?: string }
): Promise<{
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}> {
  const response = await nestjsFetch<Record<string, unknown>>(
    `/contacts/${parentId}/children/advance-stage`,
    {
      method: 'POST',
      body: data,
      ...mutationAuthOptionsForActor(
        data.actorType && data.actorName
          ? { actorType: data.actorType, actorName: data.actorName }
          : undefined
      ),
    }
  );

  if (!response.ok) {
    const errorData = response.data as Record<string, unknown>;
    return {
      success: false,
      error: (errorData?.message as string) || `API error: ${response.status}`,
    };
  }
  return { success: true, data: response.data };
}

/**
 * 도면 수정 공개 여부 변경 (NestJS API)
 */
export async function serverUpdateDrawingRevisionVisibility(
  revisionId: string,
  isPublic: boolean
): Promise<DrawingRevision> {
  const response = await nestjsFetch<DrawingRevision>(
    `/contacts/drawing-revisions/${revisionId}/visibility`,
    {
      method: 'PATCH',
      body: { isPublic },
    }
  );

  if (!response.ok) {
    throw new Error(`Failed to update drawing revision visibility: ${response.status}`);
  }

  return response.data;
}
