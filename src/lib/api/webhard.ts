/**
 * 웹하드 API 클라이언트 헬퍼 함수
 * prefetchQuery와 useQuery에서 동일한 데이터 구조를 보장합니다.
 */

import { WebhardFile } from '@/types/webhard';

export const WEBHARD_LOGIN_REQUIRED_MESSAGE = '다시 로그인해주세요';

export class WebhardApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'WebhardApiError';
    this.status = status;
    Object.setPrototypeOf(this, WebhardApiError.prototype);
  }
}

function isWebhardAuthStatus(status: number): boolean {
  return status === 401 || status === 419;
}

export function isWebhardAuthError(error: unknown): boolean {
  if (error instanceof WebhardApiError) {
    return isWebhardAuthStatus(error.status);
  }

  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return false;
  }

  const status = Number((error as { status: unknown }).status);
  return Number.isFinite(status) && isWebhardAuthStatus(status);
}

export async function createWebhardApiError(
  response: Response,
  fallbackMessage: string
): Promise<WebhardApiError> {
  const payload = (await response.json().catch(() => null)) as {
    error?: string;
    message?: string;
  } | null;

  const message = isWebhardAuthStatus(response.status)
    ? WEBHARD_LOGIN_REQUIRED_MESSAGE
    : payload?.message || payload?.error || fallbackMessage;

  return new WebhardApiError(response.status, message);
}

export interface FetchWebhardFilesParams {
  folderId?: string;
  companyId?: string;
  sortBy: 'name' | 'date' | 'size';
  sortOrder: 'asc' | 'desc';
  page?: number;
  limit?: number;
}

export interface WebhardFilesResponse {
  files: WebhardFile[];
  pagination?: {
    page: number;
    limit: number;
    hasMore: boolean;
  };
}

/**
 * 웹하드 파일 목록을 가져옵니다.
 * prefetchQuery와 useQuery 모두에서 사용하여 데이터 구조 일관성을 보장합니다.
 */
export async function fetchWebhardFiles(
  params: FetchWebhardFilesParams
): Promise<WebhardFilesResponse> {
  const searchParams = new URLSearchParams();

  if (params.folderId) {
    searchParams.set('folderId', params.folderId);
  }
  if (params.companyId) {
    searchParams.set('companyId', params.companyId);
  }
  searchParams.set('sortBy', params.sortBy);
  searchParams.set('sortOrder', params.sortOrder);
  searchParams.set('page', String(params.page || 1));
  searchParams.set('limit', String(params.limit || 50));

  const response = await fetch(`/api/webhard/files?${searchParams.toString()}`);

  if (!response.ok) {
    throw await createWebhardApiError(response, 'Failed to fetch files');
  }

  const data = (await response.json()) as {
    files: (WebhardFile & {
      companies?:
        | { company_name: string; manager_name?: string | null }
        | { company_name: string; manager_name?: string | null }[]
        | null;
    })[];
    pagination?: {
      page: number;
      limit: number;
      hasMore: boolean;
    };
    total?: number;
    page?: number;
    limit?: number;
    hasMore?: boolean;
  };

  // 조인 결과를 평탄화 (관리자만 companies 포함)
  // 이 변환은 prefetch와 useQuery 모두에서 동일하게 적용됩니다.
  const files = data.files.map((file) => ({
    ...file,
    companies: Array.isArray(file.companies) ? file.companies[0] : file.companies,
  }));

  const pagination =
    data.pagination ??
    (typeof data.page === 'number' &&
    typeof data.limit === 'number' &&
    typeof data.hasMore === 'boolean'
      ? {
          page: data.page,
          limit: data.limit,
          hasMore: data.hasMore,
        }
      : undefined);

  return { files, pagination };
}
