'use client';

import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { updateProcessStage } from '@/app/actions/contacts';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { logger } from '@/lib/utils/logger';
import { Button } from '@/components/ui/button';
import { ConfirmModal } from './ConfirmModal';
import { mapStageTransitionError } from '@/lib/utils/stage-transition-errors';
import type { Contact } from '@/lib/types/contact';
import type { ProcessStage } from '@/lib/utils/processStages';

const officeLogger = logger.createLogger('OfficeAdvance');

interface OfficeAdvanceButtonProps {
  contact: Contact;
  onAdvance: () => void;
  onAdvanceComplete: () => void;
  isAdvancing: boolean;
}

// 사무실 단계 전환: null → drawing → sample → drawing_confirmed
const OFFICE_NEXT_STAGE: Record<string, NonNullable<ProcessStage>> = {
  '': 'drawing', // null (공정 시작 전) → 도면작업
  drawing: 'sample', // 도면작업 → 샘플제작
  sample: 'drawing_confirmed', // 샘플제작 → 도면 확정 (현장으로 이관)
};

const OFFICE_BUTTON_LABELS: Record<string, string> = {
  '': '도면작업 시작',
  drawing: '샘플제작 전환',
  sample: '도면 확정',
};

export default function OfficeAdvanceButton({
  contact,
  onAdvance,
  onAdvanceComplete,
  isAdvancing,
}: OfficeAdvanceButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [errorModal, setErrorModal] = useState<{ title: string; message: string } | null>(null);
  const queryClient = useQueryClient();

  const stageKey = contact.process_stage ?? '';
  const nextStage = OFFICE_NEXT_STAGE[stageKey];
  const buttonLabel = OFFICE_BUTTON_LABELS[stageKey];

  if (!nextStage || !buttonLabel) return null;

  const handleAdvance = async () => {
    setShowConfirm(false);
    onAdvance();
    setIsLoading(true);

    const officeQueryKey = queryKeys.processBoard.board({ workCategory: 'office' });
    const unclassifiedQueryKey = queryKeys.processBoard.board({ workCategory: 'unclassified' });
    const fieldQueryKey = queryKeys.processBoard.board({ workCategory: 'field' });

    // drawing_confirmed로 이관 시 office → field 카테고리 전환 발생
    const isCategoryTransition = nextStage === 'drawing_confirmed';

    // 낙관적 업데이트를 위한 이전 데이터 저장
    const previousOfficeData = queryClient.getQueryData<Contact[]>(officeQueryKey);
    const previousUnclassifiedData = queryClient.getQueryData<Contact[]>(unclassifiedQueryKey);
    const previousFieldData = isCategoryTransition
      ? queryClient.getQueryData<Contact[]>(fieldQueryKey)
      : undefined;

    const updatedContact = {
      ...contact,
      process_stage: nextStage,
      updated_at: new Date().toISOString(),
    };

    if (isCategoryTransition) {
      // office/unclassified 캐시에서 제거, field 캐시에 추가
      queryClient.setQueryData<Contact[]>(officeQueryKey, (old) =>
        old?.filter((c) => c.id !== contact.id)
      );
      queryClient.setQueryData<Contact[]>(unclassifiedQueryKey, (old) =>
        old?.filter((c) => c.id !== contact.id)
      );
      queryClient.setQueryData<Contact[]>(fieldQueryKey, (old) =>
        old ? [...old, updatedContact] : [updatedContact]
      );
    } else {
      // 사무실 내 단계 변경: office 캐시만 업데이트
      queryClient.setQueryData<Contact[]>(officeQueryKey, (old) =>
        old?.map((c) => (c.id === contact.id ? updatedContact : c))
      );
      queryClient.setQueryData<Contact[]>(unclassifiedQueryKey, (old) =>
        old?.map((c) => (c.id === contact.id ? updatedContact : c))
      );
    }

    try {
      const result = await updateProcessStage(contact.id, nextStage);

      if (!result.success) {
        // 실패 시 롤백
        queryClient.setQueryData(officeQueryKey, previousOfficeData);
        queryClient.setQueryData(unclassifiedQueryKey, previousUnclassifiedData);
        if (isCategoryTransition) {
          queryClient.setQueryData(fieldQueryKey, previousFieldData);
        }
        setErrorModal(mapStageTransitionError(result.error));
        return;
      }

      if (isCategoryTransition) {
        // 카테고리 전환: 양쪽 쿼리 모두 백그라운드 refetch
        queryClient.invalidateQueries({ queryKey: officeQueryKey });
        queryClient.invalidateQueries({ queryKey: unclassifiedQueryKey });
        queryClient.invalidateQueries({ queryKey: fieldQueryKey });
      } else {
        // 사무실 내 단계 변경: office + unclassified만 refetch
        queryClient.invalidateQueries({ queryKey: officeQueryKey });
        queryClient.invalidateQueries({ queryKey: unclassifiedQueryKey });
      }
    } catch (error) {
      // 실패 시 롤백
      queryClient.setQueryData(officeQueryKey, previousOfficeData);
      queryClient.setQueryData(unclassifiedQueryKey, previousUnclassifiedData);
      if (isCategoryTransition) {
        queryClient.setQueryData(fieldQueryKey, previousFieldData);
      }
      officeLogger.error('단계 이동 실패:', error);
      setErrorModal(mapStageTransitionError(error));
    } finally {
      setIsLoading(false);
      onAdvanceComplete();
    }
  };

  return (
    <>
      <Button
        variant="primary"
        size="sm"
        onClick={() => setShowConfirm(true)}
        disabled={isAdvancing || isLoading}
        className="text-sm font-bold whitespace-nowrap shadow-none hover:shadow-none"
      >
        {isAdvancing || isLoading ? (
          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
        ) : (
          buttonLabel
        )}
      </Button>
      <ConfirmModal
        isOpen={showConfirm}
        title={buttonLabel}
        message={`${buttonLabel} 처리하시겠습니까?`}
        type="confirm"
        confirmText="확인"
        onConfirm={handleAdvance}
        onCancel={() => setShowConfirm(false)}
      />
      <ConfirmModal
        isOpen={!!errorModal}
        title={errorModal?.title || '오류'}
        message={errorModal?.message || ''}
        type="error"
        confirmText="확인"
        onConfirm={() => setErrorModal(null)}
        onCancel={() => setErrorModal(null)}
      />
    </>
  );
}
