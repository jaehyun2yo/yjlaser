'use client';

import { motion, useInView } from 'framer-motion';
import { useRef, useEffect, useState, ReactNode } from 'react';
import { FaChartLine } from 'react-icons/fa';

// 공정 단계 데이터 (기본값)
const DEFAULT_PROCESS_STEPS = [
  { name: '구조 설계', progress: 25 },
  { name: '샘플 제작', progress: 50 },
  { name: '목형 제작', progress: 75 },
  { name: '납품', progress: 100 },
];

export interface ProcessStep {
  name: string;
  progress: number;
}

export interface DashboardCardProps {
  /** 카드 제목 */
  title?: string;
  /** 카드 부제목 */
  subtitle?: string;
  /** 추가 CSS 클래스 */
  className?: string;
  /** 정적 모드 (애니메이션 없이 최종 상태 표시) */
  isStatic?: boolean;
  /** 공정 단계 데이터 (커스텀) */
  steps?: ProcessStep[];
  /** Live 인디케이터 표시 여부 */
  showLiveIndicator?: boolean;
  /** 아이콘 뱃지 표시 여부 */
  showIconBadge?: boolean;
  /** 스캔라인 효과 표시 여부 */
  showScanEffect?: boolean;
  /** 4:3 비율 유지 여부 (false면 auto height) */
  aspectRatio?: boolean;
  /** 커스텀 헤더 (title/subtitle 대신 사용) */
  customHeader?: ReactNode;
  /** 커스텀 콘텐츠 (기본 공정 단계 대신 사용) */
  children?: ReactNode;
  /** 초기 진행률 (0-100) */
  initialProgress?: number;
  /** 목표 진행률 (0-100) */
  targetProgress?: number;
}

/**
 * 다크 테마 대시보드 스타일 카드
 * 홈페이지 ProcessSection, 업체 대시보드 등에서 공통으로 사용
 */
export function DashboardCard({
  title = '고객사 대시보드',
  subtitle = '실시간 공정 현황',
  className = '',
  isStatic = false,
  steps = DEFAULT_PROCESS_STEPS,
  showLiveIndicator = true,
  showIconBadge = true,
  showScanEffect = true,
  aspectRatio = true,
  customHeader,
  children,
  initialProgress = 0,
  targetProgress = 100,
}: DashboardCardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: false, margin: '-20%' });
  const [animatedProgress, setAnimatedProgress] = useState(
    isStatic ? targetProgress : initialProgress
  );
  const [displayProgress, setDisplayProgress] = useState(
    isStatic ? targetProgress : initialProgress
  );

  // 스크롤에 따른 진행률 애니메이션
  useEffect(() => {
    if (isStatic) return;

    if (isInView) {
      const duration = 3000;
      const startTime = Date.now();
      const startProgress = animatedProgress;

      const animate = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const currentProgress = startProgress + (targetProgress - startProgress) * eased;

        setAnimatedProgress(currentProgress);
        setDisplayProgress(Math.round(currentProgress));

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };

      requestAnimationFrame(animate);
    }
  }, [isInView, isStatic, targetProgress]);

  // 현재 단계 계산
  const getCurrentStep = () => {
    for (let i = steps.length - 1; i >= 0; i--) {
      if (animatedProgress >= steps[i].progress) {
        return i;
      }
    }
    return 0;
  };

  const currentStepIndex = getCurrentStep();
  const currentStep = steps[currentStepIndex];

  // 단계별 상태 계산
  const getStepStatus = (stepIndex: number) => {
    if (animatedProgress >= steps[stepIndex].progress) {
      return 'done';
    }
    if (
      stepIndex === currentStepIndex ||
      (stepIndex === currentStepIndex + 1 && animatedProgress > 0)
    ) {
      return 'progress';
    }
    return 'pending';
  };

  // 예상 완료일 계산
  const getEstimatedDate = () => {
    const dates = ['12/20 (수)', '12/18 (월)', '12/15 (금)', '12/12 (화)', '완료'];
    return dates[Math.min(currentStepIndex, dates.length - 1)];
  };

  return (
    <div
      ref={containerRef}
      className={`${aspectRatio ? 'aspect-[4/3]' : ''} bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl overflow-hidden border border-gray-600/50 shadow-2xl p-5 sm:p-6 lg:p-8 relative ${className}`}
    >
      {/* 헤더 */}
      {customHeader || (
        <div className="flex items-center justify-between mb-5 sm:mb-6 lg:mb-8">
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-[#ED6C00] rounded-xl flex items-center justify-center">
              <FaChartLine className="w-5 h-5 sm:w-6 sm:h-6 lg:w-7 lg:h-7 text-white" />
            </div>
            <div>
              <p className="text-white font-bold text-base sm:text-lg lg:text-xl">{title}</p>
              <p className="text-gray-500 text-xs sm:text-sm">{subtitle}</p>
            </div>
          </div>
          {showLiveIndicator && (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-green-500 rounded-full animate-pulse" />
              <span className="text-green-400 text-sm sm:text-base font-medium">Live</span>
            </div>
          )}
        </div>
      )}

      {/* 커스텀 콘텐츠가 있으면 표시, 없으면 기본 공정 UI 표시 */}
      {children || (
        <>
          {/* 진행 상태 카드들 */}
          <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:gap-5 mb-5 sm:mb-6 lg:mb-8">
            <div className="bg-gray-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-5 border border-gray-700/50">
              <p className="text-gray-400 text-xs sm:text-sm mb-1 sm:mb-2">현재 단계</p>
              <motion.p
                key={currentStep.name}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-[#ED6C00] font-bold text-base sm:text-lg lg:text-xl"
              >
                {displayProgress >= 100 ? '납품 완료' : `${currentStep.name} 중`}
              </motion.p>
            </div>
            <div className="bg-gray-800/80 rounded-xl sm:rounded-2xl p-3 sm:p-4 lg:p-5 border border-gray-700/50">
              <p className="text-gray-400 text-xs sm:text-sm mb-1 sm:mb-2">예상 완료일</p>
              <motion.p
                key={getEstimatedDate()}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="text-white font-bold text-base sm:text-lg lg:text-xl"
              >
                {getEstimatedDate()}
              </motion.p>
            </div>
          </div>

          {/* 전체 진행률 */}
          <div className="mb-5 sm:mb-6 lg:mb-8">
            <div className="flex justify-between items-center mb-2 sm:mb-3">
              <span className="text-gray-400 text-sm sm:text-base">전체 진행률</span>
              <motion.span
                key={displayProgress}
                initial={{ scale: 1.2 }}
                animate={{ scale: 1 }}
                className="text-[#ED6C00] font-bold text-base sm:text-lg lg:text-xl"
              >
                {displayProgress}%
              </motion.span>
            </div>
            <div className="h-2.5 sm:h-3 lg:h-4 bg-gray-700 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: isStatic ? `${targetProgress}%` : '0%' }}
                animate={{ width: `${animatedProgress}%` }}
                transition={{ duration: 0.1 }}
                className="h-full bg-gradient-to-r from-[#ED6C00] to-orange-400 rounded-full relative"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
              </motion.div>
            </div>
          </div>

          {/* 단계별 상태 */}
          <div className="space-y-2 sm:space-y-3 lg:space-y-4">
            {steps.map((step, idx) => {
              const status = getStepStatus(idx);
              const stepProgress =
                animatedProgress >= step.progress
                  ? 100
                  : idx === currentStepIndex
                    ? ((animatedProgress - (steps[idx - 1]?.progress || 0)) /
                        (step.progress - (steps[idx - 1]?.progress || 0))) *
                      100
                    : 0;

              return (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.1 }}
                  className="flex items-center justify-between bg-gray-800/50 rounded-lg sm:rounded-xl px-3 sm:px-4 lg:px-5 py-2.5 sm:py-3 lg:py-4 relative overflow-hidden"
                >
                  {status === 'progress' && (
                    <motion.div
                      className="absolute inset-0 bg-[#ED6C00]/10"
                      initial={{ width: '0%' }}
                      animate={{ width: `${stepProgress}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  )}

                  <div className="flex items-center gap-2 sm:gap-3 relative z-10">
                    {status === 'done' && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 bg-green-500/20 rounded-full flex items-center justify-center"
                      >
                        <svg
                          className="w-3.5 h-3.5 sm:w-4 sm:h-4 lg:w-5 lg:h-5 text-green-400"
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
                    {status === 'progress' && (
                      <div className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 bg-[#ED6C00]/20 rounded-full flex items-center justify-center">
                        <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-[#ED6C00] rounded-full animate-pulse" />
                      </div>
                    )}
                    {status === 'pending' && (
                      <div className="w-6 h-6 sm:w-7 sm:h-7 lg:w-8 lg:h-8 bg-gray-700 rounded-full flex items-center justify-center">
                        <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 bg-gray-500 rounded-full" />
                      </div>
                    )}
                    <span
                      className={`text-sm sm:text-base lg:text-lg ${
                        status === 'progress'
                          ? 'text-white font-medium'
                          : status === 'done'
                            ? 'text-gray-400'
                            : 'text-gray-500'
                      }`}
                    >
                      {step.name}
                    </span>
                  </div>
                  <span
                    className={`text-sm sm:text-base lg:text-lg font-medium relative z-10 ${
                      status === 'done'
                        ? 'text-green-400'
                        : status === 'progress'
                          ? 'text-[#ED6C00]'
                          : 'text-gray-500'
                    }`}
                  >
                    {status === 'done' ? '완료' : status === 'progress' ? '진행중' : '대기중'}
                  </span>
                </motion.div>
              );
            })}
          </div>
        </>
      )}

      {/* 아이콘 뱃지 */}
      {showIconBadge && (
        <div className="absolute bottom-3 right-3 sm:bottom-4 sm:right-4 w-10 h-10 sm:w-14 sm:h-14 bg-[#ED6C00]/90 backdrop-blur-sm rounded-lg sm:rounded-xl flex items-center justify-center">
          <FaChartLine className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
        </div>
      )}

      {/* 스캔라인 효과 */}
      {showScanEffect && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-3xl">
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-white/[0.02] to-transparent animate-scan" />
        </div>
      )}
    </div>
  );
}

export default DashboardCard;
