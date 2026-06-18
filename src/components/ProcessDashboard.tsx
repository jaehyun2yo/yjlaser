'use client';

import { motion } from 'framer-motion';
import { FaChartLine } from 'react-icons/fa';
import {
  PROCESS_STAGES_ARRAY,
  getProcessStageInfo,
  getProcessProgress,
  isProcessStarted,
  type ProcessStage,
} from '@/lib/utils/processStages';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

interface ProcessDashboardProps {
  currentStage: ProcessStage;
  status: string;
  className?: string;
}

/**
 * DashboardPreview 스타일의 실시간 공정관리 UI
 * 기업 대시보드에서 사용
 */
export function ProcessDashboard({ currentStage, status, className = '' }: ProcessDashboardProps) {
  const isStarted = isProcessStarted(status);

  if (!isStarted) {
    return (
      <div
        className={`${BG_COLOR.gradientCard} rounded-2xl overflow-hidden border ${BORDER_COLOR.medium}/50 shadow-xl p-4 sm:p-5 relative ${className}`}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="w-8 h-8 bg-[#ED6C00] rounded-lg flex items-center justify-center">
            <FaChartLine className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className={`${TEXT_COLOR.primary} font-semibold text-sm`}>실시간 공정현황</p>
            <p className="text-gray-500 text-xs">공정이 아직 시작되지 않았습니다</p>
          </div>
        </div>
        <div className="text-center py-8">
          <p className={`${TEXT_COLOR.subtle} text-sm`}>문의 확인 후 공정이 시작됩니다</p>
        </div>
      </div>
    );
  }

  const stageInfo = getProcessStageInfo(currentStage);
  const currentOrder = stageInfo?.order || 0;
  const progress = getProcessProgress(currentStage);

  // 예상 완료일 계산 (단계별 소요일 기준)
  // 1: 도면작업(2일), 2: 샘플제작(2일), 3: 도면확정/목형(2일), 4: 레이저(1일), 5: 칼 작업(1일), 6: 오시작업(1일), 7: 납품
  const getEstimatedDate = () => {
    if (currentOrder === 7) {
      return '납품 완료';
    }

    // 각 단계별 소요일 (현재 단계 이후부터 계산)
    const stageDays: Record<number, number> = {
      1: 2, // 도면작업
      2: 2, // 샘플제작 및 확인
      3: 2, // 도면 확정 및 목형의뢰
      4: 1, // 레이저 가공
      5: 1, // 칼 작업
      6: 1, // 오시작업
      7: 0, // 납품 (완료)
    };

    // 현재 단계부터 납품까지 남은 일수 계산
    let daysToAdd = 0;
    for (let i = currentOrder; i <= 6; i++) {
      daysToAdd += stageDays[i] || 1;
    }

    const today = new Date();
    const estimatedDate = new Date(today.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

    const month = estimatedDate.getMonth() + 1;
    const day = estimatedDate.getDate();
    const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
    const weekday = weekdays[estimatedDate.getDay()];

    return `${month}/${day} (${weekday})`;
  };

  return (
    <div
      className={`${BG_COLOR.gradientCard} rounded-2xl overflow-hidden border ${BORDER_COLOR.medium}/50 shadow-xl p-4 sm:p-5 relative ${className}`}
    >
      {/* 대시보드 헤더 */}
      <div className="flex items-center justify-between mb-4 sm:mb-5">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-7 h-7 sm:w-8 sm:h-8 bg-[#ED6C00] rounded-lg flex items-center justify-center">
            <FaChartLine className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-white" />
          </div>
          <div>
            <p className={`${TEXT_COLOR.primary} font-semibold text-xs sm:text-sm`}>
              실시간 공정현황
            </p>
            <p className="text-gray-500 text-[10px] sm:text-xs">공정 진행 상태</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 sm:gap-2">
          <span className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-green-500 rounded-full animate-pulse" />
          <span className={`${TEXT_COLOR.success} text-[10px] sm:text-xs`}>Live</span>
        </div>
      </div>

      {/* 진행 상태 카드들 */}
      <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-5">
        <div
          className={`${BG_COLOR.grayAlpha80} rounded-lg sm:rounded-xl p-2 sm:p-3 border ${BORDER_COLOR.softDark}`}
        >
          <p className={`${TEXT_COLOR.muted} text-[10px] sm:text-xs mb-0.5 sm:mb-1`}>현재 단계</p>
          <motion.p
            key={stageInfo?.label}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-[#ED6C00] font-bold text-xs sm:text-sm truncate"
          >
            {progress >= 100 ? '납품 완료' : `${stageInfo?.label || '준비중'}`}
          </motion.p>
        </div>
        <div
          className={`${BG_COLOR.grayAlpha80} rounded-lg sm:rounded-xl p-2 sm:p-3 border ${BORDER_COLOR.softDark}`}
        >
          <p className={`${TEXT_COLOR.muted} text-[10px] sm:text-xs mb-0.5 sm:mb-1`}>예상 완료일</p>
          <motion.p
            key={getEstimatedDate()}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className={`${TEXT_COLOR.strong} font-bold text-xs sm:text-sm`}
          >
            {getEstimatedDate()}
          </motion.p>
        </div>
      </div>

      {/* 전체 진행률 */}
      <div className="mb-4 sm:mb-5">
        <div className="flex justify-between items-center mb-1.5 sm:mb-2">
          <span className={`${TEXT_COLOR.muted} text-[10px] sm:text-xs`}>전체 진행률</span>
          <motion.span
            key={progress}
            initial={{ scale: 1.2 }}
            animate={{ scale: 1 }}
            className="text-[#ED6C00] font-bold text-xs sm:text-sm"
          >
            {progress}%
          </motion.span>
        </div>
        <div className={`h-1.5 sm:h-2 ${BG_COLOR.mediumStrong} rounded-full overflow-hidden`}>
          <motion.div
            initial={{ width: '0%' }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
            className="h-full bg-gradient-to-r from-[#ED6C00] to-orange-400 rounded-full relative"
          >
            {/* 반짝이는 효과 */}
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
          </motion.div>
        </div>
      </div>

      {/* 단계별 상태 */}
      <div className="space-y-1.5 sm:space-y-2">
        {PROCESS_STAGES_ARRAY.map((stage, idx) => {
          const isCompleted = stage.order < currentOrder;
          const isCurrent = stage.order === currentOrder;
          const isPending = stage.order > currentOrder;

          return (
            <motion.div
              key={idx}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: idx * 0.05 }}
              className={`flex items-center justify-between ${BG_COLOR.weakLight} rounded-md sm:rounded-lg px-2 sm:px-3 py-1.5 sm:py-2 relative overflow-hidden`}
            >
              {/* 진행 배경 */}
              {isCurrent && (
                <motion.div
                  className="absolute inset-0 bg-[#ED6C00]/10"
                  initial={{ width: '0%' }}
                  animate={{ width: '100%' }}
                  transition={{ duration: 0.5 }}
                />
              )}

              <div className="flex items-center gap-1.5 sm:gap-2 relative z-10">
                {isCompleted && (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="w-4 h-4 sm:w-5 sm:h-5 bg-green-500/20 rounded-full flex items-center justify-center"
                  >
                    <svg
                      className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${TEXT_COLOR.successBright}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <motion.path
                        initial={{ pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.3 }}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={3}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                  </motion.div>
                )}
                {isCurrent && (
                  <div className="w-4 h-4 sm:w-5 sm:h-5 bg-[#ED6C00]/20 rounded-full flex items-center justify-center">
                    <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#ED6C00] rounded-full animate-pulse" />
                  </div>
                )}
                {isPending && (
                  <div
                    className={`w-4 h-4 sm:w-5 sm:h-5 ${BG_COLOR.mediumStrong} rounded-full flex items-center justify-center`}
                  >
                    <div
                      className={`w-1.5 h-1.5 sm:w-2 sm:h-2 ${BG_COLOR.grayMidDeep} rounded-full`}
                    />
                  </div>
                )}
                <span
                  className={`text-[10px] sm:text-xs ${
                    isCurrent
                      ? `${TEXT_COLOR.primary} font-medium`
                      : isCompleted
                        ? TEXT_COLOR.muted
                        : 'text-gray-500'
                  }`}
                >
                  {stage.label}
                </span>
              </div>
              <span
                className={`text-[10px] sm:text-xs relative z-10 ${
                  isCompleted ? TEXT_COLOR.success : isCurrent ? 'text-[#ED6C00]' : 'text-gray-500'
                }`}
              >
                {isCompleted ? '완료' : isCurrent ? '진행중' : '대기중'}
              </span>
            </motion.div>
          );
        })}
      </div>

      {/* 스캔라인 효과 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-2xl">
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent animate-scan" />
      </div>
    </div>
  );
}
