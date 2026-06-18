'use client';

import { useState, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { logger } from '@/lib/utils/logger';
import type { Contact, InquiryType } from '@/lib/types';

const log = logger.createLogger('ClassifyInquiryType');

const STATUS_MAP: Record<InquiryType, string> = {
  cutting_request: 'drawing',
  mold_request: 'confirmed',
  laser_cutting: 'cutting',
};

export function useClassifyInquiryType(contact: Contact): {
  classify: (inquiryType: InquiryType) => Promise<void>;
  isPending: boolean;
  pendingType: InquiryType | null;
} {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);
  const [pendingType, setPendingType] = useState<InquiryType | null>(null);

  const classify = useCallback(
    async (inquiryType: InquiryType) => {
      setIsPending(true);
      setPendingType(inquiryType);

      const previousData = queryClient.getQueriesData({ queryKey: queryKeys.contacts.all });
      const previousBoardData = queryClient.getQueriesData({
        queryKey: queryKeys.processBoard.all,
      });

      queryClient.setQueriesData({ queryKey: queryKeys.contacts.all }, (old: unknown) => {
        if (!old || typeof old !== 'object') return old;
        const data = old as {
          pages: Array<{ contacts: Contact[]; [key: string]: unknown }>;
          pageParams: unknown[];
        };
        if (!data.pages) return old;

        return {
          ...data,
          pages: data.pages.map((page) => ({
            ...page,
            contacts: page.contacts.map((c) =>
              c.id === contact.id
                ? { ...c, inquiry_type: inquiryType, status: STATUS_MAP[inquiryType] }
                : c
            ),
          })),
        };
      });

      queryClient.setQueriesData({ queryKey: queryKeys.processBoard.all }, (old: unknown) => {
        if (!Array.isArray(old)) return old;
        return (old as Contact[]).filter((c) => c.id !== contact.id);
      });

      try {
        const response = await fetch(`/api/contacts/${contact.id}/inquiry-type`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ inquiry_type: inquiryType }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || '문의 유형 변경에 실패했습니다.');
        }

        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
      } catch (err) {
        log.error('Error updating inquiry_type', err);
        previousData.forEach(([key, value]) => {
          queryClient.setQueryData(key, value);
        });
        previousBoardData.forEach(([key, value]) => {
          queryClient.setQueryData(key, value);
        });
        alert(err instanceof Error ? err.message : '문의 유형 변경에 실패했습니다.');
      } finally {
        setIsPending(false);
        setPendingType(null);
      }
    },
    [contact.id, queryClient]
  );

  return { classify, isPending, pendingType };
}
