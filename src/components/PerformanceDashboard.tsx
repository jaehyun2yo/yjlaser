'use client';

import { useState, useEffect } from 'react';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

interface PerformanceMetric {
  name: string;
  value: number;
  unit: string;
  timestamp: number;
}

/**
 * 성능 대시보드 컴포넌트
 * 개발 환경에서만 표시되는 성능 모니터링 UI
 */
export function PerformanceDashboard() {
  const [metrics, setMetrics] = useState<PerformanceMetric[]>([]);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development') return;

    // Web Vitals 수집
    const collectMetrics = () => {
      if (typeof window === 'undefined') return;

      // FCP (First Contentful Paint)
      if ('PerformanceObserver' in window) {
        try {
          const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              if (entry.name === 'first-contentful-paint') {
                setMetrics((prev) => [
                  ...prev.filter((m) => m.name !== 'FCP'),
                  {
                    name: 'FCP',
                    value: entry.startTime,
                    unit: 'ms',
                    timestamp: Date.now(),
                  },
                ]);
              }
            }
          });
          observer.observe({ entryTypes: ['paint'] });
        } catch {
          // PerformanceObserver를 지원하지 않는 브라우저
        }
      }

      // 메모리 사용량 (Chrome만 지원)
      if ('memory' in performance) {
        const memory = (
          performance as unknown as { memory: { usedJSHeapSize: number; totalJSHeapSize: number } }
        ).memory;
        setMetrics((prev) => [
          ...prev.filter((m) => m.name !== 'Memory'),
          {
            name: 'Memory',
            value: memory.usedJSHeapSize / 1024 / 1024,
            unit: 'MB',
            timestamp: Date.now(),
          },
        ]);
      }

      // DOM 노드 수
      setMetrics((prev) => [
        ...prev.filter((m) => m.name !== 'DOM Nodes'),
        {
          name: 'DOM Nodes',
          value: document.getElementsByTagName('*').length,
          unit: 'nodes',
          timestamp: Date.now(),
        },
      ]);
    };

    collectMetrics();
    const interval = setInterval(collectMetrics, 2000);

    return () => clearInterval(interval);
  }, []);

  if (process.env.NODE_ENV !== 'development') return null;

  return (
    <>
      {/* 토글 버튼 */}
      <button
        onClick={() => setIsVisible(!isVisible)}
        className="fixed bottom-4 right-4 z-50 bg-blue-600 text-white px-4 py-2 rounded-lg shadow-lg hover:bg-blue-700 transition-colors text-sm font-medium"
        title="성능 대시보드 토글"
      >
        📊 Performance
      </button>

      {/* 대시보드 */}
      {isVisible && (
        <div
          className={`fixed bottom-20 right-4 z-50 ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg shadow-xl p-4 w-80 max-h-96 overflow-y-auto`}
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>성능 모니터</h3>
            <button
              onClick={() => setIsVisible(false)}
              className={`text-gray-500 ${TEXT_COLOR.hoverBright}`}
            >
              ✕
            </button>
          </div>

          <div className="space-y-2">
            {metrics.map((metric) => (
              <div
                key={metric.name}
                className={`flex items-center justify-between p-2 ${BG_COLOR.grayLighter} rounded`}
              >
                <span className={`text-sm font-medium ${TEXT_COLOR.secondary}`}>
                  {metric.name}:
                </span>
                <span className={`text-sm ${TEXT_COLOR.primary}`}>
                  {metric.value.toFixed(2)} {metric.unit}
                </span>
              </div>
            ))}
          </div>

          <div className={`mt-4 pt-4 border-t ${BORDER_COLOR.default}`}>
            <button
              onClick={() => setMetrics([])}
              className={`w-full px-3 py-1.5 text-xs ${BG_COLOR.mediumDarkStrong} ${TEXT_COLOR.secondary} rounded ${BG_COLOR.hoverMediumDark} transition-colors`}
            >
              메트릭 초기화
            </button>
          </div>
        </div>
      )}
    </>
  );
}
