/** Companies NestJS server-side client functions. */

import { nestjsFetch } from './core.client';
// ============ Companies API ============

const NESTJS_API_URL = process.env.NEXT_PUBLIC_WEBHARD_API_URL || 'http://localhost:4000';

export interface CompanyData {
  id: number;
  company_name: string;
  manager_name: string;
  created_at: string | null;
  updated_at: string | null;
  username: string;
  password_hash: string;
  business_registration_number: string;
  representative_name: string;
  business_type: string | null;
  business_category: string | null;
  business_address: string;
  business_registration_file_url: string | null;
  business_registration_file_name: string | null;
  manager_position: string;
  manager_phone: string;
  manager_email: string;
  accountant_name: string | null;
  accountant_phone: string | null;
  accountant_email: string | null;
  accountant_fax: string | null;
  quote_method_email: boolean | null;
  quote_method_fax: boolean | null;
  quote_method_sms: boolean | null;
  status: string | null;
  webhard_access: boolean;
  laser_only: boolean;
  is_approved: boolean;
  approved_at: string | null;
  approved_by: string | null;
  drive_root_folder_id?: string | null;
  drive_provisioning_status?: 'pending' | 'ready' | 'failed' | null;
  drive_provisioning_error?: string | null;
  drive_provisioning_last_attempt_at?: string | null;
  drive_provisioned_at?: string | null;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deleted_previous_status?: string | null;
  deleted_previous_webhard_access?: boolean | null;
  restore_deadline_at?: string | null;
  days_until_permanent_delete?: number | null;
}

interface ApiErrorPayload {
  message?: string;
  error?: string;
}

function getApiErrorMessage(data: unknown, fallback: string): string {
  if (typeof data !== 'object' || data === null) {
    return fallback;
  }

  const payload = data as ApiErrorPayload;
  return payload.message || payload.error || fallback;
}

/**
 * 업체 목록 조회 (NestJS API)
 */
export async function serverGetCompanies(params?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  isApproved?: boolean;
}): Promise<{
  companies: CompanyData[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}> {
  const searchParams = new URLSearchParams();
  if (params?.status) searchParams.set('status', params.status);
  if (params?.search) searchParams.set('search', params.search);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.limit) searchParams.set('limit', String(params.limit));
  if (params?.sortBy) searchParams.set('sortBy', params.sortBy);
  if (params?.sortOrder) searchParams.set('sortOrder', params.sortOrder);
  if (params?.isApproved !== undefined) searchParams.set('isApproved', String(params.isApproved));

  const query = searchParams.toString();
  const response = await nestjsFetch<{
    companies: CompanyData[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
  }>(`/companies${query ? `?${query}` : ''}`, { useApiKey: true });

  if (!response.ok) {
    return { companies: [], total: 0, page: 1, limit: 50, hasMore: false };
  }
  return response.data;
}

/**
 * 업체 단건 조회 (NestJS API)
 */
export async function serverGetCompany(id: number): Promise<CompanyData | null> {
  const response = await nestjsFetch<CompanyData>(`/companies/${id}`, { useApiKey: true });
  if (!response.ok) return null;
  return response.data;
}

/**
 * 업체 생성 (NestJS API)
 */
export async function serverCreateCompany(
  data: Record<string, unknown>
): Promise<{ success: boolean; data?: CompanyData; error?: string }> {
  const response = await nestjsFetch<CompanyData>('/companies', {
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
 * 업체 수정 (NestJS API)
 */
export async function serverUpdateCompany(
  id: number,
  data: Record<string, unknown>
): Promise<{ success: boolean; data?: CompanyData; error?: string }> {
  const response = await nestjsFetch<CompanyData>(`/companies/${id}`, {
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
 * 사업자등록증을 관리자 전용 Drive 업체 폴더에 업로드 (NestJS multipart API)
 */
export async function serverUploadCompanyBusinessRegistrationToDrive(
  companyId: number,
  file: File
): Promise<{ success: boolean; data?: CompanyData; error?: string }> {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await fetch(
    `${NESTJS_API_URL}/api/v1/companies/${encodeURIComponent(String(companyId))}/business-registration/drive`,
    {
      method: 'POST',
      headers: {
        'X-API-Key': process.env.MIGRATION_API_KEY || '',
      },
      body: formData,
    }
  );

  if (!response.ok) {
    const data = await response.json().catch(() => null);
    return {
      success: false,
      error: getApiErrorMessage(data, `API error: ${response.status}`),
    };
  }

  return { success: true, data: (await response.json()) as CompanyData };
}

/**
 * 업체 상태 변경 (NestJS API)
 */
export async function serverUpdateCompanyStatus(
  id: number,
  status: string
): Promise<{
  success: boolean;
  company?: CompanyData;
  previousStatus?: string;
  error?: string;
}> {
  const response = await nestjsFetch<{
    company: CompanyData;
    previousStatus: string;
  }>(`/companies/${id}/status`, {
    method: 'PATCH',
    body: { status },
    useApiKey: true,
  });

  if (!response.ok) {
    return { success: false, error: `API error: ${response.status}` };
  }
  return {
    success: true,
    company: response.data.company,
    previousStatus: response.data.previousStatus,
  };
}

/**
 * 웹하드 접근 토글 (NestJS API)
 */
export async function serverToggleWebhardAccess(
  id: number,
  allowed: boolean
): Promise<{
  success: boolean;
  previousAccess?: boolean;
  error?: string;
}> {
  const response = await nestjsFetch<{
    company: CompanyData;
    previousAccess: boolean;
  }>(`/companies/${id}/webhard-access`, {
    method: 'PATCH',
    body: { allowed },
    useApiKey: true,
  });

  if (!response.ok) {
    return { success: false, error: `API error: ${response.status}` };
  }
  return { success: true, previousAccess: response.data.previousAccess };
}

/**
 * 레이저 전용 업체 토글 (NestJS API)
 */
export async function serverToggleLaserOnly(
  id: number,
  laserOnly: boolean
): Promise<{
  success: boolean;
  previousLaserOnly?: boolean;
  error?: string;
}> {
  const response = await nestjsFetch<{
    company: CompanyData;
    previousLaserOnly: boolean;
  }>(`/companies/${id}/laser-only`, {
    method: 'PATCH',
    body: { laserOnly },
    useApiKey: true,
  });

  if (!response.ok) {
    return { success: false, error: `API error: ${response.status}` };
  }
  return { success: true, previousLaserOnly: response.data.previousLaserOnly };
}

/**
 * 업체 승인 (NestJS API)
 */
export async function serverApproveCompany(
  id: number,
  approvedBy: string
): Promise<{
  success: boolean;
  company?: CompanyData;
  previousStatus?: string;
  alreadyApproved?: boolean;
  error?: string;
}> {
  const response = await nestjsFetch<{
    company: CompanyData;
    previousStatus: string;
    alreadyApproved: boolean;
  }>(`/companies/${id}/approve`, {
    method: 'POST',
    body: { approvedBy },
    useApiKey: true,
  });

  if (!response.ok) {
    return { success: false, error: `API error: ${response.status}` };
  }
  return {
    success: true,
    company: response.data.company,
    previousStatus: response.data.previousStatus,
    alreadyApproved: response.data.alreadyApproved,
  };
}

/**
 * 업체 삭제 대기 처리 (admin session)
 */
export async function serverDeleteCompany(id: number): Promise<{
  success: boolean;
  company?: CompanyData;
  alreadyDeleted?: boolean;
  foldersDeleted?: number;
  filesDeleted?: number;
  restoreDeadlineAt?: string | null;
  daysUntilPermanentDelete?: number | null;
  error?: string;
}> {
  const response = await nestjsFetch<
    {
      company: CompanyData;
      alreadyDeleted: boolean;
      foldersDeleted?: number;
      filesDeleted?: number;
      restoreDeadlineAt?: string | null;
      daysUntilPermanentDelete?: number | null;
    } & ApiErrorPayload
  >(`/companies/${id}`, {
    method: 'DELETE',
  });

  if (!response.ok) {
    return {
      success: false,
      error: getApiErrorMessage(response.data, `API error: ${response.status}`),
    };
  }

  return {
    success: true,
    company: response.data.company,
    alreadyDeleted: response.data.alreadyDeleted,
    foldersDeleted: response.data.foldersDeleted,
    filesDeleted: response.data.filesDeleted,
    restoreDeadlineAt: response.data.restoreDeadlineAt,
    daysUntilPermanentDelete: response.data.daysUntilPermanentDelete,
  };
}

/**
 * 삭제 대기 업체 복구 (admin session)
 */
export async function serverRestoreCompany(id: number): Promise<{
  success: boolean;
  company?: CompanyData;
  alreadyRestored?: boolean;
  foldersRestored?: number;
  filesRestored?: number;
  error?: string;
}> {
  const response = await nestjsFetch<
    {
      company: CompanyData;
      alreadyRestored: boolean;
      foldersRestored?: number;
      filesRestored?: number;
    } & ApiErrorPayload
  >(`/companies/${id}/restore`, {
    method: 'POST',
  });

  if (!response.ok) {
    return {
      success: false,
      error: getApiErrorMessage(response.data, `API error: ${response.status}`),
    };
  }

  return {
    success: true,
    company: response.data.company,
    alreadyRestored: response.data.alreadyRestored,
    foldersRestored: response.data.foldersRestored,
    filesRestored: response.data.filesRestored,
  };
}

/**
 * 업체명 목록 조회 (NestJS API)
 */
export async function serverGetCompanyNames(): Promise<{ id: number; company_name: string }[]> {
  const response = await nestjsFetch<{ id: number; company_name: string }[]>('/companies/names', {
    useApiKey: true,
  });
  if (!response.ok) return [];
  return response.data;
}

/**
 * 최근 업체 목록 (NestJS API)
 */
export async function serverGetRecentCompanies(days: number = 30): Promise<CompanyData[]> {
  const response = await nestjsFetch<CompanyData[]>(`/companies/recent?days=${days}`, {
    useApiKey: true,
  });
  if (!response.ok) return [];
  return response.data;
}

/**
 * username으로 업체 조회 (NestJS API)
 */
export async function serverGetCompanyByUsername(username: string): Promise<CompanyData | null> {
  const response = await nestjsFetch<CompanyData | null>(
    `/companies/by-username/${encodeURIComponent(username)}`,
    { useApiKey: true }
  );
  if (!response.ok || !response.data) return null;
  return response.data;
}

/**
 * 인증용 업체 조회 (NestJS API)
 */
export async function serverGetCompanyForAuth(username: string): Promise<CompanyData | null> {
  const response = await nestjsFetch<CompanyData | null>(
    `/companies/auth/${encodeURIComponent(username)}`,
    { useApiKey: true }
  );
  if (!response.ok || !response.data) return null;
  return response.data;
}

/**
 * username 중복 체크 (NestJS API)
 */
export async function serverCheckDuplicateUsername(
  username: string,
  excludeId?: number
): Promise<{ exists: boolean; id: number | null }> {
  const response = await nestjsFetch<{ exists: boolean; id: number | null }>(
    '/companies/check-username',
    {
      method: 'POST',
      body: { username, excludeId },
      useApiKey: true,
    }
  );
  if (!response.ok) return { exists: false, id: null };
  return response.data;
}

/**
 * 사업자등록번호 중복 체크 (NestJS API)
 */
export async function serverCheckDuplicateBusinessNumber(
  businessRegistrationNumber: string,
  excludeId?: number
): Promise<{ exists: boolean; id: number | null }> {
  const response = await nestjsFetch<{ exists: boolean; id: number | null }>(
    '/companies/check-business-number',
    {
      method: 'POST',
      body: { businessRegistrationNumber, excludeId },
      useApiKey: true,
    }
  );
  if (!response.ok) return { exists: false, id: null };
  return response.data;
}
