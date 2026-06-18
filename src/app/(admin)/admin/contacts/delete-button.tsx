'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useToast } from '@/hooks/useToast';
import { BG_COLOR, TRANSITION_STYLES } from '@/lib/styles';
import { ConfirmModal } from '@/components/modals/ConfirmModal';

interface DeleteButtonProps {
  contactId: string;
  contactName: string;
}

export function DeleteButton({ contactId, contactName }: DeleteButtonProps) {
  const queryClient = useQueryClient();
  const { success, error: showError } = useToast();
  const [isDeleting, setIsDeleting] = useState(false);
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);

  const handleDeleteClick = () => {
    setIsConfirmOpen(true);
  };

  const handleConfirmDelete = async () => {
    setIsConfirmOpen(false);
    setIsDeleting(true);

    // Optimistic Update: 즉시 UI에서 제거
    const previousData = queryClient.getQueryData(queryKeys.contacts.all);

    queryClient.setQueryData(queryKeys.contacts.all, (old: unknown) => {
      if (!old || typeof old !== 'object') return old;
      const oldData = old as {
        pages?: Array<{
          contacts?: Array<{ id: string }>;
          totalCount?: number;
        }>;
      };
      if (!oldData.pages) return old;
      return {
        ...oldData,
        pages: oldData.pages.map((page) => ({
          ...page,
          contacts: page.contacts?.filter((c) => c.id !== contactId) || [],
          totalCount: (page.totalCount || 0) - 1,
        })),
      };
    });

    try {
      const response = await fetch(`/api/contacts/${contactId}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        success('문의가 삭제되었습니다.');
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
      } else {
        queryClient.setQueryData(queryKeys.contacts.all, previousData);
        const errorData = await response.json();
        showError(`삭제 실패: ${errorData.error || '알 수 없는 오류가 발생했습니다.'}`);
      }
    } catch {
      queryClient.setQueryData(queryKeys.contacts.all, previousData);
      showError('삭제 중 오류가 발생했습니다.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <button
        onClick={handleDeleteClick}
        disabled={isDeleting}
        className={`px-2.5 py-1 text-[11px] rounded bg-red-600/80 hover:bg-red-600/90 text-white border border-red-500/50 hover:border-red-500/70 ${TRANSITION_STYLES.colors} disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer`}
      >
        {isDeleting ? '삭제 중...' : '삭제'}
      </button>
      <ConfirmModal
        isOpen={isConfirmOpen}
        onClose={() => setIsConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="문의 삭제"
        message={
          <>
            정말로 <strong>&ldquo;{contactName}&rdquo;</strong> 문의를 삭제하시겠습니까?
            <br />
            <span className="text-red-500">이 작업은 되돌릴 수 없습니다.</span>
          </>
        }
        confirmLabel="삭제"
        cancelLabel="취소"
        isSubmitting={isDeleting}
        iconBgColor={BG_COLOR.errorMedium}
        icon={
          <svg
            className="h-6 w-6 text-red-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
            />
          </svg>
        }
      />
    </>
  );
}
