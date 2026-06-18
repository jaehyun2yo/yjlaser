'use client';

import { MutableRefObject, RefObject, useEffect, useRef, useState } from 'react';

interface ScrollProgressState {
  progress: number;
  progressRef: MutableRefObject<number>;
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function useScrollProgress(targetRef: RefObject<HTMLElement | null>): ScrollProgressState {
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const committedProgressRef = useRef(0);
  const lastCommitAtRef = useRef(0);

  useEffect(() => {
    let frameId = 0;

    const updateProgress = () => {
      frameId = 0;

      const element = targetRef.current;
      if (!element) return;

      const rect = element.getBoundingClientRect();
      const scrollableDistance = Math.max(1, rect.height - window.innerHeight);
      const nextProgress = clamp(-rect.top / scrollableDistance);
      const now = window.performance.now();
      const shouldCommit =
        Math.abs(committedProgressRef.current - nextProgress) >= 0.01 ||
        now - lastCommitAtRef.current > 120 ||
        nextProgress === 0 ||
        nextProgress === 1;

      progressRef.current = nextProgress;

      if (!shouldCommit) return;

      committedProgressRef.current = nextProgress;
      lastCommitAtRef.current = now;
      setProgress(nextProgress);
    };

    const requestUpdate = () => {
      if (frameId !== 0) return;
      frameId = window.requestAnimationFrame(updateProgress);
    };

    requestUpdate();
    window.addEventListener('scroll', requestUpdate, { passive: true });
    window.addEventListener('resize', requestUpdate);

    return () => {
      window.removeEventListener('scroll', requestUpdate);
      window.removeEventListener('resize', requestUpdate);

      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [targetRef]);

  return { progress, progressRef };
}
