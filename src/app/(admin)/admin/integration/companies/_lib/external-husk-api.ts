/**
 * task 27 Phase C: 외부웹하드 husk 정리 API 호출 헬퍼.
 * NestJS `/api/v1/folders/external-husk` endpoint 와 통신.
 *
 * 글로벌 CsrfGuard 정책 (`feedback_csrf_token_required`):
 * 모든 mutation 에 `x-csrf-token` 헤더 자동 부착.
 */

import { NESTJS_CLIENT_API_BASE } from '@/lib/api/api-base';

const EXTERNAL_HUSK_BASE = `${NESTJS_CLIENT_API_BASE}/folders/external-husk`;

export interface ExternalHusk {
  id: string;
  name: string;
  path: string | null;
  createdAt: string;
}

export interface CleanupHuskResponse {
  deletedFolderIds: string[];
}

/**
 * Double Submit Cookie 패턴 — webhard-api 의 글로벌 CsrfGuard 가
 * 세션 기반 POST/PATCH/DELETE 요청에 `x-csrf-token` 헤더를 요구.
 */
function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match?.[1];
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const csrfToken = getCsrfToken();
  const res = await fetch(`${EXTERNAL_HUSK_BASE}${path}`, {
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

export const externalHuskApi = {
  list: (): Promise<ExternalHusk[]> => apiFetch<ExternalHusk[]>(''),

  cleanup: (rootId: string): Promise<CleanupHuskResponse> =>
    apiFetch<CleanupHuskResponse>(`/${rootId}`, { method: 'DELETE' }),
};
