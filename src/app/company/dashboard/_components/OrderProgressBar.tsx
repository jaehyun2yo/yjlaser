'use client';

import { FaCheck } from 'react-icons/fa';
import {
  PROCESS_STAGES_ARRAY,
  LASER_ONLY_STAGES,
  getProcessStageInfo,
  isLaserOnlyInquiry,
} from '@/lib/utils/processStages';
import type { ProcessStage } from '@/lib/utils/processStages';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

interface OrderProgressBarProps {
  currentStage: ProcessStage;
  isStarted: boolean;
  inquiryType?: string | null;
  isCompleted?: boolean;
}

/**
 * 주문 공정 진행 상태를 시각적으로 표시하는 프로그레스 바
 * - 일반 문의: 7단계 공정 스텝 표시
 * - 레이저 전용(inquiry_type='laser_cutting'): 3단계 (접수 → 레이저가공 → 완료)
 * - 현재 단계 하이라이트
 * - 완료된 단계 체크 표시
 * - 다크 모드 지원
 */
export function OrderProgressBar({
  currentStage,
  isStarted,
  inquiryType,
  isCompleted,
}: OrderProgressBarProps) {
  if (!isStarted || !currentStage) {
    return (
      <div className={`p-3 sm:p-4 ${BG_COLOR.muted} rounded-lg border ${BORDER_COLOR.default}`}>
        <p className={`text-xs sm:text-sm ${TEXT_COLOR.secondary} text-center`}>
          공정이 아직 시작되지 않았습니다
        </p>
      </div>
    );
  }

  const isLaserOnly = isLaserOnlyInquiry(inquiryType);
  const stages = isLaserOnly ? LASER_ONLY_STAGES : PROCESS_STAGES_ARRAY;

  // 레이저 전용: 접수(1) → 레이저가공(2) → 완료(3)
  // currentStage='laser'이면 2단계(레이저가공) 진행중, isCompleted이면 3단계 모두 완료
  let activeOrder: number;
  if (isLaserOnly) {
    activeOrder = isCompleted ? stages.length + 1 : 2; // 완료 시 모든 단계 초과, 아니면 레이저가공(2)
  } else {
    const currentStageInfo = getProcessStageInfo(currentStage);
    activeOrder = currentStageInfo?.order || 0;
  }

  return (
    <div
      className={`p-3 sm:p-4 ${BG_COLOR.gradientCard} rounded-xl border ${BORDER_COLOR.default} shadow-sm`}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h4 className={`text-xs sm:text-sm font-semibold ${TEXT_COLOR.strong}`}>
          실시간 공정 진행 현황
        </h4>
        <span className="text-[10px] sm:text-xs text-[#ED6C00] font-medium">
          {isCompleted ? stages.length : Math.min(activeOrder, stages.length)} / {stages.length}{' '}
          단계
        </span>
      </div>

      {/* 프로그레스 스텝들 */}
      <div className="space-y-3">
        {stages.map((stage, index) => {
          const stepCompleted = stage.order < activeOrder;
          const isCurrent = stage.order === activeOrder;

          return (
            <div key={`${stage.label}-${stage.order}`} className="relative">
              {/* 연결선 (마지막 아이템 제외) */}
              {index < stages.length - 1 && (
                <div
                  className={`absolute left-3 sm:left-4 top-8 sm:top-9 w-0.5 h-6 sm:h-8 transition-colors duration-300 ${
                    stepCompleted ? BG_COLOR.successSolid : BG_COLOR.muted
                  }`}
                />
              )}

              {/* 스텝 아이템 */}
              <div className="flex items-center gap-2 sm:gap-3">
                {/* 상태 아이콘 */}
                <div
                  className={`
                    flex-shrink-0 w-6 h-6 sm:w-8 sm:h-8 rounded-full
                    flex items-center justify-center
                    border-2 transition-all duration-300
                    ${isCurrent ? 'animate-pulse' : ''}
                    ${
                      stepCompleted
                        ? `${BG_COLOR.successSolid} ${BORDER_COLOR.success}`
                        : isCurrent
                          ? 'bg-[#ED6C00] border-[#ED6C00] shadow-lg shadow-[#ED6C00]/50'
                          : `${BG_COLOR.muted} ${BORDER_COLOR.default}`
                    }
                  `}
                >
                  {stepCompleted ? (
                    <FaCheck className="text-white text-[10px] sm:text-xs" />
                  ) : (
                    <span
                      className={`text-[10px] sm:text-xs font-bold ${
                        isCurrent ? 'text-white' : TEXT_COLOR.secondary
                      }`}
                    >
                      {stage.order}
                    </span>
                  )}
                </div>

                {/* 단계 정보 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p
                      className={`text-[10px] sm:text-xs font-medium truncate transition-colors duration-300 ${
                        stepCompleted
                          ? TEXT_COLOR.success
                          : isCurrent
                            ? 'text-[#ED6C00] font-semibold'
                            : TEXT_COLOR.secondary
                      }`}
                    >
                      {stage.label}
                    </p>
                    {isCurrent && (
                      <span className="px-1.5 py-0.5 bg-[#ED6C00] text-white text-[8px] sm:text-[10px] rounded-full font-medium whitespace-nowrap animate-fadeIn">
                        진행중
                      </span>
                    )}
                    {stepCompleted && (
                      <span
                        className={`px-1.5 py-0.5 ${BG_COLOR.success} ${TEXT_COLOR.success} text-[8px] sm:text-[10px] rounded-full font-medium whitespace-nowrap`}
                      >
                        완료
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 전체 진행률 바 */}
      <div className={`mt-4 pt-4 border-t ${BORDER_COLOR.default}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-[10px] sm:text-xs ${TEXT_COLOR.secondary}`}>전체 진행률</span>
          <span className="text-[10px] sm:text-xs font-bold text-[#ED6C00]">
            {isCompleted
              ? 100
              : Math.round((Math.min(activeOrder, stages.length) / stages.length) * 100)}
            %
          </span>
        </div>
        <div className={`h-2 ${BG_COLOR.muted} rounded-full overflow-hidden`}>
          <div
            className="h-full bg-gradient-to-r from-[#ED6C00] to-orange-400 rounded-full progress-bar-transition"
            style={{
              width: `${isCompleted ? 100 : (Math.min(activeOrder, stages.length) / stages.length) * 100}%`,
            }}
          />
        </div>
      </div>
    </div>
  );
}
