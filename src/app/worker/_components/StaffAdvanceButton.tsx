'use client';

import { useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { updateProcessStage, startDelivery, completeLaserOnly } from '@/app/actions/contacts';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { logger } from '@/lib/utils/logger';
import { ConfirmModal } from './ConfirmModal';
import { WORKER_STAGES } from '@/app/worker/_lib/hooks';
import { isLaserOnlyInquiry } from '@/lib/utils/processStages';
import { mapStageTransitionError } from '@/lib/utils/stage-transition-errors';
import type { Contact } from '@/lib/types/contact';
import type { ProcessStage } from '@/lib/utils/processStages';

interface StaffAdvanceButtonProps {
  contact: Contact;
  onAdvance: () => void;
  onAdvanceComplete: () => void;
  isAdvancing: boolean;
}

export default function StaffAdvanceButton({
  contact,
  onAdvance,
  onAdvanceComplete,
  isAdvancing,
}: StaffAdvanceButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [remainingMin, setRemainingMin] = useState<number | null>(null);
  const [showAdvanceConfirm, setShowAdvanceConfirm] = useState(false);
  const [showDeliveryConfirm, setShowDeliveryConfirm] = useState(false);
  const [showLaserCompleteConfirm, setShowLaserCompleteConfirm] = useState(false);
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const isSubmittingRef = useRef(false);
  const queryClient = useQueryClient();
  const log = logger.createLogger('StaffAdvanceButton');

  const isLaserOnly = isLaserOnlyInquiry(contact.inquiry_type) && contact.process_stage === 'laser';
  const deliveryStarted = contact.process_stage === 'delivery' && contact.status === 'delivered';

  useEffect(() => {
    if (!deliveryStarted) {
      setRemainingMin(null);
      return;
    }

    const calcRemaining = () => {
      const elapsedMs = Date.now() - new Date(contact.updated_at).getTime();
      return Math.max(0, 30 - Math.floor(elapsedMs / 60000));
    };

    setRemainingMin(calcRemaining());

    const interval = setInterval(() => {
      setRemainingMin(calcRemaining());
    }, 60000);

    return () => clearInterval(interval);
  }, [deliveryStarted, contact.updated_at]);

  const currentWorkerIndex = (WORKER_STAGES as readonly string[]).indexOf(
    contact.process_stage as string
  );
  const nextStage: NonNullable<ProcessStage> | null =
    currentWorkerIndex >= 0 && currentWorkerIndex < WORKER_STAGES.length - 1
      ? WORKER_STAGES[currentWorkerIndex + 1]
      : null;

  const handleAdvance = async () => {
    if (!nextStage || isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    setShowAdvanceConfirm(false);
    onAdvance();
    setIsLoading(true);

    // 낙관적 업데이트: field 캐시에서 해당 contact의 process_stage 즉시 변경
    const fieldQueryKey = queryKeys.processBoard.board({ workCategory: 'field' });
    const previousFieldData = queryClient.getQueryData<Contact[]>(fieldQueryKey);

    queryClient.setQueryData<Contact[]>(fieldQueryKey, (old) =>
      old?.map((c) =>
        c.id === contact.id
          ? { ...c, process_stage: nextStage, updated_at: new Date().toISOString() }
          : c
      )
    );

    try {
      const result = await updateProcessStage(contact.id, nextStage);

      if (!result.success) {
        // 실패 시 롤백
        queryClient.setQueryData(fieldQueryKey, previousFieldData);
        setErrorModal(mapStageTransitionError(result.error).message);
        return;
      }

      // 성공 시 field 쿼리만 백그라운드 refetch
      queryClient.invalidateQueries({ queryKey: fieldQueryKey });
    } catch (error) {
      // 실패 시 롤백
      queryClient.setQueryData(fieldQueryKey, previousFieldData);
      logger.error('단계 이동 실패:', error);
      setErrorModal('단계 이동 중 오류가 발생했습니다.');
    } finally {
      isSubmittingRef.current = false;
      setIsLoading(false);
      onAdvanceComplete();
    }
  };

  const handleStartDelivery = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    setShowDeliveryConfirm(false);
    onAdvance();
    setIsLoading(true);

    // 낙관적 업데이트: field 캐시에서 해당 contact의 status를 delivered로 즉시 변경
    const fieldQueryKey = queryKeys.processBoard.board({ workCategory: 'field' });
    const previousFieldData = queryClient.getQueryData<Contact[]>(fieldQueryKey);

    queryClient.setQueryData<Contact[]>(fieldQueryKey, (old) =>
      old?.map((c) =>
        c.id === contact.id
          ? { ...c, status: 'delivered', updated_at: new Date().toISOString() }
          : c
      )
    );

    try {
      const result = await startDelivery(contact.id);

      if (!result.success) {
        // 실패 시 롤백
        queryClient.setQueryData(fieldQueryKey, previousFieldData);
        setErrorModal(result.error || '납품 시작에 실패했습니다.');
        return;
      }

      // 성공 시 field 쿼리만 백그라운드 refetch
      queryClient.invalidateQueries({ queryKey: fieldQueryKey });
    } catch (error) {
      // 실패 시 롤백
      queryClient.setQueryData(fieldQueryKey, previousFieldData);
      logger.error('납품 시작 실패:', error);
      setErrorModal('납품 시작 중 오류가 발생했습니다.');
    } finally {
      isSubmittingRef.current = false;
      setIsLoading(false);
      onAdvanceComplete();
    }
  };

  // 레이저 전용 완료 처리
  const handleCompleteLaser = async () => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;

    setShowLaserCompleteConfirm(false);
    onAdvance();
    setIsLoading(true);

    // 낙관적 업데이트
    const fieldQueryKey = queryKeys.processBoard.board({ workCategory: 'field' });
    const previousFieldData = queryClient.getQueryData<Contact[]>(fieldQueryKey);

    queryClient.setQueryData<Contact[]>(fieldQueryKey, (old) =>
      old?.map((c) =>
        c.id === contact.id
          ? { ...c, status: 'completed', process_stage: null, updated_at: new Date().toISOString() }
          : c
      )
    );

    try {
      const result = await completeLaserOnly(contact.id);

      if (!result.success) {
        queryClient.setQueryData(fieldQueryKey, previousFieldData);
        setErrorModal(result.error || '레이저가공 완료 처리에 실패했습니다.');
        return;
      }

      queryClient.invalidateQueries({ queryKey: fieldQueryKey });
    } catch (error) {
      queryClient.setQueryData(fieldQueryKey, previousFieldData);
      log.error('레이저가공 완료 실패:', error);
      setErrorModal('레이저가공 완료 처리 중 오류가 발생했습니다.');
    } finally {
      isSubmittingRef.current = false;
      setIsLoading(false);
      onAdvanceComplete();
    }
  };

  // 레이저 전용 문의: 완료 버튼
  if (isLaserOnly) {
    return (
      <>
        <button
          onClick={() => setShowLaserCompleteConfirm(true)}
          disabled={isAdvancing || isLoading}
          className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors whitespace-nowrap flex items-center justify-center"
        >
          {isAdvancing || isLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            '레이저완료'
          )}
        </button>
        <ConfirmModal
          isOpen={showLaserCompleteConfirm}
          title="레이저가공 완료"
          message="레이저가공을 완료 처리하시겠습니까?"
          type="confirm"
          confirmText="완료"
          onConfirm={handleCompleteLaser}
          onCancel={() => setShowLaserCompleteConfirm(false)}
        />
        <ConfirmModal
          isOpen={!!errorModal}
          title="오류"
          message={errorModal || ''}
          type="error"
          confirmText="확인"
          onConfirm={() => setErrorModal(null)}
          onCancel={() => setErrorModal(null)}
        />
      </>
    );
  }

  // 납품 단계
  if (contact.process_stage === 'delivery') {
    if (!deliveryStarted) {
      return (
        <>
          <button
            onClick={() => setShowDeliveryConfirm(true)}
            disabled={isAdvancing || isLoading}
            className="px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors whitespace-nowrap flex items-center justify-center"
          >
            {isAdvancing || isLoading ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              '납품시작'
            )}
          </button>
          <ConfirmModal
            isOpen={showDeliveryConfirm}
            title="납품 시작"
            message="납품을 시작하시겠습니까? 30분 타이머가 시작됩니다."
            type="confirm"
            confirmText="시작"
            onConfirm={handleStartDelivery}
            onCancel={() => setShowDeliveryConfirm(false)}
          />
          <ConfirmModal
            isOpen={!!errorModal}
            title="오류"
            message={errorModal || ''}
            type="error"
            confirmText="확인"
            onConfirm={() => setErrorModal(null)}
            onCancel={() => setErrorModal(null)}
          />
        </>
      );
    }

    const isCompleted = remainingMin !== null && remainingMin <= 0;

    if (isCompleted) {
      return (
        <span className="px-3 py-1.5 bg-green-100 text-green-700 text-xs font-bold rounded-lg whitespace-nowrap">
          납품완료
        </span>
      );
    }

    return (
      <span className="px-3 py-1.5 bg-blue-50 text-blue-600 text-xs font-medium rounded-lg whitespace-nowrap">
        {remainingMin ?? '..'}분 남음
      </span>
    );
  }

  // 다음 단계가 있는 경우: 작업완료 버튼
  if (nextStage) {
    return (
      <>
        <button
          onClick={() => setShowAdvanceConfirm(true)}
          disabled={isAdvancing || isLoading}
          className="px-4 py-2 bg-[#ED6C00] hover:bg-[#d15f00] disabled:bg-gray-300 disabled:cursor-not-allowed text-white text-sm font-bold rounded-lg transition-colors whitespace-nowrap flex items-center justify-center"
        >
          {isAdvancing || isLoading ? (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
          ) : (
            '작업완료'
          )}
        </button>
        <ConfirmModal
          isOpen={showAdvanceConfirm}
          title="작업 완료"
          message="작업완료 처리하시겠습니까?"
          type="confirm"
          confirmText="완료"
          onConfirm={handleAdvance}
          onCancel={() => setShowAdvanceConfirm(false)}
        />
        <ConfirmModal
          isOpen={!!errorModal}
          title="오류"
          message={errorModal || ''}
          type="error"
          confirmText="확인"
          onConfirm={() => setErrorModal(null)}
          onCancel={() => setErrorModal(null)}
        />
      </>
    );
  }

  return null;
}
