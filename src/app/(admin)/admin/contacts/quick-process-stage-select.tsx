'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { updateProcessStage } from '@/app/actions/contacts';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('QuickProcessStageSelect');
import {
  PROCESS_STAGES_ARRAY,
  getProcessStageInfo,
  type ProcessStage,
} from '@/lib/utils/processStages';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { BG_COLOR, TEXT_COLOR } from '@/lib/styles';

interface QuickProcessStageSelectProps {
  contactId: string;
  currentStage: ProcessStage;
  status: string;
  disabled?: boolean; // 읽기 전용 모드 (업체 대시보드에서 사용)
}

interface InfiniteQueryData {
  pages: Array<{
    contacts: Array<{
      id: string;
      process_stage: ProcessStage;
      status: string;
      [key: string]: unknown;
    }>;
    [key: string]: unknown;
  }>;
  pageParams: unknown[];
  [key: string]: unknown;
}

interface ContactData {
  id: string;
  process_stage: ProcessStage;
  status: string;
  [key: string]: unknown;
}

export function QuickProcessStageSelect({
  contactId,
  currentStage,
  status,
  disabled = false,
}: QuickProcessStageSelectProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<ProcessStage>(currentStage);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedStage, setSelectedStage] = useState<ProcessStage | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);

  const handleStageClick = useCallback(
    (newStage: ProcessStage) => {
      // 현재 단계와 같으면 변경하지 않음
      if (newStage === stage) return;

      setSelectedStage(newStage);
      setShowConfirmModal(true);
    },
    [stage]
  );

  const handleCancel = useCallback(() => {
    setShowConfirmModal(false);
    setSelectedStage(null);
  }, []);

  // status가 'drawing' 이상이면 공정 단계 변경 가능
  if (
    status !== 'drawing' &&
    status !== 'confirmed' &&
    status !== 'production' &&
    status !== 'cutting' &&
    status !== 'finishing' &&
    status !== 'delivered'
  ) {
    return null;
  }

  const handleConfirm = async () => {
    if (!selectedStage || isUpdating) return;

    // selectedStage가 null이 아님을 확인했으므로 타입 단언 사용
    const stageToUpdate = selectedStage as NonNullable<ProcessStage>;
    setIsUpdating(true);
    setShowConfirmModal(false);

    // 낙관적 업데이트: UI를 먼저 업데이트
    const previousStage = stage;
    setStage(stageToUpdate);

    // 모든 contacts 관련 쿼리의 캐시를 낙관적으로 업데이트
    queryClient.setQueriesData({ queryKey: queryKeys.contacts.all }, (oldData: unknown) => {
      if (!oldData) return oldData;

      // useInfiniteQuery의 경우
      const infiniteData = oldData as InfiniteQueryData;
      if (infiniteData.pages) {
        let hasUpdate = false;
        const updatedPages = infiniteData.pages.map((page) => {
          const updatedContacts =
            page.contacts?.map((contact) => {
              if (contact.id === contactId) {
                hasUpdate = true;
                // 상태도 함께 업데이트 (납품 단계면 completed, 그 외는 in_progress)
                let newStatus = contact.status;
                if (stageToUpdate === 'delivery') {
                  newStatus = 'delivered';
                } else if (contact.status === 'completed') {
                  newStatus = 'drawing';
                }
                return {
                  ...contact,
                  process_stage: stageToUpdate,
                  status: newStatus,
                };
              }
              return contact;
            }) || [];

          return {
            ...page,
            contacts: updatedContacts,
          };
        });

        return hasUpdate ? { ...infiniteData, pages: updatedPages } : oldData;
      }

      // 일반 배열인 경우
      if (Array.isArray(oldData)) {
        return oldData.map((contact: ContactData) => {
          if (contact.id === contactId) {
            let newStatus = contact.status;
            if (stageToUpdate === 'delivery') {
              newStatus = 'delivered';
            } else if (contact.status === 'completed') {
              newStatus = 'drawing';
            }
            return {
              ...contact,
              process_stage: stageToUpdate,
              status: newStatus,
            };
          }
          return contact;
        });
      }

      return oldData;
    });

    // detail 쿼리도 낙관적으로 업데이트
    queryClient.setQueryData(queryKeys.contacts.detail(contactId), (oldData: unknown) => {
      if (!oldData) return oldData;
      const contactData = oldData as ContactData;
      let newStatus = contactData.status;
      if (stageToUpdate === 'delivery') {
        newStatus = 'delivered';
      } else if (contactData.status === 'completed') {
        newStatus = 'drawing';
      }
      return {
        ...contactData,
        process_stage: stageToUpdate,
        status: newStatus,
      };
    });

    try {
      const result = await updateProcessStage(contactId, stageToUpdate);

      if (result.success) {
        // 성공 시 모든 관련 쿼리 무효화 및 즉시 재가져오기
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
        router.refresh();
      } else {
        setStage(previousStage);
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        alert(`공정 단계 변경에 실패했습니다: ${result.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      setStage(previousStage);
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
      log.error('Error updating process stage:', error);
      alert('공정 단계 변경 중 오류가 발생했습니다.');
    } finally {
      setIsUpdating(false);
      setSelectedStage(null);
    }
  };

  const currentOrder = getProcessStageInfo(stage)?.order || 0;
  const selectedStageInfo = selectedStage ? getProcessStageInfo(selectedStage) : null;

  return (
    <>
      <div className="flex items-center gap-0.5 flex-wrap">
        {PROCESS_STAGES_ARRAY.map((stageInfo, index) => {
          const isCompleted = stageInfo.order < currentOrder;
          const isCurrent = stageInfo.order === currentOrder;
          const isClickable = !isUpdating;

          return (
            <div key={stageInfo.id} className="flex items-center">
              <button
                type="button"
                onClick={() => !disabled && isClickable && handleStageClick(stageInfo.id)}
                disabled={disabled || !isClickable}
                className={`
                  flex items-center gap-1 px-1.5 py-1 rounded transition-all duration-200
                  ${
                    disabled || !isClickable
                      ? 'cursor-default'
                      : 'cursor-pointer hover:scale-105 focus:outline-none focus:ring-1 focus:ring-[#ED6C00] focus:ring-offset-1'
                  }
                  ${
                    isCompleted
                      ? 'bg-green-500 text-white font-medium'
                      : isCurrent
                        ? `${BG_COLOR.primary} ${TEXT_COLOR.white} border border-[#ED6C00] font-medium`
                        : disabled || !isClickable
                          ? `${BG_COLOR.muted} ${TEXT_COLOR.muted}`
                          : `${BG_COLOR.muted} ${TEXT_COLOR.muted} ${BG_COLOR.hoverPrimaryLight} ${TEXT_COLOR.hoverBrand}`
                  }
                `}
                title={stageInfo.label}
              >
                <span className="text-[10px] font-semibold whitespace-nowrap">
                  {isCompleted && '✓ '}
                  {stageInfo.label}
                </span>
              </button>
              {index < PROCESS_STAGES_ARRAY.length - 1 && (
                <div className={`w-1.5 h-0.5 ${BG_COLOR.muted} mx-0.5`} />
              )}
            </div>
          );
        })}
      </div>

      {/* 확인 모달 */}
      {selectedStageInfo && (
        <ConfirmModal
          isOpen={showConfirmModal}
          onClose={handleCancel}
          onConfirm={handleConfirm}
          title="공정 단계 변경"
          message={
            <>
              공정 단계를 <strong className={TEXT_COLOR.brand}>{selectedStageInfo.label}</strong>로
              변경하시겠습니까?
            </>
          }
          confirmLabel="변경"
          cancelLabel="취소"
          isSubmitting={isUpdating}
          icon={
            <svg
              className={`h-6 w-6 ${TEXT_COLOR.brand}`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          }
        />
      )}
    </>
  );
}
