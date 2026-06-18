'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * 로딩 상태를 최소 지속 시간 동안 유지시키는 훅.
 *
 * - `isLoading`이 짧게 `true`→`false`로 바뀔 때 스켈레톤이 깜빡이는 것을 방지한다.
 * - 로딩이 시작된 시각을 기록해 두고, `false`로 내려가는 시점에 남은 시간만큼 지연시킨다.
 * - 한 번도 로딩이 시작된 적이 없으면(항상 false) 즉시 false를 반환한다.
 *
 * @param isLoading 원본 로딩 상태
 * @param minDurationMs 최소 유지 시간 (ms). 기본 1500
 */
export function useMinLoadingState(isLoading: boolean, minDurationMs = 1500): boolean {
  const [display, setDisplay] = useState(isLoading);
  const startRef = useRef<number | null>(isLoading ? Date.now() : null);

  useEffect(() => {
    if (isLoading) {
      if (startRef.current === null) {
        startRef.current = Date.now();
      }
      setDisplay(true);
      return;
    }

    if (startRef.current === null) {
      setDisplay(false);
      return;
    }

    const elapsed = Date.now() - startRef.current;
    if (elapsed >= minDurationMs) {
      setDisplay(false);
      startRef.current = null;
      return;
    }

    const timer = setTimeout(() => {
      setDisplay(false);
      startRef.current = null;
    }, minDurationMs - elapsed);
    return () => clearTimeout(timer);
  }, [isLoading, minDurationMs]);

  return display;
}
