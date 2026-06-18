'use client';

import { useState, useCallback } from 'react';
import type { FC } from 'react';
import Image from 'next/image';
import { PROCESS_STEPS } from '@/app/about/_lib/data';
import type { ProcessStep } from '@/app/about/_lib/types';
import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';

// 이미지 플레이스홀더 컴포넌트
const ImagePlaceholder: FC<{ title: string; step: number }> = ({ title, step }) => {
  return (
    <div
      className={`w-full h-full ${BG_COLOR.gradientFilePreview} flex flex-col items-center justify-center p-4`}
    >
      {/* 아이콘 */}
      <div className="w-16 h-16 rounded-full bg-[#ED6C00]/10 flex items-center justify-center mb-3">
        <svg
          className="w-8 h-8 text-[#ED6C00]/60"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
          />
        </svg>
      </div>
      {/* 단계 번호 */}
      <span className="text-2xl font-bold text-[#ED6C00]/40 mb-1">
        {String(step).padStart(2, '0')}
      </span>
      {/* 타이틀 */}
      <span className={`text-xs ${TEXT_COLOR.dim} text-center`}>{title}</span>
    </div>
  );
};

// 프로세스 단계 버튼 컴포넌트
const ProcessStepButton: FC<{
  step: ProcessStep;
  isActive: boolean;
  onClick: () => void;
}> = ({ step, isActive, onClick }) => {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center justify-center
        min-w-[80px] md:min-w-[100px] lg:min-w-[120px]
        px-3 md:px-4 lg:px-6 py-3 md:py-4
        rounded-full border-2 transition-all duration-300
        text-xs md:text-sm font-medium text-center leading-tight
        ${
          isActive
            ? 'bg-[#ED6C00] border-[#ED6C00] text-white'
            : `${BG_COLOR.white} ${BORDER_COLOR.medium} ${TEXT_COLOR.tertiary} hover:border-[#ED6C00]/50`
        }
      `}
    >
      {step.title}
    </button>
  );
};

// 화살표 컴포넌트
const Arrow: FC = () => (
  <span className={`${TEXT_COLOR.dimInvert} mx-1 md:mx-2 flex-shrink-0`}>{'>'}</span>
);

// 개별 프로세스 아이템 컴포넌트
const ProcessItem: FC<{ step: ProcessStep; isLast: boolean }> = ({ step, isLast }) => {
  const [imageError, setImageError] = useState(false);

  return (
    <div className="py-12 md:py-16">
      <div className="flex flex-col lg:flex-row lg:items-start gap-8 lg:gap-12">
        {/* 좌측: 타이틀 + 설명 영역 */}
        <div className="lg:w-1/2 flex-shrink-0">
          {/* Step 라벨 */}
          <p className="text-sm text-[#ED6C00] font-medium mb-2">Step {step.step}</p>
          {/* 타이틀 */}
          <h3 className={`text-2xl md:text-3xl font-bold ${TEXT_COLOR.strong} mb-4`}>
            {step.title}
          </h3>

          {/* 설명 */}
          <p className={`text-sm md:text-base ${TEXT_COLOR.softMuted} leading-relaxed mb-6`}>
            {step.description}
          </p>

          {/* 상세 목록 */}
          <ul className="space-y-2">
            {step.details.map((detail, i) => (
              <li key={i} className={`flex items-start gap-2 text-sm ${TEXT_COLOR.subtle}`}>
                <span className="text-[#ED6C00] mt-0.5">•</span>
                <span>{detail}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* 우측: 이미지/영상 영역 (16:9 비율) */}
        <div className="lg:w-1/2 flex-shrink-0">
          <div
            className={`relative aspect-video rounded-lg overflow-hidden ${BG_COLOR.lightDark} shadow-md`}
          >
            {step.image && !imageError ? (
              <Image
                src={step.image}
                alt={step.title}
                fill
                className="object-cover"
                onError={() => setImageError(true)}
                sizes="(max-width: 1024px) 100vw, 50vw"
              />
            ) : (
              <ImagePlaceholder title={step.title} step={step.step} />
            )}
          </div>
        </div>
      </div>

      {/* 구분선 */}
      {!isLast && <div className={`mt-12 md:mt-16 border-b ${BORDER_COLOR.default}`} />}
    </div>
  );
};

const ProcessSteps: FC = () => {
  const [activeStep, setActiveStep] = useState(0);

  const handleStepChange = useCallback((index: number) => {
    setActiveStep(index);
    // 해당 섹션으로 스크롤
    const element = document.getElementById(`process-item-${index}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  return (
    <section className="mb-16 md:mb-20">
      {/* 섹션 헤더 */}
      <div className="mb-8 md:mb-10">
        <h2 className={`text-2xl md:text-3xl font-bold ${TEXT_COLOR.strong} mb-3`}>제작과정</h2>
        <p className={`text-sm md:text-base ${TEXT_COLOR.subtle} leading-relaxed max-w-3xl`}>
          고객의 의뢰부터 납품까지, 체계적인 프로세스를 통해 최상의 품질을 보장합니다. 각 단계마다
          철저한 검수를 거쳐 완벽한 목형을 제작합니다.
        </p>
      </div>

      {/* 상단 단계 선택 UI */}
      <div className="overflow-x-auto pb-4 -mx-4 px-4 md:mx-0 md:px-0">
        <div className="flex items-center gap-0 min-w-max">
          {PROCESS_STEPS.map((step, index) => (
            <div key={step.id} className="flex items-center">
              <ProcessStepButton
                step={step}
                isActive={activeStep === index}
                onClick={() => handleStepChange(index)}
              />
              {index < PROCESS_STEPS.length - 1 && <Arrow />}
            </div>
          ))}
        </div>
      </div>

      {/* 구분선 */}
      <div className={`w-full h-px ${BG_COLOR.medium} mt-8 md:mt-10`} />

      {/* 프로세스 아이템 목록 */}
      <div>
        {PROCESS_STEPS.map((step, index) => (
          <div key={step.id} id={`process-item-${index}`}>
            <ProcessItem step={step} isLast={index === PROCESS_STEPS.length - 1} />
          </div>
        ))}
      </div>

      {/* 하단 안내 */}
      <div className="mt-12 md:mt-16 text-center">
        <p className={`${TEXT_COLOR.subtle} text-sm md:text-base mb-4`}>
          25년 이상의 경험과 노하우로 고객 만족을 실현합니다
        </p>
        <a
          href="/contact"
          className="inline-flex items-center gap-2 px-6 py-3 bg-[#ED6C00] hover:bg-[#D65C00] text-white font-medium rounded-lg transition-colors duration-300"
        >
          문의하기
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M17 8l4 4m0 0l-4 4m4-4H3"
            />
          </svg>
        </a>
      </div>
    </section>
  );
};

export default ProcessSteps;
