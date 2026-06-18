/** Operational NestJS server-side client functions. */

import { nestjsFetch, type NestJSRequestOptions } from './core.client';
// ============ Notifications API ============

/**
 * 알림 목록 조회 (NestJS API)
 */
export async function serverGetNotifications(params: {
  userType: string;
  userId?: number | null;
  limit?: number;
  offset?: number;
  unreadOnly?: boolean;
  category?: string;
}): Promise<Record<string, unknown>[]> {
  const searchParams = new URLSearchParams();
  searchParams.set('userType', params.userType);
  if (params.userId != null) searchParams.set('userId', String(params.userId));
  if (params.limit) searchParams.set('limit', String(params.limit));
  if (params.offset) searchParams.set('offset', String(params.offset));
  if (params.unreadOnly) searchParams.set('unreadOnly', 'true');
  if (params.category && params.category !== 'all') searchParams.set('category', params.category);

  const response = await nestjsFetch<{
    notifications: Record<string, unknown>[];
  }>(`/notifications?${searchParams.toString()}`, { useApiKey: true });

  if (!response.ok) return [];
  return response.data.notifications;
}

/**
 * 읽지 않은 알림 수 조회 (NestJS API)
 */
export async function serverGetUnreadNotificationCount(
  userType: string,
  userId?: number | null,
  category?: string
): Promise<number> {
  const searchParams = new URLSearchParams();
  searchParams.set('userType', userType);
  if (userId != null) searchParams.set('userId', String(userId));
  if (category && category !== 'all') searchParams.set('category', category);

  const response = await nestjsFetch<{ count: number }>(
    `/notifications/unread-count?${searchParams.toString()}`,
    { useApiKey: true }
  );

  if (!response.ok) return 0;
  return response.data.count;
}

export async function serverGetUnreadNotificationSummary(
  userType: string,
  userId?: number | null
): Promise<{ all: number; webhard: number; integration: number; workManagement: number }> {
  const searchParams = new URLSearchParams();
  searchParams.set('userType', userType);
  if (userId != null) searchParams.set('userId', String(userId));

  const response = await nestjsFetch<{
    all: number;
    webhard: number;
    integration: number;
    workManagement: number;
  }>(`/notifications/unread-summary?${searchParams.toString()}`, { useApiKey: true });

  if (!response.ok) return { all: 0, webhard: 0, integration: 0, workManagement: 0 };
  return response.data;
}

/**
 * 알림 읽음 처리 (NestJS API)
 */
export async function serverMarkNotificationRead(notificationId: string): Promise<boolean> {
  const response = await nestjsFetch<{ success: boolean }>(
    `/notifications/${notificationId}/read`,
    { method: 'POST', useApiKey: true }
  );
  if (!response.ok) return false;
  return response.data.success;
}

/**
 * 모든 알림 읽음 처리 (NestJS API)
 */
export async function serverMarkAllNotificationsRead(
  userType: string,
  userId?: number | null
): Promise<number> {
  const response = await nestjsFetch<{ updatedCount: number }>('/notifications/read-all', {
    method: 'POST',
    body: { userType, userId: userId ?? null },
    useApiKey: true,
  });
  if (!response.ok) return 0;
  return response.data.updatedCount;
}

// ============ Active Sessions API ============

/**
 * 활성 세션 upsert (NestJS API)
 */
export async function serverUpsertActiveSession(
  userType: string,
  userId: number,
  username: string,
  companyName?: string | null
): Promise<boolean> {
  const response = await nestjsFetch<{ success: boolean }>('/sessions/upsert', {
    method: 'POST',
    body: { userType, userId, username, companyName },
  });
  if (!response.ok) return false;
  return response.data.success;
}

/**
 * 활성 세션 삭제 (NestJS API)
 */
export async function serverDeleteActiveSession(
  userType: string,
  userId: number
): Promise<boolean> {
  const response = await nestjsFetch<{ success: boolean }>('/sessions', {
    method: 'DELETE',
    body: { userType, userId },
  });
  if (!response.ok) return false;
  return response.data.success;
}

/**
 * 활성 세션 수 조회 (NestJS API)
 */
export async function serverGetActiveSessionsCount(): Promise<{
  total_count: number;
  admin_count: number;
  company_count: number;
}> {
  const response = await nestjsFetch<{
    total_count: number;
    admin_count: number;
    company_count: number;
  }>('/sessions/count');

  if (!response.ok) return { total_count: 0, admin_count: 0, company_count: 0 };
  return response.data;
}

/**
 * 활성 세션 목록 조회 (NestJS API)
 */
export async function serverGetActiveSessionsList(): Promise<
  {
    id: number;
    user_type: string;
    user_id: number;
    username: string;
    company_name: string | null;
    last_activity: string;
  }[]
> {
  const response = await nestjsFetch<
    {
      id: number;
      user_type: string;
      user_id: number;
      username: string;
      company_name: string | null;
      last_activity: string;
    }[]
  >('/sessions/list');

  if (!response.ok) return [];
  return response.data;
}

// ============ Activity Logs API ============

/**
 * 활동 로그 기록 (NestJS API)
 */
export async function serverCreateActivityLog(data: {
  actorType: string;
  actorId: string;
  actorName?: string;
  action: string;
  resourceType?: string;
  resourceId?: string;
  details?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}): Promise<{ id: string | null; success: boolean }> {
  const response = await nestjsFetch<{ id: string | null; success: boolean }>('/activity-logs', {
    method: 'POST',
    body: data,
    useApiKey: true,
  });
  if (!response.ok) return { id: null, success: false };
  return response.data;
}

// ============ Bookings API ============

/**
 * 예약 목록 조회 (NestJS API)
 */
export async function serverGetBookings(params?: {
  date?: string;
  companyName?: string;
  startDate?: string;
  endDate?: string;
  contactId?: string;
  status?: string;
  limit?: number;
}): Promise<Record<string, unknown>[]> {
  const searchParams = new URLSearchParams();
  if (params?.date) searchParams.set('date', params.date);
  if (params?.companyName) searchParams.set('companyName', params.companyName);
  if (params?.startDate) searchParams.set('startDate', params.startDate);
  if (params?.endDate) searchParams.set('endDate', params.endDate);
  if (params?.contactId) searchParams.set('contactId', params.contactId);
  if (params?.status) searchParams.set('status', params.status);
  if (params?.limit) searchParams.set('limit', String(params.limit));

  const query = searchParams.toString();
  const response = await nestjsFetch<{ bookings: Record<string, unknown>[] }>(
    `/bookings${query ? `?${query}` : ''}`,
    { useApiKey: true }
  );
  if (!response.ok) {
    throw new Error(`Failed to get bookings: ${response.status}`);
  }
  return response.data.bookings;
}

/**
 * 예약 단건 조회 (NestJS API)
 */
export async function serverGetBooking(id: number): Promise<Record<string, unknown> | null> {
  const response = await nestjsFetch<{ booking: Record<string, unknown> }>(`/bookings/${id}`, {
    useApiKey: true,
  });
  if (!response.ok) return null;
  return response.data.booking;
}

/**
 * 예약 생성 (NestJS API)
 */
export interface CreateBookingPayload {
  visitDate: string;
  visitTimeSlot: string;
  companyName: string;
  contactId?: string;
  notes?: string;
  createdBy?: string;
  deliveryMethod?: string;
  deliveryName?: string;
  deliveryPhone?: string;
  deliveryAddress?: string;
}

export async function serverCreateBooking(
  data: CreateBookingPayload
): Promise<{ success: boolean; booking?: Record<string, unknown>; error?: string }> {
  const response = await nestjsFetch<{ booking: Record<string, unknown> }>('/bookings', {
    method: 'POST',
    body: data,
    useApiKey: true,
  });
  if (!response.ok) return { success: false, error: `API error: ${response.status}` };
  return { success: true, booking: response.data.booking };
}

/**
 * 예약 수정 (NestJS API)
 */
export async function serverUpdateBooking(
  id: number,
  data: Record<string, unknown>
): Promise<{ success: boolean; booking?: Record<string, unknown>; error?: string }> {
  const response = await nestjsFetch<{ booking: Record<string, unknown> }>(`/bookings/${id}`, {
    method: 'PATCH',
    body: data,
    useApiKey: true,
  });
  if (!response.ok) return { success: false, error: `API error: ${response.status}` };
  return { success: true, booking: response.data.booking };
}

/**
 * 예약 삭제 (NestJS API)
 */
export async function serverDeleteBooking(
  id: number
): Promise<{ success: boolean; error?: string }> {
  const response = await nestjsFetch<{ success: boolean }>(`/bookings/${id}`, {
    method: 'DELETE',
    useApiKey: true,
  });
  if (!response.ok) return { success: false, error: `API error: ${response.status}` };
  return { success: true };
}

/**
 * 예약 가능 시간대 조회 (NestJS API)
 *
 * NestJS 응답에 `maxCapacity` 가 포함된다 (2026-04-24 task 23 phase 7). 구버전 NestJS 와의
 * 과도기 호환을 위해 필드는 optional 로 선언.
 */
export async function serverGetAvailableSlots(date: string): Promise<{
  date: string;
  slotCounts: Record<string, number>;
  maxCapacity?: number;
}> {
  const response = await nestjsFetch<{
    date: string;
    slotCounts: Record<string, number>;
    maxCapacity?: number;
  }>(`/bookings/available?date=${date}`, { useApiKey: true });
  if (!response.ok) {
    throw new Error(`Failed to get available slots: ${response.status}`);
  }
  return response.data;
}

// ============ Feedback API ============

/**
 * 불편사항 목록 조회 (NestJS API)
 */
export async function serverGetFeedback(params?: {
  status?: string;
  companyId?: number;
  limit?: number;
  offset?: number;
}): Promise<{
  feedbacks: Record<string, unknown>[];
  total: number;
}> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.companyId) searchParams.set('companyId', String(params.companyId));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const query = searchParams.toString();
  const response = await nestjsFetch<{
    feedbacks: Record<string, unknown>[];
    total: number;
  }>(`/feedback${query ? `?${query}` : ''}`, { useApiKey: true });

  if (!response.ok) return { feedbacks: [], total: 0 };
  return response.data;
}

/**
 * 불편사항 상태별 카운트 (NestJS API)
 */
export async function serverGetFeedbackStatusCounts(): Promise<{
  pending: number;
  in_progress: number;
  resolved: number;
  total: number;
}> {
  const response = await nestjsFetch<{
    pending: number;
    in_progress: number;
    resolved: number;
    total: number;
  }>('/feedback/status-counts', { useApiKey: true });

  if (!response.ok) return { pending: 0, in_progress: 0, resolved: 0, total: 0 };
  return response.data;
}

/**
 * 불편사항 생성 (NestJS API)
 */
export async function serverCreateFeedback(data: {
  companyId: number;
  companyName: string;
  content: string;
  category?: string;
  categoryOther?: string;
  companyEmail?: string;
}): Promise<{ success: boolean; error?: string }> {
  const response = await nestjsFetch<Record<string, unknown>>('/feedback', {
    method: 'POST',
    body: data,
    useApiKey: true,
  });
  if (!response.ok) return { success: false, error: `API error: ${response.status}` };
  return { success: true };
}

/**
 * 불편사항 수정 (NestJS API)
 */
export async function serverUpdateFeedback(
  id: number,
  data: { status?: string; adminNotes?: string }
): Promise<{ success: boolean; error?: string }> {
  const response = await nestjsFetch<Record<string, unknown>>(`/feedback/${id}`, {
    method: 'PATCH',
    body: data,
    useApiKey: true,
  });
  if (!response.ok) return { success: false, error: `API error: ${response.status}` };
  return { success: true };
}

// ============ Share Links API ============

/**
 * 공유 링크 검증 및 다운로드 카운트 증가 (NestJS API)
 */
export async function serverValidateShareLink(token: string): Promise<{
  is_valid: boolean;
  file_path?: string;
  webhard_file_id?: string | null;
  drive_file_id?: string | null;
  storage_provider?: 'GOOGLE_DRIVE' | 'R2' | 'google_drive' | 'r2' | null;
  file_name?: string;
  error_message?: string | null;
}> {
  const response = await nestjsFetch<{
    is_valid: boolean;
    file_path?: string;
    webhard_file_id?: string | null;
    drive_file_id?: string | null;
    storage_provider?: 'GOOGLE_DRIVE' | 'R2' | 'google_drive' | 'r2' | null;
    file_name?: string;
    error_message?: string | null;
  }>('/share-links/validate', {
    method: 'POST',
    body: { token },
    useApiKey: true,
  });

  if (!response.ok) {
    return { is_valid: false, error_message: 'API 오류' };
  }
  return response.data;
}

// ============ Sync API ============

/**
 * 동기화 상태 upsert (NestJS API)
 */
export async function serverUpdateSyncState(data: {
  companyId: number;
  lastSyncAt?: string;
  lastSyncHash?: string;
  filesSynced?: number;
  foldersSynced?: number;
  syncType?: string;
  syncStatus?: string;
  errorMessage?: string;
}): Promise<{ success: boolean; error?: string }> {
  const response = await nestjsFetch<Record<string, unknown>>('/sync/state', {
    method: 'POST',
    body: data,
    useApiKey: true,
  });
  if (!response.ok) return { success: false, error: `API error: ${response.status}` };
  return { success: true };
}

// ============ Public Data API (Portfolio, Posts, Dashboard) ============

/**
 * 포트폴리오 목록 조회 (NestJS API)
 */
export async function serverGetPortfolios(params?: {
  limit?: number;
  offset?: number;
}): Promise<Record<string, unknown>[]> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const query = searchParams.toString();
  const response = await nestjsFetch<Record<string, unknown>[]>(
    `/public-data/portfolio${query ? `?${query}` : ''}`,
    { useApiKey: true }
  );
  if (!response.ok) return [];
  return response.data;
}

/**
 * 포트폴리오 단건 조회 (NestJS API)
 */
export async function serverGetPortfolio(id: string): Promise<Record<string, unknown> | null> {
  const response = await nestjsFetch<Record<string, unknown>>(`/public-data/portfolio/${id}`, {
    useApiKey: true,
  });
  if (!response.ok) return null;
  return response.data;
}

/**
 * 게시글 목록 조회 (NestJS API)
 */
export async function serverGetPosts(params?: {
  limit?: number;
  offset?: number;
}): Promise<Record<string, unknown>[]> {
  const searchParams = new URLSearchParams();
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.offset) searchParams.set('offset', String(params.offset));

  const query = searchParams.toString();
  const response = await nestjsFetch<Record<string, unknown>[]>(
    `/public-data/posts${query ? `?${query}` : ''}`,
    { useApiKey: true }
  );
  if (!response.ok) return [];
  return response.data;
}

/**
 * 대시보드 통계 (NestJS API)
 */
export async function serverGetDashboardStats(): Promise<Record<string, unknown>[]> {
  const response = await nestjsFetch<Record<string, unknown>[]>('/public-data/dashboard-stats', {
    useApiKey: true,
  });
  if (!response.ok) return [];
  return response.data;
}

// ============ Delivery Companies API ============

/**
 * 납품업체 목록 조회 (NestJS API)
 */
export async function serverGetDeliveryCompanies(
  companyId: number
): Promise<Record<string, unknown>[]> {
  const response = await nestjsFetch<Record<string, unknown>[]>(
    `/delivery-companies?companyId=${companyId}`,
    { useApiKey: true }
  );
  if (!response.ok) return [];
  return response.data;
}

/**
 * 납품업체 생성 (NestJS API)
 */
export async function serverCreateDeliveryCompany(data: {
  companyId: number;
  name: string;
  phone: string;
  address: string;
}): Promise<{ success: boolean; error?: string }> {
  const response = await nestjsFetch<Record<string, unknown>>('/delivery-companies', {
    method: 'POST',
    body: data,
    useApiKey: true,
  });
  if (!response.ok) return { success: false, error: `API error: ${response.status}` };
  return { success: true };
}

// ============ Push Subscriptions API ============

/**
 * Push subscription upsert (NestJS API)
 */
export async function serverUpsertPushSubscription(data: {
  workerId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}): Promise<{ success: boolean; error?: string }> {
  const response = await nestjsFetch<{ id: string }>('/push-subscriptions', {
    method: 'POST',
    body: data,
    useApiKey: true,
  });
  if (!response.ok) return { success: false, error: `API error: ${response.status}` };
  return { success: true };
}

/**
 * Push subscription 조회 (NestJS API)
 */
export async function serverGetPushSubscriptions(
  workerId: string
): Promise<Record<string, unknown>[]> {
  const response = await nestjsFetch<Record<string, unknown>[]>(
    `/push-subscriptions?workerId=${encodeURIComponent(workerId)}`,
    { useApiKey: true }
  );
  if (!response.ok) return [];
  return response.data;
}

type ContactMutationActor = { actorType: string; actorName: string };

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

/**
 * 긴급 토글 (NestJS API)
 */
export async function serverToggleUrgent(
  contactId: string,
  actor?: ContactMutationActor
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const response = await nestjsFetch<Record<string, unknown>>(
    `/contacts/${contactId}/toggle-urgent`,
    { method: 'PATCH', ...mutationAuthOptionsForActor(actor) }
  );
  if (!response.ok) return { success: false, error: `API error: ${response.status}` };
  return { success: true, data: response.data };
}

/**
 * 작업자 노트 추가 (NestJS API)
 */
export async function serverAddWorkerNote(
  contactId: string,
  data: { type: string; content: string; createdBy: string },
  actor?: ContactMutationActor
): Promise<{ success: boolean; data?: Record<string, unknown>; error?: string }> {
  const response = await nestjsFetch<Record<string, unknown>>(`/contacts/${contactId}/notes`, {
    method: 'POST',
    body: data,
    ...mutationAuthOptionsForActor(actor),
  });
  if (!response.ok) return { success: false, error: `API error: ${response.status}` };
  return { success: true, data: response.data };
}

/**
 * 작업자 노트 삭제 (NestJS API)
 */
export async function serverDeleteWorkerNote(
  contactId: string,
  noteId: number,
  actor?: ContactMutationActor
): Promise<{ success: boolean; error?: string }> {
  const response = await nestjsFetch<Record<string, unknown>>(
    `/contacts/${contactId}/notes/${noteId}`,
    { method: 'DELETE', ...mutationAuthOptionsForActor(actor) }
  );
  if (!response.ok) return { success: false, error: `API error: ${response.status}` };
  return { success: true };
}

/**
 * 일괄 납품 시작 (NestJS API)
 */
export interface DeliveryProofFileMetadata {
  originalName: string;
  size: number;
  mimeType: string;
}

export async function serverBatchStartDelivery(
  contactIds: string[],
  deliveryProofImage?: string,
  actor?: ContactMutationActor,
  deliveryProofFile?: DeliveryProofFileMetadata
): Promise<{
  success: boolean;
  results?: Array<{ contactId: string; success: boolean; error?: string }>;
  error?: string;
}> {
  const response = await nestjsFetch<{
    results: Array<{ contactId: string; success: boolean; error?: string }>;
  }>('/contacts/batch-start-delivery', {
    method: 'POST',
    body: {
      contactIds,
      deliveryProofImage,
      deliveryProofOriginalName: deliveryProofFile?.originalName,
      deliveryProofFileSize: deliveryProofFile?.size,
      deliveryProofMimeType: deliveryProofFile?.mimeType,
      ...actor,
    },
    ...mutationAuthOptionsForActor(actor),
  });
  if (!response.ok) return { success: false, error: `API error: ${response.status}` };
  return { success: true, results: response.data.results };
}

/**
 * 일괄 납품 완료 (NestJS API)
 */
export async function serverBatchCompleteDelivery(
  contactIds: string[],
  deliveryCompleteImage?: string,
  actor?: ContactMutationActor
): Promise<{
  success: boolean;
  results?: Array<{ contactId: string; success: boolean; error?: string }>;
  error?: string;
}> {
  const response = await nestjsFetch<{
    results: Array<{ contactId: string; success: boolean; error?: string }>;
  }>('/contacts/batch-complete-delivery', {
    method: 'POST',
    body: { contactIds, deliveryCompleteImage, ...actor },
    ...mutationAuthOptionsForActor(actor),
  });
  if (!response.ok) return { success: false, error: `API error: ${response.status}` };
  return { success: true, results: response.data.results };
}
