'use client';

import { Component, memo, Suspense, type ErrorInfo, type ReactNode, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { HeroScene } from '@/components/r3f/HeroScene';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import styles from '@/styles/HeroSection.module.css';
import type { ProgressRef } from '@/types/three-scene';

interface HeroCanvasProps {
  foldProgressRef?: ProgressRef;
}

class HeroCanvasErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode; fallback: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    this.setState({ hasError: true });
  }

  render() {
    if (this.state.hasError) return this.props.fallback;

    return this.props.children;
  }
}

function CanvasFallback() {
  return (
    <div className={styles.canvasFallback} data-r3f-fallback aria-hidden="true">
      <div className={styles.fallbackBox}>
        <span />
        <span />
        <span />
      </div>
    </div>
  );
}

export const HeroCanvas = memo(function HeroCanvas({ foldProgressRef }: HeroCanvasProps) {
  const prefersReducedMotion = useReducedMotion();
  const fallbackProgressRef = useRef(0);
  const activeProgressRef = foldProgressRef ?? fallbackProgressRef;

  return (
    <HeroCanvasErrorBoundary fallback={<CanvasFallback />}>
      <div
        className={styles.canvasFrame}
        data-r3f-canvas-frame
        role="img"
        aria-label="패키지 구조 3D 미리보기"
      >
        <Canvas
          camera={{ position: [4.6, 2.7, 6.4], fov: 38 }}
          dpr={[1, prefersReducedMotion ? 1 : 1.5]}
          gl={{
            antialias: true,
            alpha: true,
            powerPreference: 'high-performance',
            stencil: false,
            depth: true,
          }}
          shadows
          performance={{ min: 0.6 }}
          fallback={<CanvasFallback />}
        >
          <Suspense fallback={null}>
            <HeroScene animate={!prefersReducedMotion} foldProgressRef={activeProgressRef} />
          </Suspense>
        </Canvas>
      </div>
    </HeroCanvasErrorBoundary>
  );
});
