'use client';

import { useEffect, useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { Contact } from '@/lib/types';
import { logger } from '@/lib/utils/logger';
import { BORDER_COLOR, BG_COLOR, TEXT_COLOR } from '@/lib/styles';

const log = logger.createLogger('UpdateStatusButton');

// 무한 쿼리 데이터 타입
interface InfiniteQueryData {
  pages: Array<{
    contacts: Contact[];
    [key: string]: unknown;
  }>;
  pageParams: unknown[];
}

interface UpdateStatusButtonProps {
  contactId: string;
  currentStatus: string;
}

export function UpdateStatusButton({ contactId, currentStatus }: UpdateStatusButtonProps) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState(currentStatus);
  const [isUpdating, setIsUpdating] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    setIsHydrated(true);
  }, []);

  const handleStatusChange = useCallback(
    async (newStatus: string) => {
      if (!isHydrated || isUpdating || newStatus === status) return;

      setIsUpdating(true);
      const previousStatus = status;

      // 1. 낙관적 UI 업데이트
      setStatus(newStatus);

      // 2. 낙관적 캐시 업데이트 - 목록 쿼리
      queryClient.setQueriesData({ queryKey: queryKeys.contacts.all }, (oldData: unknown) => {
        if (!oldData) return oldData;

        const infiniteData = oldData as InfiniteQueryData;
        if (infiniteData.pages) {
          return {
            ...infiniteData,
            pages: infiniteData.pages.map((page) => ({
              ...page,
              contacts:
                page.contacts?.map((contact) =>
                  contact.id === contactId ? { ...contact, status: newStatus } : contact
                ) || [],
            })),
          };
        }

        if (Array.isArray(oldData)) {
          return oldData.map((contact: Contact) =>
            contact.id === contactId ? { ...contact, status: newStatus } : contact
          );
        }

        return oldData;
      });

      // 3. 낙관적 캐시 업데이트 - 상세 쿼리
      queryClient.setQueryData(queryKeys.contacts.detail(contactId), (oldData: unknown) => {
        if (!oldData) return oldData;
        return { ...(oldData as Contact), status: newStatus };
      });

      try {
        // 4. API 호출
        const response = await fetch(`/api/contacts/${contactId}/status`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: newStatus }),
        });

        if (response.ok) {
          // 5. 성공 시 캐시 무효화 (서버 데이터와 동기화)
          // router.refresh() 제거 - React Query 캐시만으로 동기화하여 성능 최적화
          await Promise.all([
            queryClient.invalidateQueries({
              queryKey: queryKeys.contacts.all,
              refetchType: 'active',
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.contacts.detail(contactId),
              refetchType: 'active',
            }),
            queryClient.invalidateQueries({
              queryKey: queryKeys.processBoard.all,
            }),
          ]);
        } else {
          setStatus(previousStatus);
          queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
          queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
          alert('상태 변경에 실패했습니다.');
        }
      } catch (error) {
        setStatus(previousStatus);
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        log.error('Error updating status:', error);
        alert('상태 변경 중 오류가 발생했습니다.');
      } finally {
        setIsUpdating(false);
      }
    },
    [contactId, status, isHydrated, isUpdating, queryClient]
  );

  return (
    <div className="flex gap-2">
      <select
        data-testid="admin-status-select"
        data-hydrated={isHydrated ? 'true' : 'false'}
        data-updating={isUpdating ? 'true' : 'false'}
        value={status}
        onChange={(e) => handleStatusChange(e.target.value)}
        disabled={!isHydrated || isUpdating}
        className={`px-3 py-1 text-xs border ${BORDER_COLOR.default} rounded ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:outline-none focus:ring-2 focus:ring-orange-500 disabled:opacity-50`}
      >
        <option value="received">접수</option>
        <option value="drawing">도면작업</option>
        <option value="confirmed">컨펌</option>
        <option value="production">목형제작</option>
        <option value="cutting">레이저가공</option>
        <option value="finishing">칼/오시</option>
        <option value="delivered">납품</option>
        <option value="completed">작업완료</option>
        <option value="on_hold">보류</option>
      </select>
    </div>
  );
}
