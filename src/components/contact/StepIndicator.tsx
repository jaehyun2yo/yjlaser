// Step 진행 표시 컴포넌트

'use client';

import { useState, useEffect } from 'react';
import { STEP_STYLES, TEXT_COLOR, BG_COLOR } from '@/lib/styles';
import { FaPhone, FaFileAlt, FaCalendarAlt, FaEye, FaTruck } from 'react-icons/fa';

interface StepIndicatorProps {
  currentStep: number;
  drawingType?: 'create' | 'have' | '';
}

export default function StepIndicator({ currentStep, drawingType = '' }: StepIndicatorProps) {
  const [windowWidth, setWindowWidth] = useState<number | null>(null);

  useEffect(() => {
    const handleResize = () => {
      setWindowWidth(window.innerWidth);
    };

    // 초기값 설정
    handleResize();

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 화면 크기에 따른 버전 결정
  const isMobile = windowWidth === null ? true : windowWidth < 768;
  const isTablet = windowWidth !== null && windowWidth >= 768 && windowWidth < 1024;
  const _isDesktop = windowWidth !== null && windowWidth >= 1024;

  const steps = [
    { number: 1, label: '연락처', icon: FaPhone },
    { number: 2, label: '도면 및 샘플', icon: FaFileAlt },
    {
      number: 3,
      label: drawingType === 'have' ? '납품업체' : '일정 조율',
      icon: drawingType === 'have' ? FaTruck : FaCalendarAlt,
    },
    { number: 4, label: '내용 확인', icon: FaEye },
  ];

  // 버전별 스타일
  const stepStyles = {
    circleSize: {
      mobile: 'w-6 h-6',
      tablet: 'w-7 h-7',
      desktop: 'w-8 h-8',
    },
    iconSize: {
      mobile: 'w-3 h-3',
      tablet: 'w-3.5 h-3.5',
      desktop: 'w-4 h-4',
    },
    checkSize: {
      mobile: 'w-3.5 h-3.5',
      tablet: 'w-4 h-4',
      desktop: 'w-5 h-5',
    },
    labelText: {
      mobile: 'text-[11px]',
      tablet: 'text-xs',
      desktop: 'text-sm',
    },
    labelMargin: {
      mobile: 'ml-1.5',
      tablet: 'ml-2',
      desktop: 'ml-2',
    },
    progressBar: {
      mobile: 'w-4 h-0.5 mx-1',
      tablet: 'w-6 h-0.5 mx-1.5',
      desktop: 'w-8 h-0.5 mx-2',
    },
    gap: {
      mobile: 'gap-1',
      tablet: 'gap-1.5',
      desktop: 'gap-2',
    },
    containerMargin: {
      mobile: 'mb-6',
      tablet: 'mb-7',
      desktop: 'mb-8',
    },
  };

  const getStepStyle = (styleType: keyof typeof stepStyles) => {
    if (isMobile) return stepStyles[styleType].mobile;
    if (isTablet) return stepStyles[styleType].tablet;
    return stepStyles[styleType].desktop;
  };

  if (isMobile) {
    const activeStep = steps.find((step) => step.number === currentStep) ?? steps[0];
    const nextStep = steps.find((step) => step.number === currentStep + 1);
    const ActiveIcon = activeStep.icon;

    return (
      <div className="mb-5 rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-brand text-white">
              <ActiveIcon className="h-4 w-4" />
            </div>
            <div>
              <p className={`text-xs font-medium ${TEXT_COLOR.muted}`}>
                {currentStep} / {steps.length}
              </p>
              <p className={`text-base font-semibold ${TEXT_COLOR.primary}`}>{activeStep.label}</p>
            </div>
          </div>
          {nextStep && (
            <p className={`shrink-0 text-xs ${TEXT_COLOR.muted}`}>다음 {nextStep.label}</p>
          )}
        </div>
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${(currentStep / steps.length) * 100}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className={`${getStepStyle('containerMargin')} flex justify-center`}>
      <div className={`flex items-center justify-center ${getStepStyle('gap')}`}>
        {steps.map((step, index) => {
          const isActive = currentStep === step.number;
          const isCompleted = currentStep > step.number;

          return (
            <div key={step.number} className="flex items-center">
              <div className="flex items-center">
                <div className="relative">
                  {/* 그림자 효과 - 현재 활성 단계에만 */}
                  {isActive && (
                    <div
                      className={`absolute inset-0 rounded-full ${STEP_STYLES.active.circle} blur-lg animate-pulse`}
                    />
                  )}

                  {/* 단계 원 */}
                  <div
                    className={`${getStepStyle('circleSize')} rounded-full flex items-center justify-center font-semibold relative z-10 ${
                      isActive || isCompleted
                        ? STEP_STYLES.active.circle
                        : STEP_STYLES.inactive.circle
                    }`}
                  >
                    {isCompleted ? (
                      <svg
                        className={`${getStepStyle('checkSize')} text-white`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={3}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <step.icon
                        className={`${getStepStyle('iconSize')} flex-shrink-0 ${
                          isActive ? 'text-white' : TEXT_COLOR.muted
                        }`}
                      />
                    )}
                  </div>
                </div>

                {/* 라벨 텍스트 */}
                <div className={`relative ${getStepStyle('labelMargin')}`}>
                  {/* 텍스트 그림자 효과 - 현재 활성 단계에만 */}
                  {isActive && (
                    <div
                      className={`absolute inset-0 font-medium whitespace-nowrap ${STEP_STYLES.active.text} blur-lg animate-pulse ${getStepStyle('labelText')}`}
                    >
                      {step.label}
                    </div>
                  )}
                  <span
                    className={`font-medium whitespace-nowrap relative z-10 ${getStepStyle('labelText')} ${
                      isActive || isCompleted ? STEP_STYLES.active.text : STEP_STYLES.inactive.text
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              </div>

              {/* 진행 바 */}
              {index < steps.length - 1 && (
                <div
                  className={`relative ${getStepStyle('progressBar')} ${BG_COLOR.light} overflow-hidden`}
                >
                  {isCompleted ? (
                    <div className="absolute inset-0 bg-brand" style={{ width: '100%' }} />
                  ) : isActive ? (
                    <div
                      className="absolute inset-0 bg-brand progress-bar-transition"
                      style={{ width: '100%' }}
                    />
                  ) : null}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
