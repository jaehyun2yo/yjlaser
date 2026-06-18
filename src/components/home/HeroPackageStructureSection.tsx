'use client';

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type MouseEvent,
} from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface PackageStructureSlide {
  id: string;
  imageSrc: string;
  imageAlt: string;
}

interface PointerTilt {
  x: number;
  y: number;
}

const PACKAGE_STRUCTURE_SLIDES: PackageStructureSlide[] = [
  {
    id: 'a-box',
    imageSrc: '/images/box-shapes/a-box.png',
    imageAlt: 'A형 지기구조 도안',
  },
  {
    id: 'b-box',
    imageSrc: '/images/box-shapes/b-box.png',
    imageAlt: 'B형 지기구조 도안',
  },
  {
    id: 'tuck',
    imageSrc: '/images/box-shapes/tuck.png',
    imageAlt: 'Tuck 지기구조 도안',
  },
  {
    id: 'shopping',
    imageSrc: '/images/box-shapes/shopping.png',
    imageAlt: 'Shopping 지기구조 도안',
  },
  {
    id: 'folder',
    imageSrc: '/images/box-shapes/folder.png',
    imageAlt: 'Folder 지기구조 도안',
  },
];

const heroSectionStyle: CSSProperties = {
  height: 'clamp(620px, 78vh, 720px)',
  minHeight: 620,
  backgroundColor: 'rgb(250, 250, 249)',
  color: 'rgb(10, 10, 10)',
};

const blueprintGridStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: '24%',
  width: 'min(78vw, 920px)',
  height: '46%',
  border: '1px solid rgba(10, 10, 10, 0.05)',
  opacity: 0.45,
  backgroundImage:
    'linear-gradient(to right, rgba(23,23,23,0.12) 1px, transparent 1px), linear-gradient(to bottom, rgba(23,23,23,0.12) 1px, transparent 1px)',
  backgroundSize: '24px 24px',
  pointerEvents: 'none',
  transformStyle: 'preserve-3d',
  willChange: 'transform',
};

const heroWordmarkStyle: CSSProperties = {
  position: 'absolute',
  left: '50%',
  top: 'clamp(72px, 8vh, 88px)',
  zIndex: 0,
  display: 'flex',
  width: 'min(126vw, 1120px)',
  transform: 'translateX(-50%)',
  alignItems: 'baseline',
  justifyContent: 'center',
  whiteSpace: 'nowrap',
  textAlign: 'center',
  fontSize: 'clamp(2rem, calc(14vw - 1rem), 10.5rem)',
  fontWeight: 900,
  lineHeight: 0.78,
  letterSpacing: 0,
  color: 'rgb(10, 10, 10)',
  pointerEvents: 'none',
  userSelect: 'none',
};

const heroContentStyle: CSSProperties = {
  position: 'relative',
  zIndex: 20,
  display: 'flex',
  height: '100%',
  width: '100%',
  maxWidth: 1280,
  margin: '0 auto',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '86px 16px 24px',
};

const carouselStyle: CSSProperties = {
  position: 'relative',
  width: 'min(92vw, 980px)',
};

const visualPlaneStyle: CSSProperties = {
  position: 'relative',
  width: '100%',
  overflow: 'hidden',
  transformStyle: 'preserve-3d',
  willChange: 'transform',
};

const slideFrameStyle: CSSProperties = {
  position: 'relative',
  display: 'flex',
  height: 'clamp(230px, 38vh, 360px)',
  minWidth: '100%',
  alignItems: 'center',
  justifyContent: 'center',
};

const drawingImageStyle: CSSProperties = {
  position: 'absolute',
  inset: 0,
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'contain',
  opacity: 0.95,
  filter: 'grayscale(1) contrast(1.28) brightness(0.92)',
  mixBlendMode: 'multiply',
};

const clampTilt = (value: number) => Math.max(-1, Math.min(1, value));

const getBlueprintGridStyle = (pointer: PointerTilt): CSSProperties => ({
  ...blueprintGridStyle,
  transform: `translateX(-50%) translate3d(${pointer.x * 12}px, ${
    pointer.y * 8
  }px, 0) rotateX(${-pointer.y * 1.6}deg) rotateY(${pointer.x * 1.8}deg)`,
  transition: 'transform 160ms ease-out',
});

const getHeroContentStyle = (isIntroComplete: boolean): CSSProperties => ({
  ...heroContentStyle,
  opacity: isIntroComplete ? 1 : 0,
  transform: isIntroComplete ? 'translateY(0) scale(1)' : 'translateY(22px) scale(0.985)',
  transition: 'opacity 700ms ease, transform 700ms cubic-bezier(0.22, 1, 0.36, 1)',
});

const getVisualPlaneStyle = (pointer: PointerTilt): CSSProperties => ({
  ...visualPlaneStyle,
  transform: `perspective(900px) rotateX(${-pointer.y * 4.5}deg) rotateY(${
    pointer.x * 5.5
  }deg) translate3d(${pointer.x * 18}px, ${pointer.y * 12}px, 0)`,
  transition: 'transform 140ms ease-out',
});

export default function HeroPackageStructureSection() {
  const [slideIndex, setSlideIndex] = useState(0);
  const [loadingPercent, setLoadingPercent] = useState(0);
  const [isIntroComplete, setIsIntroComplete] = useState(false);
  const [pointer, setPointer] = useState<PointerTilt>({ x: 0, y: 0 });

  const goToPrevious = useCallback(() => {
    setSlideIndex((current) => (current === 0 ? PACKAGE_STRUCTURE_SLIDES.length - 1 : current - 1));
  }, []);

  const goToNext = useCallback(() => {
    setSlideIndex((current) => (current + 1) % PACKAGE_STRUCTURE_SLIDES.length);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(goToNext, 5200);
    return () => window.clearInterval(intervalId);
  }, [goToNext]);

  useEffect(() => {
    const loadingDurationMs = 1500;
    const startedAt = Date.now();

    const intervalId = window.setInterval(() => {
      const elapsedMs = Date.now() - startedAt;
      const nextPercent = Math.min(99, Math.floor((elapsedMs / loadingDurationMs) * 100));
      setLoadingPercent(nextPercent);
    }, 30);

    const timeoutId = window.setTimeout(() => {
      window.clearInterval(intervalId);
      setLoadingPercent(100);
      setIsIntroComplete(true);
    }, loadingDurationMs);

    return () => {
      window.clearInterval(intervalId);
      window.clearTimeout(timeoutId);
    };
  }, []);

  const slideStyle = useMemo(
    () => ({
      transform: `translateX(-${slideIndex * 100}%)`,
    }),
    [slideIndex]
  );

  const handleMouseMove = useCallback((event: MouseEvent<HTMLElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const width = rect.width || window.innerWidth || 1;
    const height = rect.height || window.innerHeight || 1;
    const left = rect.width ? rect.left : 0;
    const top = rect.height ? rect.top : 0;
    const x = clampTilt(((event.clientX - left) / width - 0.5) * 2);
    const y = clampTilt(((event.clientY - top) / height - 0.5) * 2);

    setPointer({ x, y });
  }, []);

  const handleMouseLeave = useCallback(() => {
    setPointer({ x: 0, y: 0 });
  }, []);

  return (
    <section
      data-header-theme="light"
      className="relative overflow-hidden bg-stone-50 text-neutral-950"
      style={heroSectionStyle}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_50%_35%,rgba(255,255,255,0.98),rgba(250,250,249,0)_58%)]"
        aria-hidden="true"
      />
      <div className="absolute inset-x-0 top-0 z-10 h-28 bg-gradient-to-b from-black/35 to-transparent" />
      <div
        data-testid="package-structure-grid"
        style={getBlueprintGridStyle(pointer)}
        aria-hidden="true"
      />

      <h1
        aria-label="Shape It Right"
        className="pointer-events-none select-none"
        style={heroWordmarkStyle}
      >
        <span style={{ fontFamily: 'Georgia, serif', fontStyle: 'italic' }}>Shape</span>
        <span style={{ fontFamily: 'Arial, Helvetica, sans-serif' }}> It Right</span>
      </h1>

      <div style={getHeroContentStyle(isIntroComplete)}>
        <div style={carouselStyle}>
          <div data-testid="package-structure-visual" style={getVisualPlaneStyle(pointer)}>
            <div
              data-testid="package-structure-track"
              className="flex transition-transform duration-700 ease-[cubic-bezier(0.22,1,0.36,1)]"
              style={slideStyle}
            >
              {PACKAGE_STRUCTURE_SLIDES.map((slide, index) => (
                <div key={slide.id} style={slideFrameStyle}>
                  <img
                    src={slide.imageSrc}
                    alt={slide.imageAlt}
                    loading={index === 0 ? 'eager' : 'lazy'}
                    decoding="async"
                    style={drawingImageStyle}
                  />
                </div>
              ))}
            </div>

            <div className="pointer-events-none absolute inset-y-0 left-0 w-16 bg-gradient-to-r from-stone-50 to-transparent" />
            <div className="pointer-events-none absolute inset-y-0 right-0 w-16 bg-gradient-to-l from-stone-50 to-transparent" />
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="이전 도안 보기"
            title="이전 도안 보기"
            onClick={goToPrevious}
            className="absolute left-2 top-1/2 z-20 h-10 w-10 -translate-y-1/2 rounded-full border border-neutral-950/15 bg-white/70 text-neutral-950 shadow-sm backdrop-blur hover:bg-white sm:left-4"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="다음 도안 보기"
            title="다음 도안 보기"
            onClick={goToNext}
            className="absolute right-2 top-1/2 z-20 h-10 w-10 -translate-y-1/2 rounded-full border border-neutral-950/15 bg-white/70 text-neutral-950 shadow-sm backdrop-blur hover:bg-white sm:right-4"
          >
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Button>
        </div>
      </div>

      {!isIntroComplete && (
        <div
          role="status"
          aria-label="홈페이지 로딩"
          aria-live="polite"
          className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-50 text-neutral-950"
        >
          <div className="text-center">
            <p className="text-5xl font-black leading-none tracking-normal sm:text-7xl">
              <span className="font-serif italic">Shape</span>
              <span> It Right</span>
            </p>
            <p className="mt-6 text-sm font-semibold text-brand">{loadingPercent}%</p>
          </div>
        </div>
      )}
    </section>
  );
}
