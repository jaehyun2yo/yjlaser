/**
 * React Query Mutation 유틸리티
 * 일관된 mutation 패턴과 캐시 무효화 전략을 제공합니다.
 */

import { useMutation, useQueryClient, UseMutationOptions } from '@tanstack/react-query';
import { queryKeys } from './queryKeys';

/**
 * Mutation 후 캐시 무효화 헬퍼
 */
export function useInvalidateQueries() {
  const queryClient = useQueryClient();

  return {
    /**
     * 문의 관련 쿼리 무효화
     */
    invalidateContacts: (options?: { id?: number | string }) => {
      if (options?.id) {
        // 특정 문의만 무효화
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.detail(options.id) });
        // 목록도 무효화 (목록에 영향이 있을 수 있음)
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.lists() });
      } else {
        // 모든 문의 관련 쿼리 무효화
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      }
    },

    /**
     * 회사 관련 쿼리 무효화
     */
    invalidateCompanies: (options?: { id?: number | string }) => {
      if (options?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.companies.detail(options.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.companies.lists() });
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.companies.all });
      }
    },

    /**
     * 포트폴리오 관련 쿼리 무효화
     */
    invalidatePortfolio: (options?: { id?: number | string }) => {
      if (options?.id) {
        queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.detail(options.id) });
        queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.lists() });
      } else {
        queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.all });
      }
    },

    /**
     * 대시보드 통계 무효화
     */
    invalidateDashboard: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard.all });
    },
  };
}

/**
 * API 응답 에러를 처리하는 헬퍼
 */
async function handleApiResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({ error: 'Unknown error' }));
    throw new Error(errorBody.error || `API error: ${response.status}`);
  }
  return response.json();
}

/**
 * 문의 상태 업데이트 Mutation
 */
export function useUpdateContactStatus<TData = unknown, TError = Error>(
  options?: Omit<
    UseMutationOptions<TData, TError, { id: number | string; status: string }, unknown>,
    'mutationFn'
  >
) {
  const { invalidateContacts } = useInvalidateQueries();

  return useMutation({
    ...options,
    mutationFn: async ({ id, status }: { id: number | string; status: string }) => {
      const response = await fetch(`/api/contacts/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });

      const data = await handleApiResponse<{ success: boolean }>(response);

      // 성공 시 관련 쿼리 무효화
      invalidateContacts({ id });

      return data as TData;
    },
  });
}

/**
 * 문의 삭제 Mutation
 */
export function useDeleteContact<TData = void, TError = Error>(
  options?: Omit<UseMutationOptions<TData, TError, { id: number | string }, unknown>, 'mutationFn'>
) {
  const queryClient = useQueryClient();
  const { invalidateContacts } = useInvalidateQueries();

  return useMutation({
    ...options,
    mutationFn: async ({ id }: { id: number | string }) => {
      const response = await fetch(`/api/contacts/${id}`, {
        method: 'DELETE',
      });

      await handleApiResponse<{ success: boolean }>(response);

      // 삭제된 문의 캐시 제거
      queryClient.removeQueries({ queryKey: queryKeys.contacts.detail(id) });
      // 목록 무효화
      invalidateContacts();

      return undefined as TData;
    },
  });
}
