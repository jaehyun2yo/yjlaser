'use client';

import type { FC } from 'react';
import { FaCheck, FaCircle, FaClock } from 'react-icons/fa';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';
import type { TimelineStepInfo } from '@/app/company/orders/_lib/types';
import { formatDate } from '@/app/company/orders/_lib/statusUtils';

interface OrderStatusTimelineProps {
  steps: TimelineStepInfo[];
}

/**
 * 주문 상태 타임라인 컴포넌트
 * 주문 진행 단계를 시각적으로 표시
 * 접수 → 준비 → 작업 → 완료 → 납품
 */
const OrderStatusTimeline: FC<OrderStatusTimelineProps> = ({ steps }) => {
  return (
    <div className="w-full">
      {/* 데스크탑: 가로형 타임라인 */}
      <div className="hidden md:block">
        <HorizontalTimeline steps={steps} />
      </div>

      {/* 모바일: 세로형 타임라인 */}
      <div className="md:hidden">
        <VerticalTimeline steps={steps} />
      </div>
    </div>
  );
};

// ============================================
// 가로형 타임라인 (데스크탑)
// ============================================

const HorizontalTimeline: FC<{ steps: TimelineStepInfo[] }> = ({ steps }) => {
  return (
    <div
      className="relative flex items-start justify-between"
      role="list"
      aria-label="주문 진행 단계"
    >
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;

        return (
          <div
            key={step.step}
            className="flex-1 flex flex-col items-center relative"
            role="listitem"
            aria-current={step.isCurrent ? 'step' : undefined}
          >
            {/* 연결선 (마지막 스텝 제외) */}
            {!isLast && (
              <div
                className={`
                  absolute top-4 left-1/2 w-full h-0.5
                  ${step.isCompleted ? 'bg-[#ED6C00]' : BG_COLOR.light}
                  transition-colors duration-500
                `}
                aria-hidden="true"
              />
            )}

            {/* 스텝 아이콘 */}
            <div
              className={`
                relative z-10 w-8 h-8 rounded-full flex items-center justify-center
                flex-shrink-0 border-2 transition-all duration-300
                ${
                  step.isCompleted
                    ? 'bg-[#ED6C00] border-[#ED6C00] text-white'
                    : step.isCurrent
                      ? `${BG_COLOR.white} border-[#ED6C00] text-[#ED6C00]`
                      : `${BG_COLOR.light} ${BORDER_COLOR.default} ${TEXT_COLOR.muted}`
                }
              `}
              aria-hidden="true"
            >
              {step.isCompleted ? (
                <FaCheck className="text-xs" />
              ) : step.isCurrent ? (
                <FaCircle className="text-xs animate-pulse" />
              ) : (
                <FaClock className="text-xs opacity-50" />
              )}
            </div>

            {/* 스텝 라벨 및 날짜 */}
            <div className="mt-3 text-center">
              <p
                className={`
                  text-xs font-semibold
                  ${
                    step.isCompleted
                      ? 'text-[#ED6C00]'
                      : step.isCurrent
                        ? TEXT_COLOR.primary
                        : TEXT_COLOR.muted
                  }
                `}
              >
                {step.label}
              </p>
              {step.completedAt && (
                <p className={`text-[10px] ${TEXT_COLOR.muted} mt-0.5`}>
                  {formatDate(step.completedAt)}
                </p>
              )}
              {step.isCurrent && !step.completedAt && (
                <p className="text-[10px] text-[#ED6C00] mt-0.5 font-medium">진행 중</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

// ============================================
// 세로형 타임라인 (모바일)
// ============================================

const VerticalTimeline: FC<{ steps: TimelineStepInfo[] }> = ({ steps }) => {
  return (
    <div className="space-y-0" role="list" aria-label="주문 진행 단계">
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;

        return (
          <div
            key={step.step}
            className="flex gap-3"
            role="listitem"
            aria-current={step.isCurrent ? 'step' : undefined}
          >
            {/* 아이콘 + 연결선 */}
            <div className="flex flex-col items-center">
              <div
                className={`
                  w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0
                  border-2 transition-all duration-300
                  ${
                    step.isCompleted
                      ? 'bg-[#ED6C00] border-[#ED6C00] text-white'
                      : step.isCurrent
                        ? `${BG_COLOR.white} border-[#ED6C00] text-[#ED6C00]`
                        : `${BG_COLOR.light} ${BORDER_COLOR.default} ${TEXT_COLOR.muted}`
                  }
                `}
                aria-hidden="true"
              >
                {step.isCompleted ? (
                  <FaCheck className="text-[10px]" />
                ) : step.isCurrent ? (
                  <FaCircle className="text-[10px] animate-pulse" />
                ) : (
                  <FaClock className="text-[10px] opacity-50" />
                )}
              </div>

              {/* 세로 연결선 */}
              {!isLast && (
                <div
                  className={`
                    w-0.5 flex-1 min-h-[24px]
                    ${step.isCompleted ? 'bg-[#ED6C00]' : BG_COLOR.light}
                    mt-1 transition-colors duration-500
                  `}
                  aria-hidden="true"
                />
              )}
            </div>

            {/* 스텝 내용 */}
            <div className={`pb-5 ${isLast ? '' : ''}`}>
              <p
                className={`
                  text-sm font-semibold leading-7
                  ${
                    step.isCompleted
                      ? 'text-[#ED6C00]'
                      : step.isCurrent
                        ? TEXT_COLOR.primary
                        : TEXT_COLOR.muted
                  }
                `}
              >
                {step.label}
                {step.isCurrent && (
                  <span className="ml-2 text-xs font-normal text-[#ED6C00]">← 현재</span>
                )}
              </p>
              {step.completedAt && (
                <p className={`text-xs ${TEXT_COLOR.muted}`}>{formatDate(step.completedAt)}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default OrderStatusTimeline;
