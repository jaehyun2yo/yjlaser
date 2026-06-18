'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import {
  PROCESS_STAGES_ARRAY,
  LASER_ONLY_STAGES,
  getProcessStageInfo,
  getProcessProgress,
  isLaserOnlyInquiry,
  type ProcessStage,
} from '@/lib/utils/processStages';
import { isProcessStarted } from '@/lib/utils/processStages';
import { updateProcessStage } from '@/app/actions/contacts';
import { ConfirmModal } from '@/components/modals/ConfirmModal';
import { DrawingRevisionModal } from '@/components/modals/DrawingRevisionModal';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('ProcessStageIndicatorToggle');
import {
  FaChevronDown,
  FaChevronUp,
  FaFileAlt,
  FaBox,
  FaClipboardCheck,
  FaBolt,
  FaHammer,
  FaRuler,
  FaTruck,
} from 'react-icons/fa';

interface ProcessStageIndicatorToggleProps {
  currentStage: ProcessStage;
  status: string;
  defaultExpanded?: boolean;
  disabled?: boolean; // 읽기 전용 모드 (업체 대시보드에서 사용)
  contactId?: string; // 공정단계 수정 가능 시 필요
  inquiryType?: string | null; // 레이저가공 전용 2단계 표시용
}

export function ProcessStageIndicatorToggle({
  currentStage,
  status,
  defaultExpanded = false,
  disabled = false,
  contactId,
  inquiryType,
}: ProcessStageIndicatorToggleProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [stage, setStage] = useState<ProcessStage>(currentStage);
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedStage, setSelectedStage] = useState<ProcessStage | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showDrawingRevisionModal, setShowDrawingRevisionModal] = useState(false);
  const [completedStageForRevision, setCompletedStageForRevision] = useState<string | null>(null);

  // defaultExpanded가 변경되면 내부 상태도 업데이트
  useEffect(() => {
    setIsExpanded(defaultExpanded);
  }, [defaultExpanded]);

  // currentStage가 변경되면 stage도 업데이트
  useEffect(() => {
    setStage(currentStage);
  }, [currentStage]);

  const isStarted = isProcessStarted(status);
  const canEdit = !disabled && contactId !== undefined;
  const isLaserOnly = isLaserOnlyInquiry(inquiryType);
  const stages = isLaserOnly ? LASER_ONLY_STAGES : PROCESS_STAGES_ARRAY;

  // 공정 단계 클릭 핸들러
  const handleStageClick = useCallback(
    (newStage: ProcessStage) => {
      if (!canEdit || newStage === stage) return;
      setSelectedStage(newStage);
      setShowConfirmModal(true);
    },
    [canEdit, stage]
  );

  // 모달 취소
  const handleCancel = useCallback(() => {
    setShowConfirmModal(false);
    setSelectedStage(null);
  }, []);

  // 공정 단계 변경 확인
  const handleConfirm = useCallback(async () => {
    if (!selectedStage || isUpdating || !contactId) return;

    const stageToUpdate = selectedStage;
    setIsUpdating(true);
    setShowConfirmModal(false);

    const previousStage = stage;
    setStage(stageToUpdate);

    try {
      const result = await updateProcessStage(contactId, stageToUpdate);

      if (result.success) {
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.contacts.all,
            refetchType: 'active',
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.contacts.detail(contactId),
            refetchType: 'active',
          }),
        ]);
        router.refresh();

        // 도면 수정 모달 트리거 (drawing, drawing_confirmed 단계에서만)
        const DRAWING_REVISION_STAGES = ['drawing', 'drawing_confirmed'];
        if (DRAWING_REVISION_STAGES.includes(stageToUpdate)) {
          setCompletedStageForRevision(stageToUpdate);
          setShowDrawingRevisionModal(true);
        }
      } else {
        setStage(previousStage);
        queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
        alert(`공정 단계 변경에 실패했습니다: ${result.error || '알 수 없는 오류'}`);
      }
    } catch (error) {
      setStage(previousStage);
      queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      log.error('Error updating process stage:', error);
      alert('공정 단계 변경 중 오류가 발생했습니다.');
    } finally {
      setIsUpdating(false);
      setSelectedStage(null);
    }
  }, [selectedStage, isUpdating, contactId, stage, queryClient, router]);

  const selectedStageInfo = selectedStage ? getProcessStageInfo(selectedStage) : null;

  if (!isStarted) {
    return (
      <div className={`mt-4 pt-4 border-t ${BORDER_COLOR.default}`}>
        <p className={`text-xs ${TEXT_COLOR.muted} mb-3`}>공정 단계</p>
        <p className={`text-sm ${TEXT_COLOR.secondary}`}>공정이 아직 시작되지 않았습니다.</p>
      </div>
    );
  }

  // 납품완료(delivered) 시 전체 완료로 처리
  const isAllCompleted = status === 'delivered' || status === 'completed';
  const stageInfo = getProcessStageInfo(stage);
  let currentOrder: number;
  if (isAllCompleted) {
    currentOrder = stages.length + 1;
  } else if (isLaserOnly) {
    currentOrder = 2; // 레이저가공(2단계) 진행중
  } else {
    currentOrder = stageInfo?.order || 0;
  }
  const progress = isAllCompleted
    ? 100
    : isLaserOnly
      ? Math.round((2 / stages.length) * 100)
      : getProcessProgress(stage);

  // 각 단계에 맞는 아이콘 선택
  const getStageIcon = (stageId: ProcessStage) => {
    if (!stageId) return null;
    switch (stageId) {
      case 'drawing':
        return <FaFileAlt className="w-3 h-3" />;
      case 'sample':
        return <FaBox className="w-3 h-3" />;
      case 'drawing_confirmed':
        return <FaClipboardCheck className="w-3 h-3" />;
      case 'laser':
        return <FaBolt className="w-3 h-3" />;
      case 'cutting':
        return <FaHammer className="w-3 h-3" />;
      case 'creasing':
        return <FaRuler className="w-3 h-3" />;
      case 'delivery':
        return <FaTruck className="w-3 h-3" />;
      default:
        return null;
    }
  };

  // 요약본: 현재 단계만 표시
  const SummaryView = () => (
    <div className="flex items-center flex-wrap overflow-x-auto pb-2 -mx-2 px-2">
      {stages.map((stageItem, index) => {
        const isCompleted = stageItem.order < currentOrder;
        const isCurrent = stageItem.order === currentOrder;
        const isClickable = canEdit && !isUpdating;

        return (
          <div key={stageItem.id} className="flex items-center flex-shrink-0">
            <button
              type="button"
              onClick={() => isClickable && handleStageClick(stageItem.id)}
              disabled={!isClickable}
              className={`
                flex items-center gap-1.5 px-2 py-1.5 rounded-lg transition-all duration-200
                ${isClickable ? 'cursor-pointer hover:scale-105 focus:outline-none focus:ring-1 focus:ring-[#ED6C00] focus:ring-offset-1' : 'cursor-default'}
                ${
                  isCompleted
                    ? 'bg-green-600 text-white'
                    : isCurrent
                      ? 'bg-[#ED6C00] text-white border-2 border-[#ED6C00] font-medium'
                      : isClickable
                        ? `${BG_COLOR.light} ${TEXT_COLOR.muted} ${BG_COLOR.hoverBrandAlpha} hover:text-[#ED6C00]`
                        : `${BG_COLOR.light} ${TEXT_COLOR.muted}`
                }
              `}
            >
              <span className="text-xs whitespace-nowrap">
                {isCompleted && '✓ '}
                {stageItem.label}
              </span>
            </button>
            {index < stages.length - 1 && (
              <div
                className={`w-2 h-0.5 mx-1 flex-shrink-0 ${
                  stageItem.order < currentOrder ? 'bg-green-600' : BG_COLOR.strong
                }`}
              />
            )}
          </div>
        );
      })}
    </div>
  );

  // 상세보기: 전체 단계 목록
  const DetailedView = () => (
    <>
      {/* 진행 바 */}
      <div className="mb-4">
        <div className={`w-full ${BG_COLOR.whiteDark} rounded-full h-2`}>
          <div
            className="bg-[#ED6C00] h-2 rounded-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <p className={`text-xs ${TEXT_COLOR.muted} mt-1 text-right`}>{progress}%</p>
      </div>

      {/* 단계 목록 */}
      <div className="space-y-2">
        {stages.map((stageItem) => {
          const isCompleted = stageItem.order < currentOrder;
          const isCurrent = stageItem.order === currentOrder;
          const isClickable = canEdit && !isUpdating;

          return (
            <button
              type="button"
              key={stageItem.id}
              onClick={() => isClickable && handleStageClick(stageItem.id)}
              disabled={!isClickable}
              className={`
                w-full flex items-center gap-3 p-2 rounded-lg transition-all duration-200
                ${isClickable ? 'cursor-pointer hover:scale-[1.02] focus:outline-none focus:ring-1 focus:ring-[#ED6C00] focus:ring-offset-1' : 'cursor-default'}
                ${isCurrent ? 'bg-[#ED6C00]/10 border-l-4 border-[#ED6C00]' : isClickable ? 'bg-transparent ${BG_COLOR.hoverGrayDark}' : 'bg-transparent'}
              `}
            >
              <div
                className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                  isCompleted
                    ? 'bg-green-500 text-white'
                    : isCurrent
                      ? 'bg-[#ED6C00] text-white border-2 border-[#ED6C00]'
                      : `${BG_COLOR.light} ${TEXT_COLOR.muted}`
                }`}
              >
                {isCompleted ? '✓' : getStageIcon(stageItem.id)}
              </div>
              <span
                className={`text-sm ${
                  isCompleted
                    ? `${TEXT_COLOR.muted} line-through`
                    : isCurrent
                      ? 'text-[#ED6C00] font-medium'
                      : '${TEXT_COLOR.dim}'
                }`}
              >
                {stageItem.label}
              </span>
            </button>
          );
        })}
      </div>
    </>
  );

  // 카드가 펼쳐져 있으면 자동으로 상세보기 표시 (토글 버튼 숨김)
  if (defaultExpanded) {
    return (
      <>
        <div className={`mt-4 pt-4 border-t ${BORDER_COLOR.default}`}>
          <p className={`text-xs font-medium ${TEXT_COLOR.muted} mb-3`}>공정 단계</p>
          <DetailedView />
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
                공정 단계를 <strong className={TEXT_COLOR.brand}>{selectedStageInfo.label}</strong>
                로 변경하시겠습니까?
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
        {/* 도면 수정 등록 모달 */}
        {contactId && (
          <DrawingRevisionModal
            isOpen={showDrawingRevisionModal}
            onClose={() => {
              setShowDrawingRevisionModal(false);
              setCompletedStageForRevision(null);
            }}
            contactId={contactId}
            processStage={completedStageForRevision}
            source="stage_change"
            onComplete={() => {
              setShowDrawingRevisionModal(false);
              setCompletedStageForRevision(null);
            }}
          />
        )}
      </>
    );
  }

  // 비활성화 모드 (업체 대시보드): 토글 없이 요약 뷰(수평 pill) 표시
  if (disabled) {
    return (
      <div>
        <p className={`text-xs font-medium ${TEXT_COLOR.muted} mb-3`}>작업현황</p>
        <SummaryView />
      </div>
    );
  }

  // 카드가 접혀있을 때만 토글 버튼 표시
  return (
    <>
      <div className={`mt-4 pt-4 border-t ${BORDER_COLOR.default}`}>
        <button
          type="button"
          className={`w-full flex items-center justify-between cursor-pointer ${BG_COLOR.hoverGrayDeep} -mx-2 px-2 py-2 rounded transition-colors`}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          <p className={`text-xs font-medium ${TEXT_COLOR.muted}`}>공정 단계</p>
          {isExpanded ? (
            <FaChevronUp className={`text-xs ${TEXT_COLOR.muted}`} />
          ) : (
            <FaChevronDown className={`text-xs ${TEXT_COLOR.muted}`} />
          )}
        </button>

        <div className="mt-3">{isExpanded ? <DetailedView /> : <SummaryView />}</div>
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
      {/* 도면 수정 등록 모달 */}
      {contactId && (
        <DrawingRevisionModal
          isOpen={showDrawingRevisionModal}
          onClose={() => {
            setShowDrawingRevisionModal(false);
            setCompletedStageForRevision(null);
          }}
          contactId={contactId}
          processStage={completedStageForRevision}
          source="stage_change"
          onComplete={() => {
            setShowDrawingRevisionModal(false);
            setCompletedStageForRevision(null);
          }}
        />
      )}
    </>
  );
}
