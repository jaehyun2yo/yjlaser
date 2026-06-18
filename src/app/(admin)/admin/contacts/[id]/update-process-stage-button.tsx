'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { updateProcessStage } from '@/app/actions/contacts';
import { PROCESS_STAGES_ARRAY, type ProcessStage } from '@/lib/utils/processStages';
import { TEXT_COLOR } from '@/lib/styles';
import { NativeSelect } from '@/components/ui/select';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { logger } from '@/lib/utils/logger';
import { mapStageTransitionError } from '@/lib/utils/stage-transition-errors';

const log = logger.createLogger('UpdateProcessStageButton');

interface UpdateProcessStageButtonProps {
  contactId: string;
  currentStage: ProcessStage;
  status: string;
}

export function UpdateProcessStageButton({
  contactId,
  currentStage,
  status,
}: UpdateProcessStageButtonProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [stage, setStage] = useState<ProcessStage>(currentStage);
  const [isUpdating, setIsUpdating] = useState(false);

  const handleStageChange = async (newStage: ProcessStage) => {
    if (isUpdating) return;

    setIsUpdating(true);
    try {
      const result = await updateProcessStage(contactId, newStage);

      if (result.success) {
        setStage(newStage);
        // React Query 캐시 무효화
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.detail(contactId) });
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all });
        // 서버 컴포넌트도 새로고침
        router.refresh();
      } else {
        const { title, message } = mapStageTransitionError(result.error);
        alert(`${title}\n\n${message}`);
      }
    } catch (error) {
      log.error('Error updating process stage:', error);
      const { title, message } = mapStageTransitionError(error);
      alert(`${title}\n\n${message}`);
    } finally {
      setIsUpdating(false);
    }
  };

  // status가 'drawing' 미만이면 공정 단계 변경 불가
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

  return (
    <div className="space-y-2">
      <label className={`block text-sm font-medium ${TEXT_COLOR.secondary}`}>공정 단계</label>
      <NativeSelect
        value={stage || ''}
        onChange={(e) => handleStageChange((e.target.value as ProcessStage) || null)}
        disabled={isUpdating}
        className="w-full"
      >
        <option value="">공정 시작 전</option>
        {PROCESS_STAGES_ARRAY.map((stageInfo) => (
          <option key={stageInfo.id} value={stageInfo.id ?? ''}>
            {stageInfo.order}. {stageInfo.label}
          </option>
        ))}
      </NativeSelect>
      {isUpdating && <p className={`text-xs ${TEXT_COLOR.muted}`}>업데이트 중...</p>}
    </div>
  );
}
