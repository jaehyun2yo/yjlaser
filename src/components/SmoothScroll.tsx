'use client';

import { useEffect, useRef, useCallback } from 'react';
import { usePathname } from 'next/navigation';

interface LenisInstance {
  raf: (time: number) => void;
  on: (event: string, callback: () => void) => void;
  destroy: () => void;
}

interface SmoothScrollProps {
  children: React.ReactNode;
}

export default function SmoothScroll({ children }: SmoothScrollProps) {
  const lenisRef = useRef<LenisInstance | null>(null);
  const rafIdRef = useRef<number | null>(null);
  const isIdleRef = useRef(false);
  const lastScrollTimeRef = useRef(0);
  const pathname = usePathname();

  // Lenis smooth scroll 비활성화 - 모든 페이지에서 네이티브 스크롤 사용
  // Lenis가 다양한 페이지에서 스크롤 문제를 일으키므로 완전히 비활성화
  const disableLenis = true;

  // 기존 조건 (참고용)
  const _isFullScreenPage =
    pathname === '/' ||
    pathname?.startsWith('/login') ||
    pathname?.startsWith('/register') ||
    pathname?.startsWith('/webhard') ||
    pathname?.startsWith('/about') ||
    pathname?.startsWith('/portfolio') ||
    pathname?.startsWith('/contact') ||
    pathname?.startsWith('/notice') ||
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/company') ||
    pathname?.startsWith('/blog') ||
    pathname?.startsWith('/worker') ||
    pathname?.startsWith('/dashboard-preview');

  // Mobile detection
  const isMobile =
    typeof window !== 'undefined' &&
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);

  const startRafLoop = useCallback(() => {
    if (isIdleRef.current || !lenisRef.current) return;

    const raf = (time: number) => {
      if (!lenisRef.current) return;

      lenisRef.current.raf(time);

      // Check if idle (no scroll for 150ms)
      if (time - lastScrollTimeRef.current > 150) {
        isIdleRef.current = true;
        rafIdRef.current = null;
        return;
      }

      rafIdRef.current = requestAnimationFrame(raf);
    };

    rafIdRef.current = requestAnimationFrame(raf);
  }, []);

  useEffect(() => {
    // Skip - Lenis 완전 비활성화 (네이티브 스크롤 사용)
    if (disableLenis || isMobile) return;

    // Dynamic import Lenis
    import('lenis').then(({ default: Lenis }) => {
      const lenis = new Lenis({
        duration: 1.2,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        orientation: 'vertical',
        gestureOrientation: 'vertical',
        smoothWheel: true,
        touchMultiplier: 2,
        infinite: false,
      }) as unknown as LenisInstance;
      lenisRef.current = lenis;

      // Wake up RAF loop on scroll
      lenis.on('scroll', () => {
        lastScrollTimeRef.current = performance.now();
        if (isIdleRef.current) {
          isIdleRef.current = false;
          startRafLoop();
        }
      });

      // Initial start
      lastScrollTimeRef.current = performance.now();
      startRafLoop();
    });

    return () => {
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
      (lenisRef.current as LenisInstance | null)?.destroy();
      lenisRef.current = null;
    };
  }, [disableLenis, isMobile, startRafLoop]);

  return <>{children}</>;
}
