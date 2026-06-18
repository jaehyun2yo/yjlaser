/**
 * task 26: 미매칭 외부웹하드 폴더 API 호출 헬퍼.
 * NestJS `GET /api/v1/folders/external-unmatched` endpoint 와 통신.
 */

import { NESTJS_CLIENT_API_BASE } from '@/lib/api/api-base';

const EXTERNAL_UNMATCHED_BASE = `${NESTJS_CLIENT_API_BASE}/folders/external-unmatched`;

export interface ExternalUnmatchedFolder {
  id: string;
  name: string;
  path: string | null;
  /** 폴더 트리 BFS 누적 contact 수 */
  contactCount: number;
  /** 폴더 트리 BFS 누적 파일 수 */
  fileCount: number;
  createdAt: string;
}

/**
 * Double Submit Cookie 패턴 — webhard-api 의 글로벌 CsrfGuard 가
 * 세션 기반 POST/PATCH/DELETE 요청에 `x-csrf-token` 헤더를 요구.
 * 현재 이 헬퍼는 GET 만 사용하지만, 향후 mutation 추가 시 자동 적용되도록 미리 부착.
 */
function getCsrfToken(): string | undefined {
  if (typeof document === 'undefined') return undefined;
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match?.[1];
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const csrfToken = getCsrfToken();
  const res = await fetch(`${EXTERNAL_UNMATCHED_BASE}${path}`, {
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

export const externalUnmatchedApi = {
  list: (): Promise<ExternalUnmatchedFolder[]> => apiFetch<ExternalUnmatchedFolder[]>(''),
};
