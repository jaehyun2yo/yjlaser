/**
 * 폴더 별칭 (CompanyFolderAlias) admin API 호출 헬퍼
 * NestJS `/api/v1/companies/folder-aliases` endpoint 와 통신.
 */

import { NESTJS_CLIENT_API_BASE } from '@/lib/api/api-base';

const FOLDER_ALIAS_BASE = `${NESTJS_CLIENT_API_BASE}/companies/folder-aliases`;

export interface FolderAliasCompany {
  id: number;
  companyName: string;
  isApproved: boolean;
}

export interface FolderAlias {
  id: number;
  folderName: string;
  companyId: number;
  status: 'pending' | 'approved' | 'rejected';
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  company: FolderAliasCompany;
}

export interface FolderAliasListResponse {
  items: FolderAlias[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * task 26 + task 27: alias 승인 / 매뉴얼 등록 시 발생하는 backfill 결과.
 * - relocated/skipped: 미통합 Contact 일괄 통합 결과
 * - movedFolders/movedFiles: 외부 폴더 트리 이전 결과
 * - deletedExternalFolders: task 27 부터 항상 0. 외부 폴더 husk 는 유지되며
 *   정리는 admin 명시 액션 (`/admin/integration/companies` 의 외부 husk 패널) 으로 분리.
 * - conflicts: 임의 폴더 이동 시 충돌 rename 결과
 * - externalRootFound: depth=2 root 가 존재했는지 — false 면 migrate skip + 카운트 0.
 */
export interface FolderAliasBackfillResult {
  relocated: number;
  skipped: number;
  movedFolders: number;
  movedFiles: number;
  deletedExternalFolders: number;
  conflicts: Array<{ originalName: string; renamedTo: string }>;
  externalRootFound: boolean;
}

export interface ApproveResponse {
  alias: FolderAlias;
  backfill?: FolderAliasBackfillResult;
}

/** task 26: createApprovedAlias (매뉴얼 매핑 등록) 응답. */
export interface CreateApprovedResponse {
  alias: FolderAlias;
  backfill?: FolderAliasBackfillResult;
}

export interface CreateApprovedInput {
  folderName: string;
  companyId: number;
  /** default true — 매핑과 동시에 외부 누적분 통합 + 폴더 트리 이전 실행. */
  cascadeBackfill?: boolean;
}

/**
 * Double Submit Cookie 패턴 — webhard-api 의 글로벌 CsrfGuard 가
 * 세션 기반 POST/PATCH/DELETE 요청에 `x-csrf-token` 헤더를 요구.
 * GET 은 가드가 자동 스킵하지만, 헤더를 항상 부착해 두면 안전.
 */
function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match?.[1];
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const csrfToken = getCsrfToken();
  const res = await fetch(`${FOLDER_ALIAS_BASE}${path}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && { 'x-csrf-token': csrfToken }),
      ...options?.headers,
    },
  });

  if (!res.ok) {
    const errorText = await res.text().catch(() => res.statusText);
    throw new Error(`API Error ${res.status}: ${errorText}`);
  }

  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

export const folderAliasApi = {
  list: (
    status: 'pending' | 'approved' | 'rejected',
    page: number,
    pageSize: number
  ): Promise<FolderAliasListResponse> => {
    const params = new URLSearchParams({
      status,
      page: String(page),
      pageSize: String(pageSize),
    });
    return apiFetch<FolderAliasListResponse>(`?${params.toString()}`);
  },

  approve: (id: number, cascadeBackfill: boolean): Promise<ApproveResponse> =>
    apiFetch<ApproveResponse>(`/${id}/approve`, {
      method: 'POST',
      body: JSON.stringify({ cascadeBackfill }),
    }),

  /**
   * task 26: 운영자가 직접 (folderName, companyId) 매핑을 등록 + 즉시 승인.
   * cascadeBackfill default true — relocate + migrate chained call.
   */
  createApproved: (input: CreateApprovedInput): Promise<CreateApprovedResponse> =>
    apiFetch<CreateApprovedResponse>('', {
      method: 'POST',
      body: JSON.stringify({
        cascadeBackfill: input.cascadeBackfill ?? true,
        folderName: input.folderName,
        companyId: input.companyId,
      }),
    }),

  reject: (id: number): Promise<FolderAlias> =>
    apiFetch<FolderAlias>(`/${id}/reject`, { method: 'PATCH' }),

  remove: (id: number): Promise<{ ok: boolean }> =>
    apiFetch<{ ok: boolean }>(`/${id}`, { method: 'DELETE' }),
};
