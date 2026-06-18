/**
 * 성능 모니터링 유틸리티
 * Web Vitals 및 성능 메트릭 수집
 */

/**
 * Web Vitals 메트릭 타입
 */
export interface WebVitalsMetric {
  id: string;
  name: 'CLS' | 'FCP' | 'FID' | 'INP' | 'LCP' | 'TTFB';
  value: number;
  rating: 'good' | 'needs-improvement' | 'poor';
  delta: number;
  navigationType: string;
}

/**
 * 성능 메트릭 수집 함수
 * Next.js의 reportWebVitals와 함께 사용
 */
export function reportWebVitals(metric: WebVitalsMetric) {
  // 개발 환경에서는 조용히 처리
  if (process.env.NODE_ENV === 'development') {
    // Silently handled
  }

  // 프로덕션 환경에서는 분석 서비스로 전송
  if (process.env.NODE_ENV === 'production') {
    // Google Analytics 또는 다른 분석 서비스로 전송
    if (typeof window !== 'undefined' && (window as { gtag?: unknown }).gtag) {
      const gtag = (
        window as unknown as { gtag: (command: string, targetId: string, config: unknown) => void }
      ).gtag;
      gtag('event', metric.name, {
        event_category: 'Web Vitals',
        value: Math.round(metric.name === 'CLS' ? metric.value * 1000 : metric.value),
        event_label: metric.id,
        non_interaction: true,
      });
    }

    // 커스텀 API 엔드포인트로 전송 (선택사항)
    if (process.env.NEXT_PUBLIC_ANALYTICS_API) {
      fetch(process.env.NEXT_PUBLIC_ANALYTICS_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(metric),
        keepalive: true,
      }).catch(() => {
        // 실패해도 무시 (성능에 영향 없도록)
      });
    }
  }
}

/**
 * 성능 측정 헬퍼
 */
export function measurePerformance<T>(name: string, fn: () => T | Promise<T>): Promise<T> {
  const start = performance.now();
  const result = fn();

  if (result instanceof Promise) {
    return result.finally(() => {
      const duration = performance.now() - start;
      if (process.env.NODE_ENV === 'development') {
        // Silently handled
      }
    });
  }

  const duration = performance.now() - start;
  if (process.env.NODE_ENV === 'development') {
    // Silently handled
  }
  return Promise.resolve(result);
}
