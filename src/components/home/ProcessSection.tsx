'use client';

import { motion } from 'framer-motion';
import { FaDraftingCompass, FaBox, FaCogs, FaTruck, FaChartLine } from 'react-icons/fa';
import Link from 'next/link';
import DashboardPreview from './DashboardPreview';
import { useRef, useState, useEffect } from 'react';

interface Step {
  id: number;
  title: string;
  highlightWord: string; // 메인색으로 강조할 단어
  shortDesc: string;
  fullDesc: string;
  details: string[];
  icon: React.ComponentType<{ className?: string }>;
  image: string;
}

const STEPS: Step[] = [
  {
    id: 1,
    title: '구조 설계',
    highlightWord: '구조',
    shortDesc: '고객의 요구사항을 파악하고 패키지 지기구조를 만듭니다',
    fullDesc:
      '고객사의 제품 특성과 요구사항을 면밀히 분석하여 최적의 패키지 구조를 설계합니다. 제품 보호, 운송 효율성, 시각적 매력을 모두 고려한 맞춤형 설계를 제공합니다.',
    details: [
      '제품 특성 분석 및 요구사항 파악',
      '3D 모델링을 통한 구조 시뮬레이션',
      '재료 선정 및 비용 최적화',
      '고객사 피드백 반영 및 수정',
    ],
    icon: FaDraftingCompass,
    image: '', // 목업 이미지 준비 시 경로 추가
  },
  {
    id: 2,
    title: '샘플 제작',
    highlightWord: '샘플',
    shortDesc: '목형 제작 전 샘플 제작 및 고객사 감리',
    fullDesc:
      '본격적인 목형 제작에 앞서 실제 샘플을 제작하여 설계의 완성도를 검증합니다. 고객사와 함께 샘플을 검토하고 필요한 수정사항을 반영합니다.',
    details: [
      '프로토타입 샘플 제작',
      '조립성 및 내구성 테스트',
      '고객사 입회 검수 및 피드백',
      '최종 설계 확정',
    ],
    icon: FaBox,
    image: '', // 목업 이미지 준비 시 경로 추가
  },
  {
    id: 3,
    title: '목형 제작',
    highlightWord: '목형',
    shortDesc: '첨단 레이저 및 칼 기술을 사용한 목형 제작',
    fullDesc:
      '최신 레이저 커팅 장비와 정밀 칼날 기술을 활용하여 고품질 목형을 제작합니다. 미세한 오차도 허용하지 않는 정밀 가공으로 완벽한 품질을 보장합니다.',
    details: [
      '고정밀 레이저 커팅',
      '수동 칼날 미세 조정',
      '품질 검사 및 테스트 타발',
      '내구성 검증',
    ],
    icon: FaCogs,
    image: '', // 목업 이미지 준비 시 경로 추가
  },
  {
    id: 4,
    title: '납품',
    highlightWord: '납품',
    shortDesc: '검수 후 제작된 제품을 신속하게 납품',
    fullDesc:
      '완성된 목형은 철저한 최종 검수를 거친 후 안전하게 포장하여 납품합니다. 신속하고 안전한 배송 시스템으로 고객사의 생산 일정에 차질이 없도록 합니다.',
    details: ['최종 품질 검수', '안전 포장 및 출하', '신속한 배송', '사후 관리 및 A/S 지원'],
    icon: FaTruck,
    image: '', // 목업 이미지 준비 시 경로 추가
  },
  {
    id: 5,
    title: '실시간 공정관리',
    highlightWord: '공정관리',
    shortDesc: '전용 대시보드로 진행 상황을 실시간 확인',
    fullDesc:
      '고객사 전용 대시보드를 통해 주문부터 납품까지 모든 공정을 실시간으로 확인할 수 있습니다. 언제 어디서나 현재 진행 상황, 예상 완료일, 품질 검사 결과를 투명하게 확인하세요.',
    details: [
      '고객사 전용 대시보드 제공',
      '실시간 진행률 및 상태 확인',
      '예상 완료일 자동 알림',
      '품질 검사 리포트 열람',
    ],
    icon: FaChartLine,
    image: '',
  },
];

// 인트로 페이지 컴포넌트
function IntroPage({ isActive }: { isActive: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: isActive ? 1 : 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`absolute inset-0 flex items-center justify-center ${
        isActive ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      <div className="text-center px-4 max-w-4xl mx-auto">
        <motion.span
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 20 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="inline-block px-5 py-2.5 bg-[#ED6C00]/20 text-[#ED6C00] text-sm font-medium rounded-full mb-8"
        >
          Our Process
        </motion.span>

        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 30 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-bold text-white mb-8 leading-tight"
        >
          완벽한 <span className="text-[#ED6C00]">제작 과정</span>
        </motion.h2>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 30 }}
          transition={{ duration: 0.6, delay: 0.3 }}
          className="text-gray-400 text-lg md:text-xl lg:text-2xl max-w-2xl mx-auto leading-relaxed"
        >
          설계부터 납품까지, 모든 단계에서 완벽함을 보장합니다
        </motion.p>

        {/* Scroll Hint - 히어로섹션과 동일한 스타일 */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: isActive ? 1 : 0 }}
          transition={{ duration: 0.5, delay: 0.6 }}
          className="mt-16 flex flex-col items-center gap-3"
        >
          <span className="text-white/40 text-xs font-medium tracking-[0.2em] uppercase">
            Scroll
          </span>
          <motion.div
            animate={{ y: [0, 8, 0] }}
            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
            className="w-6 h-10 border-2 border-white/30 rounded-full flex justify-center pt-2"
          >
            <motion.div
              animate={{ opacity: [1, 0.3, 1], y: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
              className="w-1 h-2 bg-white/60 rounded-full"
            />
          </motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}

// 개별 스텝 카드 컴포넌트
function StepCard({ step, isActive }: { step: Step; isActive: boolean }) {
  const Icon = step.icon;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: isActive ? 1 : 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' }}
      className={`absolute inset-0 flex items-center justify-center overflow-y-auto ${
        isActive ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      {/* 콘텐츠 래퍼 */}
      <div className="w-full max-w-[1600px] mx-auto px-4 sm:px-6 lg:px-12 xl:px-16">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 xl:gap-16 items-center">
          {/* Image / Animation Side */}
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 40 }}
            transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
            className="w-full lg:w-[58%] xl:w-[60%] flex-shrink-0"
          >
            <div className="relative group max-w-2xl mx-auto lg:max-w-none">
              {step.id === 5 ? (
                <DashboardPreview />
              ) : (
                <motion.div
                  className="relative aspect-[4/3] rounded-2xl lg:rounded-3xl overflow-hidden bg-gray-800/50 border border-gray-700/50"
                  whileHover={{ scale: 1.02 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                >
                  {/* Placeholder gradient background */}
                  <div className="absolute inset-0 bg-gradient-to-br from-gray-700/30 via-gray-800/50 to-gray-900/70" />

                  {/* Step number badge */}
                  <div className="absolute top-4 left-4 lg:top-8 lg:left-8 z-10">
                    <span className="inline-flex items-center justify-center w-14 h-14 lg:w-20 lg:h-20 xl:w-24 xl:h-24 bg-[#ED6C00] text-white font-bold rounded-full text-2xl lg:text-4xl xl:text-5xl shadow-lg shadow-orange-500/30">
                      {step.id}
                    </span>
                  </div>

                  {/* Icon as placeholder */}
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Icon className="w-28 h-28 lg:w-44 lg:h-44 xl:w-52 xl:h-52 text-gray-600/50" />
                  </div>

                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-[#ED6C00]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                  {/* Decorative corner elements */}
                  <div className="absolute top-0 left-0 w-24 h-24 lg:w-36 lg:h-36 border-t-2 border-l-2 border-[#ED6C00]/30 rounded-tl-2xl lg:rounded-tl-3xl" />
                  <div className="absolute bottom-0 right-0 w-24 h-24 lg:w-36 lg:h-36 border-b-2 border-r-2 border-[#ED6C00]/30 rounded-br-2xl lg:rounded-br-3xl" />
                </motion.div>
              )}
            </div>
          </motion.div>

          {/* Content Side */}
          <div className="w-full lg:w-[42%] xl:w-[40%]">
            <div className="space-y-5 lg:space-y-6">
              {/* Title */}
              <div>
                <motion.div
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 30 }}
                  transition={{ duration: 0.5, ease: 'easeOut', delay: 0.15 }}
                  className="flex items-center gap-3 lg:gap-4 mb-3 lg:mb-5"
                >
                  <span className="text-[#ED6C00] text-lg lg:text-xl font-semibold">
                    STEP {step.id}
                  </span>
                  <div className="h-px flex-1 bg-gradient-to-r from-[#ED6C00]/50 to-transparent" />
                </motion.div>
                <motion.h3
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 30 }}
                  transition={{ duration: 0.5, ease: 'easeOut', delay: 0.2 }}
                  className="text-3xl md:text-4xl lg:text-5xl xl:text-6xl font-bold text-white mb-3 lg:mb-5"
                >
                  {step.title.split(step.highlightWord).map((part, idx, arr) => (
                    <span key={idx}>
                      {part}
                      {idx < arr.length - 1 && (
                        <span className="text-[#ED6C00]">{step.highlightWord}</span>
                      )}
                    </span>
                  ))}
                </motion.h3>
                <motion.p
                  initial={{ opacity: 0, y: 30 }}
                  animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 30 }}
                  transition={{ duration: 0.5, ease: 'easeOut', delay: 0.25 }}
                  className="text-gray-400 text-base md:text-lg lg:text-xl"
                >
                  {step.shortDesc}
                </motion.p>
              </div>

              {/* Full Description - 모바일에서는 숨김 */}
              <motion.p
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 30 }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: 0.3 }}
                className="hidden md:block text-gray-300 text-base lg:text-lg leading-relaxed"
              >
                {step.fullDesc}
              </motion.p>

              {/* Details List */}
              <motion.div
                initial={{ opacity: 0, y: 30 }}
                animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 30 }}
                transition={{ duration: 0.5, ease: 'easeOut', delay: 0.35 }}
                className="space-y-3 lg:space-y-4"
              >
                <h4 className="text-white font-semibold text-base lg:text-lg flex items-center gap-2">
                  <span className="w-1 h-5 lg:h-6 bg-[#ED6C00] rounded-full" />
                  {step.id === 5 ? '주요 기능' : '주요 작업 내용'}
                </h4>
                <ul className="grid grid-cols-1 md:grid-cols-2 gap-2.5 lg:gap-3">
                  {step.details.map((detail, idx) => (
                    <motion.li
                      key={idx}
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 20 }}
                      transition={{ duration: 0.4, ease: 'easeOut', delay: 0.4 + idx * 0.05 }}
                      className="flex items-start gap-2.5 lg:gap-3 text-gray-400 text-sm md:text-base lg:text-lg"
                    >
                      <svg
                        className="w-5 h-5 lg:w-6 lg:h-6 text-[#ED6C00] flex-shrink-0 mt-0.5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                      <span>{detail}</span>
                    </motion.li>
                  ))}
                </ul>
              </motion.div>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// CTA 페이지 컴포넌트
function CTAPage({ isActive }: { isActive: boolean }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: isActive ? 1 : 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
      className={`absolute inset-0 flex items-center justify-center ${
        isActive ? 'pointer-events-auto' : 'pointer-events-none'
      }`}
    >
      <div className="text-center px-4 max-w-4xl mx-auto">
        <motion.h3
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 40 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.1 }}
          className="text-3xl md:text-4xl lg:text-5xl font-bold text-white mb-6"
        >
          프로젝트를 시작할{' '}
          <span className="relative inline-block">
            <span className="text-[#ED6C00]">준비</span>
            <motion.span
              initial={{ width: 0 }}
              animate={{ width: isActive ? '100%' : 0 }}
              transition={{ duration: 0.4, delay: 0.25, ease: 'easeOut' }}
              className="absolute -bottom-2 left-0 h-1 bg-gradient-to-r from-[#ED6C00] to-orange-400 rounded-full"
            />
          </span>
          가 되셨나요?
        </motion.h3>
        <motion.p
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 40 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.2 }}
          className="text-gray-400 text-lg md:text-xl mb-10 max-w-xl mx-auto"
        >
          지금 바로 문의하시면 전문가가 상담해 드립니다
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: isActive ? 1 : 0, y: isActive ? 0 : 40 }}
          transition={{ duration: 0.6, ease: 'easeOut', delay: 0.3 }}
        >
          <Link
            href="/contact"
            className="inline-flex items-center gap-3 px-10 py-5 bg-[#ED6C00] text-white text-lg font-semibold rounded-full hover:bg-orange-600 transition-all duration-300 shadow-lg shadow-orange-500/30 hover:shadow-orange-500/50"
          >
            프로젝트 시작하기
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 8l4 4m0 0l-4 4m4-4H3"
              />
            </svg>
          </Link>
        </motion.div>
      </div>
    </motion.div>
  );
}

export default function ProcessSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  // -1: 인트로, 0~4: 각 스텝, 5: CTA
  const [activeIndex, setActiveIndex] = useState(-1);

  // RAF throttle + cached rect refs
  const cachedRectRef = useRef<DOMRect | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const lastRectUpdateRef = useRef<number>(0);

  // 인트로(1페이지) + 스텝(5페이지) + CTA(1페이지) = 총 7페이지
  const totalPages = 1 + STEPS.length + 1;
  const pageHeight = 100; // vh per page

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // 현재 페이지 상태 (useRef 대신 클로저 변수로 관리)
    let currentPageIndex = 0;
    let isAnimating = false;

    // 페이지 높이 계산
    const getPageHeight = () => {
      const totalScrollHeight = container.offsetHeight - window.innerHeight;
      return totalScrollHeight / (totalPages - 1);
    };

    // 특정 페이지로 스크롤 (빠른 반응을 위해 최적화)
    const scrollToPage = (pageIndex: number) => {
      if (pageIndex < 0 || pageIndex >= totalPages) return;
      if (isAnimating) return;

      isAnimating = true;
      currentPageIndex = pageIndex;

      const containerTop = container.offsetTop;
      const pageHeight = getPageHeight();
      const targetY = containerTop + pageHeight * pageIndex;

      // 빠른 스크롤 애니메이션 (CSS scroll-behavior 대신 직접 구현)
      const startY = window.scrollY;
      const distance = targetY - startY;
      const duration = 400; // 800ms -> 400ms로 단축
      const startTime = performance.now();

      const animateScroll = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // easeOutCubic for smooth deceleration
        const easeProgress = 1 - Math.pow(1 - progress, 3);

        window.scrollTo(0, startY + distance * easeProgress);

        if (progress < 1) {
          requestAnimationFrame(animateScroll);
        } else {
          isAnimating = false;
        }
      };

      requestAnimationFrame(animateScroll);
    };

    // 스크롤 위치에 따라 현재 페이지 업데이트 (UI용)
    const handleScroll = () => {
      if (isAnimating) return;

      const containerTop = container.offsetTop;
      const pageHeight = getPageHeight();
      const relativeScroll = window.scrollY - containerTop;
      const pageIndex = Math.max(
        0,
        Math.min(Math.round(relativeScroll / pageHeight), totalPages - 1)
      );

      currentPageIndex = pageIndex;
      setActiveIndex(pageIndex - 1);
    };

    // wheel 이벤트 핸들러 - RAF throttle 적용
    const handleWheel = (e: WheelEvent) => {
      // Cancel any pending RAF
      if (rafIdRef.current !== null) return;

      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;

        // Update cached rect max once per 100ms
        const now = performance.now();
        if (now - lastRectUpdateRef.current > 100 || !cachedRectRef.current) {
          cachedRectRef.current = container.getBoundingClientRect();
          lastRectUpdateRef.current = now;
        }

        const rect = cachedRectRef.current;
        if (!rect) return;

        const isInSection = rect.top <= 0 && rect.bottom >= window.innerHeight;

        if (!isInSection) return;

        const direction = e.deltaY > 0 ? 1 : -1;
        const nextPage = currentPageIndex + direction;

        // 섹션 탈출 조건
        if (nextPage < 0 || nextPage >= totalPages) {
          return; // 기본 스크롤 허용
        }

        // 섹션 내에서는 기본 스크롤 차단
        e.preventDefault();

        if (isAnimating) return;

        // 다음 페이지로 이동
        scrollToPage(nextPage);
      });
    };

    // 터치 스크롤 지원
    let touchStartY = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartY = e.touches[0].clientY;
    };

    const handleTouchMove = (e: TouchEvent) => {
      // Use cached rect with same pattern
      const now = performance.now();
      if (now - lastRectUpdateRef.current > 100 || !cachedRectRef.current) {
        cachedRectRef.current = container.getBoundingClientRect();
        lastRectUpdateRef.current = now;
      }

      const rect = cachedRectRef.current;
      if (!rect) return;

      const isInSection = rect.top <= 0 && rect.bottom >= window.innerHeight;

      if (!isInSection) return;

      const touchCurrentY = e.touches[0].clientY;
      const diff = touchStartY - touchCurrentY;
      const direction = diff > 0 ? 1 : -1;
      const nextPage = currentPageIndex + direction;

      // 섹션 탈출 조건
      if (nextPage < 0 || nextPage >= totalPages) {
        return;
      }

      e.preventDefault();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      const rect = container.getBoundingClientRect();
      const isInSection = rect.top <= 0 && rect.bottom >= window.innerHeight;

      if (!isInSection) return;
      if (isAnimating) return;

      const touchEndY = e.changedTouches[0].clientY;
      const diff = touchStartY - touchEndY;

      if (Math.abs(diff) < 50) return; // 최소 스와이프 거리

      const direction = diff > 0 ? 1 : -1;
      const nextPage = currentPageIndex + direction;

      if (nextPage >= 0 && nextPage < totalPages) {
        scrollToPage(nextPage);
      }
    };

    // 초기 페이지 설정
    handleScroll();

    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('wheel', handleWheel, { passive: false });
    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      // Cleanup RAF
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }

      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('wheel', handleWheel);
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [totalPages]);

  return (
    <div
      ref={containerRef}
      data-header-theme="dark"
      className="relative bg-[#0a0a0a]"
      style={{ height: `${totalPages * pageHeight}vh` }}
    >
      {/* Sticky Container */}
      <div className="sticky top-0 h-screen overflow-hidden">
        {/* Background Pattern */}
        <div className="absolute inset-0 overflow-hidden">
          <BackgroundPattern />
        </div>

        {/* Intro Page */}
        <IntroPage isActive={activeIndex === -1} />

        {/* Step Cards */}
        {STEPS.map((step, index) => (
          <StepCard key={step.id} step={step} isActive={index === activeIndex} />
        ))}

        {/* CTA Page */}
        <CTAPage isActive={activeIndex === STEPS.length} />
      </div>
    </div>
  );
}

// 배경 패턴 컴포넌트 (반복 사용)
function BackgroundPattern() {
  return (
    <svg
      className="absolute inset-0 w-full h-full opacity-[0.04]"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <pattern
          id="boxBlueprintPattern"
          x="0"
          y="0"
          width="900"
          height="600"
          patternUnits="userSpaceOnUse"
        >
          {/* Box 1: Tuck End Box (top-left) */}
          <g transform="translate(30, 40)">
            <rect
              x="50"
              y="60"
              width="100"
              height="80"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              strokeDasharray="4 2"
            />
            <path
              d="M50 60 L50 35 Q75 25 100 35 Q125 25 150 35 L150 60"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              strokeDasharray="4 2"
            />
            <path
              d="M50 140 L50 165 Q75 175 100 165 Q125 175 150 165 L150 140"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              strokeDasharray="4 2"
            />
            <rect
              x="10"
              y="60"
              width="40"
              height="80"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              strokeDasharray="4 2"
            />
            <rect
              x="150"
              y="60"
              width="40"
              height="80"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              strokeDasharray="4 2"
            />
          </g>

          {/* Box 2: Sleeve Box (top-center) */}
          <g transform="translate(320, 50)">
            <rect
              x="30"
              y="40"
              width="60"
              height="140"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              strokeDasharray="4 2"
            />
            <rect
              x="90"
              y="40"
              width="35"
              height="140"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              strokeDasharray="4 2"
            />
            <rect
              x="125"
              y="40"
              width="60"
              height="140"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              strokeDasharray="4 2"
            />
          </g>

          {/* Box 3: Hexagonal Box (top-right) */}
          <g transform="translate(620, 55)">
            <polygon
              points="90,20 130,40 130,100 90,120 50,100 50,40"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              strokeDasharray="4 2"
            />
          </g>

          {/* Box 4: Tray Box (bottom-left) */}
          <g transform="translate(50, 340)">
            <rect
              x="50"
              y="50"
              width="120"
              height="75"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              strokeDasharray="4 2"
            />
            <rect
              x="50"
              y="20"
              width="120"
              height="30"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              strokeDasharray="4 2"
            />
          </g>

          {/* Box 5: Pillow Box (bottom-center) */}
          <g transform="translate(330, 330)">
            <path
              d="M30 40 Q30 20 100 20 Q170 20 170 40 L170 150 Q170 170 100 170 Q30 170 30 150 Z"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              strokeDasharray="4 2"
            />
          </g>

          {/* Box 6: Display Box (bottom-right) */}
          <g transform="translate(600, 320)">
            <rect
              x="50"
              y="120"
              width="130"
              height="55"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              strokeDasharray="4 2"
            />
            <rect
              x="50"
              y="30"
              width="130"
              height="90"
              fill="none"
              stroke="white"
              strokeWidth="0.6"
              strokeDasharray="4 2"
            />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#boxBlueprintPattern)" />
    </svg>
  );
}
