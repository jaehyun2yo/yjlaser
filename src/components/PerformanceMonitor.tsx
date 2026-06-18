'use client';

import { useEffect, useRef } from 'react';
import { measurePerformance } from '@/lib/monitoring/performance';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('PerformanceMonitor');

interface PerformanceMonitorProps {
  componentName: string;
  enabled?: boolean;
}

/**
 * 컴포넌트 성능 모니터링
 * 렌더링 시간, 리렌더링 횟수 등을 측정
 */
export function PerformanceMonitor({ componentName, enabled = true }: PerformanceMonitorProps) {
  const renderCountRef = useRef(0);
  const renderStartTimeRef = useRef<number | null>(null);
  const lastRenderTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!enabled || process.env.NODE_ENV !== 'development') return;

    renderCountRef.current += 1;
    const now = performance.now();

    if (renderStartTimeRef.current === null) {
      renderStartTimeRef.current = now;
    }

    const renderTime = now - (renderStartTimeRef.current || now);
    const timeSinceLastRender = now - lastRenderTimeRef.current;

    log.info(`[Performance Monitor] ${componentName}:`, {
      renderCount: renderCountRef.current,
      renderTime: `${renderTime.toFixed(2)}ms`,
      timeSinceLastRender: `${timeSinceLastRender.toFixed(2)}ms`,
      timestamp: new Date().toISOString(),
    });

    lastRenderTimeRef.current = now;
    renderStartTimeRef.current = now;
  });

  return null;
}

/**
 * 함수 실행 시간 측정
 */
export function measureFunction<T>(
  name: string,
  fn: () => T | Promise<T>,
  enabled = true
): Promise<T> {
  if (!enabled || process.env.NODE_ENV !== 'development') {
    const result = fn();
    return result instanceof Promise ? result : Promise.resolve(result);
  }

  return measurePerformance(name, fn);
}

/**
 * 렌더링 성능 측정 훅
 */
export function useRenderPerformance(componentName: string, enabled = true) {
  const renderCountRef = useRef(0);
  const renderTimesRef = useRef<number[]>([]);

  useEffect(() => {
    if (!enabled || process.env.NODE_ENV !== 'development') return;

    const startTime = performance.now();
    renderCountRef.current += 1;

    const renderTimes = renderTimesRef.current;

    return () => {
      const renderTime = performance.now() - startTime;
      renderTimes.push(renderTime);

      if (renderTimes.length > 100) {
        renderTimes.shift();
      }
    };
  }, [componentName, enabled]);
}
