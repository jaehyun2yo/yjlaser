'use client';

import { useState, useEffect, Suspense, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Link from 'next/link';
import dynamic from 'next/dynamic';

// Three.js Canvas를 dynamic import로 지연 로드 (초기 번들에서 제외)
const HeroBoxCanvas = dynamic(() => import('./HeroBoxScene'), {
  ssr: false,
  loading: () => null, // 로딩 중에는 아무것도 표시하지 않음 (배경이 이미 있음)
});

// BOX_TYPES를 여기서도 정의 (HeroBoxScene에서 export하지만 SSR 시 필요)
const BOX_TYPES = [
  { type: 'A', name: 'A형', description: '일반 골판지 박스' },
  { type: 'B', name: 'B형', description: '싸바리/조립형 박스' },
  { type: 'Y', name: 'Y형', description: '선물세트 박스' },
  { type: 'R', name: 'R형', description: '손잡이 박스' },
  { type: 'G', name: 'G형', description: '상하 뚜껑 박스' },
  { type: 'M', name: 'M형', description: '와인/병 박스' },
  { type: 'C', name: 'C형', description: '피자박스' },
  { type: 'S', name: 'S형', description: '슬리브 박스' },
  { type: 'BW', name: 'BW형', description: '택배박스' },
  { type: 'CUSTOM', name: '커스텀', description: '특수 맞춤형 박스' },
];

export default function HeroBoxSection() {
  const sectionRef = useRef<HTMLElement>(null);
  const visibilityTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isCanvasReady, setIsCanvasReady] = useState(false);
  const [isVisible, setIsVisible] = useState(true); // 화면에 보이는지 여부
  const [isMobile, setIsMobile] = useState(false); // 모바일 여부
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [currentType, setCurrentType] = useState(0);
  const [actionProgress, setActionProgress] = useState(0);
  const [transitionPhase, setTransitionPhase] = useState<'idle' | 'slideOut' | 'slideIn'>('idle');

  const [isLargeScreen, setIsLargeScreen] = useState(false); // 큰 화면 여부 (xl 이상)
  const [activeText, setActiveText] = useState(0); // 현재 활성화된 텍스트 (0, 1, 2)
  const [fillProgress, setFillProgress] = useState(0); // 0~1 채워지는 진행도

  // 텍스트 정의
  const texts = ['패키지 완성도', '지기구조 설계', '결정'];

  // 모바일 및 화면 크기 감지
  useEffect(() => {
    const checkScreenSize = () => {
      setIsMobile(window.innerWidth < 768);
      setIsLargeScreen(window.innerWidth >= 1280); // xl 브레이크포인트 이상
    };
    checkScreenSize();
    window.addEventListener('resize', checkScreenSize);
    return () => window.removeEventListener('resize', checkScreenSize);
  }, []);

  // 텍스트 하이라이트 애니메이션 (웨이브 효과)
  useEffect(() => {
    let animationId: number;
    const startTime = Date.now();
    const duration = 1200; // 채워지는 시간 (ms)
    const holdTime = 800; // 다 채워진 후 유지 시간 (ms)
    const cycleTime = duration + holdTime;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const cycleElapsed = elapsed % cycleTime;

      if (cycleElapsed < duration) {
        // 채워지는 중
        setFillProgress(cycleElapsed / duration);
      } else {
        // 유지 시간
        setFillProgress(1);
      }

      // 다음 텍스트로 전환
      const currentCycle = Math.floor(elapsed / cycleTime);
      setActiveText(currentCycle % 3);

      animationId = requestAnimationFrame(animate);
    };

    animate();
    return () => cancelAnimationFrame(animationId);
  }, []);

  // 특정 글자가 하이라이트 되어야 하는지 계산 (웨이브 효과)
  const getCharColor = (textIndex: number, charIndex: number, totalLength: number) => {
    if (textIndex !== activeText) return 'white';

    // 각 글자마다 약간의 랜덤 오프셋을 주어 자연스럽게
    const charProgress = charIndex / totalLength;
    const threshold = fillProgress * 1.3 - 0.3; // 약간 오버슛하여 자연스럽게
    const offset = Math.sin(charIndex * 0.5) * 0.1; // 웨이브 효과

    return charProgress < threshold + offset ? '#ED6C00' : 'white';
  };

  // Canvas를 지연 로드 (초기 렌더링 후 idle 시간에 로드)
  useEffect(() => {
    // requestIdleCallback을 사용하여 메인 스레드가 유휴 상태일 때 Canvas 로드
    const loadCanvas = () => {
      setIsCanvasReady(true);
    };

    // 브라우저가 requestIdleCallback을 지원하면 사용, 아니면 setTimeout 폴백
    if ('requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(loadCanvas, { timeout: 2000 });
      return () => window.cancelIdleCallback(idleId);
    } else {
      // 폴백: 1초 후 로드 (LCP 이후)
      const timeoutId = setTimeout(loadCanvas, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, []);

  // Intersection Observer: 화면에 보이지 않을 때 Canvas 일시정지
  useEffect(() => {
    if (!sectionRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // Clear any pending timeout
        if (visibilityTimeoutRef.current) {
          clearTimeout(visibilityTimeoutRef.current);
        }

        if (entry.isIntersecting) {
          setIsVisible(true); // Resume immediately
        } else {
          // Delay pause by 200ms to prevent flicker
          visibilityTimeoutRef.current = setTimeout(() => {
            setIsVisible(false);
          }, 200);
        }
      },
      {
        threshold: [0, 0.1], // 0%와 10%에서 감지
        rootMargin: '50px', // 약간의 여유
      }
    );

    observer.observe(sectionRef.current);

    return () => {
      observer.disconnect();
      if (visibilityTimeoutRef.current) {
        clearTimeout(visibilityTimeoutRef.current);
      }
    };
  }, []);

  // 마우스 이벤트 (Canvas가 준비된 후에만)
  useEffect(() => {
    if (!isCanvasReady) return;

    let lastUpdate = 0;
    const handleMouseMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastUpdate < 16) return;
      lastUpdate = now;

      const x = (e.clientX / window.innerWidth) * 2 - 1;
      const y = -(e.clientY / window.innerHeight) * 2 + 1;
      setMousePosition({ x, y });
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [isCanvasReady]);

  // 박스 전환 타이머 (Canvas가 준비되고 화면에 보일 때만)
  useEffect(() => {
    if (!isCanvasReady || !isVisible) return;

    const interval = setInterval(() => {
      setTransitionPhase('slideOut');

      setTimeout(() => {
        setCurrentType((prev) => (prev + 1) % BOX_TYPES.length);
        setActionProgress(0);
        setTransitionPhase('slideIn');

        setTimeout(() => {
          setTransitionPhase('idle');
        }, 600);
      }, 400);
    }, 5000);

    return () => clearInterval(interval);
  }, [isCanvasReady, isVisible]);

  // 액션 프로그레스 애니메이션 (Canvas가 준비되고 화면에 보일 때만)
  useEffect(() => {
    if (!isCanvasReady || !isVisible) return;
    if (transitionPhase !== 'idle') return;

    const startTime = Date.now();
    let animationId: number;
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / 2000, 1);
      setActionProgress(progress);
      if (progress < 1) {
        animationId = requestAnimationFrame(animate);
      }
    };
    animate();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [currentType, transitionPhase, isCanvasReady, isVisible]);

  const currentBox = BOX_TYPES[currentType];

  return (
    <section
      ref={sectionRef}
      data-header-theme="dark"
      className="relative h-screen w-full overflow-hidden bg-black"
    >
      {/* 배경 그라데이션 */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-black to-gray-900" />

      {/* 3D 캔버스 - 전체 화면 배경 */}
      {isCanvasReady && (
        <div className="absolute inset-0 z-0">
          <Suspense fallback={null}>
            <HeroBoxCanvas
              mousePosition={mousePosition}
              currentType={currentType}
              actionProgress={actionProgress}
              transitionPhase={transitionPhase}
              isPaused={!isVisible}
              isMobile={isMobile}
              isLargeScreen={isLargeScreen}
            />
          </Suspense>
          {/* 모바일에서 글씨 가독성을 위한 살짝 블러 오버레이 */}
          <div className="absolute inset-0 backdrop-blur-[2px] md:backdrop-blur-none pointer-events-none" />
        </div>
      )}

      {/* 텍스트 컨텐츠 */}
      <div className="absolute inset-0 z-10 flex items-center">
        <div className="w-full max-w-[1600px] mx-auto mt-[80px] md:mt-[100px] px-4 sm:px-6 md:px-8 lg:px-12">
          <div className="max-w-3xl text-center md:text-left">
            {/* 서브 타이틀 */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.8, delay: 0.3 }}
              className="text-[#ED6C00] text-sm md:text-base lg:text-lg font-medium tracking-[0.2em] uppercase mb-4 md:mb-6"
            >
              Packaging Structure Design
            </motion.p>

            {/* 메인 타이틀 - 웨이브 하이라이트 애니메이션 */}
            <motion.h1
              initial={{ opacity: 0, y: 40 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 1, delay: 0.5 }}
              className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-[5.5rem] 2xl:text-[6.5rem] font-bold text-white mb-6 md:mb-10 leading-[1.05] tracking-tight"
            >
              {/* 패키지 완성도 */}
              <span className="block">
                {texts[0].split('').map((char, i) => (
                  <span
                    key={i}
                    className="inline-block transition-colors duration-300 ease-out"
                    style={{
                      color: getCharColor(0, i, texts[0].length),
                      transitionDelay: `${i * 30}ms`,
                    }}
                  >
                    {char === ' ' ? '\u00A0' : char}
                  </span>
                ))}
              </span>

              {/* 지기구조 설계로 */}
              <span className="block mt-2 md:mt-4">
                {texts[1].split('').map((char, i) => (
                  <span
                    key={i}
                    className="inline-block transition-colors duration-300 ease-out"
                    style={{
                      color: getCharColor(1, i, texts[1].length),
                      transitionDelay: `${i * 30}ms`,
                    }}
                  >
                    {char === ' ' ? '\u00A0' : char}
                  </span>
                ))}
                <span className="text-white">로</span>
              </span>

              {/* 결정된다 */}
              <span className="block mt-2 md:mt-4">
                {texts[2].split('').map((char, i) => (
                  <span
                    key={i}
                    className="inline-block transition-colors duration-300 ease-out"
                    style={{
                      color: getCharColor(2, i, texts[2].length),
                      transitionDelay: `${i * 30}ms`,
                    }}
                  >
                    {char}
                  </span>
                ))}
                <span className="text-white">된다</span>
              </span>
            </motion.h1>

            {/* 설명 텍스트 */}
            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7, duration: 0.6 }}
              className="hidden md:block text-gray-400 text-base lg:text-lg xl:text-xl max-w-xl mb-8 leading-relaxed"
            >
              20년간 축적된 기술력으로 고객의 제품에 최적화된
              <br className="hidden lg:block" />
              패키지 구조를 설계합니다
            </motion.p>

            {/* 현재 박스 타입 표시 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.9, duration: 0.6 }}
              className="mb-8 md:mb-10"
            >
              <AnimatePresence mode="wait">
                <motion.div
                  key={currentType}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.4 }}
                  className="flex items-center justify-center md:justify-start gap-4"
                >
                  <span className="text-[#ED6C00] text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-bold">
                    {currentBox.name}
                  </span>
                  <span className="text-gray-300 text-sm sm:text-base md:text-lg lg:text-xl">
                    {currentBox.description}
                  </span>
                </motion.div>
              </AnimatePresence>

              {/* 박스 타입 인디케이터 */}
              <div className="flex justify-center md:justify-start gap-2 md:gap-3 mt-4 md:mt-6">
                {BOX_TYPES.map((box, index) => (
                  <button
                    key={index}
                    aria-label={`${box.name} 박스 보기`}
                    onClick={() => {
                      if (!isCanvasReady) return;
                      if (index === currentType || transitionPhase !== 'idle') return;
                      setTransitionPhase('slideOut');
                      setTimeout(() => {
                        setCurrentType(index);
                        setActionProgress(0);
                        setTransitionPhase('slideIn');
                        setTimeout(() => {
                          setTransitionPhase('idle');
                        }, 600);
                      }, 400);
                    }}
                    className={`relative w-2 h-2 md:w-3 md:h-3 rounded-full transition-all duration-300 ${
                      index === currentType
                        ? 'bg-[#ED6C00] w-6 md:w-10'
                        : 'bg-gray-600 hover:bg-gray-500'
                    } before:absolute before:-inset-3 before:content-['']`}
                  />
                ))}
              </div>
            </motion.div>

            {/* CTA 버튼 */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1, duration: 0.6 }}
              className="flex flex-col sm:flex-row items-center md:items-start justify-center md:justify-start gap-4 md:gap-6"
            >
              <Link
                href="/contact"
                className="group px-8 md:px-10 py-4 md:py-5 text-base md:text-lg bg-[#ED6C00] text-white font-semibold rounded-full hover:bg-[#d15f00] transition-all duration-300 shadow-lg shadow-orange-500/25 hover:shadow-orange-500/40 hover:scale-105"
              >
                <span className="flex items-center gap-2 md:gap-3">
                  문의하기
                  <svg
                    className="w-5 h-5 md:w-6 md:h-6 group-hover:translate-x-1 transition-transform"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M17 8l4 4m0 0l-4 4m4-4H3"
                    />
                  </svg>
                </span>
              </Link>
              <Link
                href="/portfolio"
                className="px-8 md:px-10 py-4 md:py-5 text-base md:text-lg border border-white/30 text-white font-medium rounded-full hover:bg-white/10 hover:border-white/50 transition-all duration-300 backdrop-blur-sm"
              >
                포트폴리오 보기
              </Link>
            </motion.div>
          </div>
        </div>
      </div>

      {/* 스크롤 인디케이터 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 1 }}
        className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20"
      >
        <div className="flex flex-col items-center gap-3">
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
        </div>
      </motion.div>

      {/* 장식 요소 */}
      <div className="absolute top-0 left-0 w-full h-32 bg-gradient-to-b from-black/50 to-transparent z-[5] pointer-events-none" />
      {/* 하단 그라데이션: BoxNetSection(#0a0a0a)으로 자연스럽게 연결 */}
      <div className="absolute bottom-0 left-0 w-full h-40 bg-gradient-to-t from-[#0a0a0a] via-[#0a0a0a]/80 to-transparent z-[5] pointer-events-none" />
    </section>
  );
}
