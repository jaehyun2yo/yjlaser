'use client';

import { useRef, useEffect, useState, Suspense } from 'react';
import dynamic from 'next/dynamic';

// Three.js Canvas를 dynamic import로 지연 로드 (초기 번들에서 제외)
const BoxNetCanvas = dynamic(() => import('./BoxNetScene'), {
  ssr: false,
  loading: () => null,
});

export default function BoxNetSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const sectionRef = useRef<HTMLDivElement>(null);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  // UI 업데이트용 (진행률 바, 텍스트 전환 등) - 낮은 빈도로 업데이트
  const [uiProgress, setUiProgress] = useState(0);

  // Three.js로 직접 전달되는 ref (React 렌더링 없이 업데이트)
  const scrollProgressRef = useRef(0);
  const isScrollingRef = useRef(false);
  const lastUiUpdateRef = useRef(0);

  // Canvas를 빠르게 로드 (화면에 보이면 즉시, 아니면 짧은 딜레이)
  useEffect(() => {
    // 이미 visible이면 즉시 로드
    if (isVisible) {
      setIsCanvasReady(true);
      return;
    }

    // 그렇지 않으면 짧은 딜레이 후 로드 (초기 렌더링 차단 방지)
    const timeoutId = setTimeout(() => setIsCanvasReady(true), 100);
    return () => clearTimeout(timeoutId);
  }, [isVisible]);

  // Intersection Observer: 화면에 보이지 않으면 Canvas 일시정지
  useEffect(() => {
    if (!sectionRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsVisible(entry.isIntersecting);
      },
      { threshold: 0.1, rootMargin: '50px' }
    );

    observer.observe(sectionRef.current);
    return () => observer.disconnect();
  }, []);

  // 스크롤 진행도 계산 (최적화: 스로틀링 + passive 이벤트)
  useEffect(() => {
    if (!containerRef.current || !isCanvasReady || !isVisible) return;

    const container = containerRef.current;
    const viewportHeight = window.innerHeight;
    const containerHeight = viewportHeight * 4; // h-[400vh]
    const scrollableDistance = containerHeight - viewportHeight;

    let rafId: number | null = null;

    const updateProgress = () => {
      const containerTop = container.offsetTop;
      const scrolledIntoContainer = window.scrollY - containerTop;
      const progress =
        scrollableDistance > 0
          ? Math.max(0, Math.min(1, scrolledIntoContainer / scrollableDistance))
          : 0;

      // Three.js ref는 항상 업데이트 (임계값 낮춤)
      if (Math.abs(progress - scrollProgressRef.current) > 0.001) {
        scrollProgressRef.current = progress;
      }

      // UI state는 더 낮은 빈도로 업데이트 (임계값 높임)
      if (Math.abs(progress - lastUiUpdateRef.current) > 0.02) {
        lastUiUpdateRef.current = progress;
        setUiProgress(progress);
      }

      isScrollingRef.current = false;
      rafId = null;
    };

    const handleScroll = () => {
      if (!isScrollingRef.current) {
        isScrollingRef.current = true;
        rafId = requestAnimationFrame(updateProgress);
      }
    };

    // passive: true로 스크롤 성능 향상
    window.addEventListener('scroll', handleScroll, { passive: true });

    // 초기 진행도 설정
    handleScroll();

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [isCanvasReady, isVisible]);

  return (
    <div ref={containerRef} data-header-theme="dark" className="relative h-[400vh] bg-[#0a0a0a]">
      {/* Sticky 컨테이너 */}
      <div ref={sectionRef} className="sticky top-0 h-screen overflow-hidden">
        {/* 3D Canvas - 지연 로드, 화면 밖일 때 일시정지 */}
        {isCanvasReady && (
          <div className="absolute inset-0">
            <Suspense fallback={null}>
              <BoxNetCanvas scrollProgressRef={scrollProgressRef} isPaused={!isVisible} />
            </Suspense>
          </div>
        )}

        {/* 격자 가장자리 페이드 오버레이 - 상하좌우 */}
        <div className="absolute inset-0 pointer-events-none z-[1]">
          {/* 상단 페이드 */}
          <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#0a0a0a] to-transparent" />
          {/* 하단 페이드 */}
          <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-[#0a0a0a] to-transparent" />
          {/* 좌측 페이드 */}
          <div className="absolute top-0 bottom-0 left-0 w-24 bg-gradient-to-r from-[#0a0a0a] to-transparent" />
          {/* 우측 페이드 (정보 영역과 겹치지 않도록) */}
          <div className="absolute top-0 bottom-0 right-0 w-24 bg-gradient-to-l from-[#0a0a0a] to-transparent" />
        </div>

        {/* 우측: 정보 영역 */}
        <div
          className="absolute right-0 w-[45%] lg:w-[40%] h-full flex flex-col justify-center pr-8 md:pr-12 lg:pr-16 pl-8 lg:pl-12 transition-transform duration-700 ease-out z-10 bg-gradient-to-l from-[#0a0a0a] via-[#0a0a0a]/95 to-transparent"
          style={{
            transform:
              uiProgress > 0.66
                ? `translateX(${Math.min((uiProgress - 0.66) * 3, 1) * 100}px)`
                : 'translateX(0)',
          }}
        >
          {/* 메인 컨텐츠 - 스크롤에 따라 변경 */}
          <div className="relative">
            {/* 단계 1: 초기 상태 */}
            <div
              className="transition-all duration-500 ease-out"
              style={{
                opacity: uiProgress <= 0.33 ? 1 : 0,
                transform: uiProgress <= 0.33 ? 'translateY(0)' : 'translateY(-20px)',
                position: uiProgress <= 0.33 ? 'relative' : 'absolute',
                pointerEvents: uiProgress <= 0.33 ? 'auto' : 'none',
              }}
            >
              <p className="text-[#ED6C00] text-sm md:text-base font-medium tracking-[0.3em] uppercase mb-6">
                BLUEPRINT
              </p>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
                정밀한 설계로
                <br />
                <span className="text-[#ED6C00]">완벽한 패키지</span>를
              </h2>
              <p className="text-gray-400 text-base md:text-lg max-w-xl leading-relaxed">
                고객의 요구사항에 맞춘
                <br className="hidden md:block" />
                맞춤형 박스 솔루션을 제공합니다.
              </p>
            </div>

            {/* 단계 2: 수정 중 */}
            <div
              className="transition-all duration-500 ease-out"
              style={{
                opacity: uiProgress > 0.33 && uiProgress <= 0.66 ? 1 : 0,
                transform:
                  uiProgress > 0.33 && uiProgress <= 0.66
                    ? 'translateY(0)'
                    : uiProgress <= 0.33
                      ? 'translateY(20px)'
                      : 'translateY(-20px)',
                position: uiProgress > 0.33 && uiProgress <= 0.66 ? 'relative' : 'absolute',
                pointerEvents: uiProgress > 0.33 && uiProgress <= 0.66 ? 'auto' : 'none',
              }}
            >
              <p className="text-white text-sm md:text-base font-medium tracking-[0.3em] uppercase mb-6 animate-pulse">
                REVISION IN PROGRESS
              </p>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
                <span className="text-[#ED6C00]">실시간</span> 수정
              </h2>
              <p className="text-gray-400 text-base md:text-lg max-w-xl leading-relaxed mb-6">
                고객 요청사항을 즉시 반영합니다.
              </p>
              {/* 수정 진행률 바 */}
              <div className="max-w-md mb-6">
                <div className="flex justify-between text-sm text-gray-500 mb-2">
                  <span>귀 위치 조정</span>
                  <span className="text-white font-semibold">
                    {Math.round(Math.min(((uiProgress - 0.33) / 0.33) * 100, 100))}%
                  </span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#ED6C00] transition-all duration-100"
                    style={{
                      width: `${Math.min(((uiProgress - 0.33) / 0.33) * 100, 100)}%`,
                    }}
                  />
                </div>
              </div>
              {/* 수정 상세 정보 */}
              <div className="text-sm text-gray-500 font-mono space-y-1">
                <p>
                  <span className="text-gray-600">변경:</span>{' '}
                  <span className="text-gray-400">X 170.70 → 172.22</span>
                </p>
                <p>
                  <span className="text-gray-600">이동량:</span>{' '}
                  <span className="text-[#ED6C00] font-semibold">+1.52mm</span>
                </p>
              </div>
            </div>

            {/* 단계 3: 수정 완료 */}
            <div
              className="transition-all duration-500 ease-out"
              style={{
                opacity: uiProgress > 0.66 ? 1 : 0,
                transform: uiProgress > 0.66 ? 'translateY(0)' : 'translateY(20px)',
                position: uiProgress > 0.66 ? 'relative' : 'absolute',
                pointerEvents: uiProgress > 0.66 ? 'auto' : 'none',
              }}
            >
              <p className="text-[#ED6C00] text-sm md:text-base font-medium tracking-[0.3em] uppercase mb-6">
                ✓ REVISION COMPLETE
              </p>
              <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-[1.1] tracking-tight">
                수정 <span className="text-[#ED6C00]">완료</span>
              </h2>
              <p className="text-gray-400 text-base md:text-lg max-w-xl leading-relaxed mb-4">
                고객사의 결과물의 완성도를 높이는
                <br className="hidden md:block" />
                세밀한 수정작업
              </p>
              <p className="text-gray-500 text-base md:text-lg max-w-xl leading-relaxed">
                고객 만족을 위한 끊임없는 개선.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
