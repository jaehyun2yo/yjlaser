'use client';

import { useEffect, useRef } from 'react';

const HEARTBEAT_INTERVAL = 5 * 60 * 1000; // 5분마다 하트비트

/**
 * 세션 하트비트 훅
 * 페이지가 로드될 때 즉시 하트비트를 보내고,
 * 이후 1분마다 주기적으로 하트비트를 보냄
 */
export function useSessionHeartbeat(enabled: boolean = true) {
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const sendHeartbeat = async () => {
      try {
        await fetch('/api/session/heartbeat', {
          method: 'POST',
          credentials: 'include',
        });
      } catch {
        // 실패해도 조용히 무시 (네트워크 오류 등)
      }
    };

    // 즉시 첫 하트비트 전송
    sendHeartbeat();

    // 주기적으로 하트비트 전송
    intervalRef.current = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);

    // 페이지가 포커스를 받을 때도 하트비트 전송 (탭 전환 후 복귀 시)
    const handleFocus = () => {
      sendHeartbeat();
    };

    window.addEventListener('focus', handleFocus);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      window.removeEventListener('focus', handleFocus);
    };
  }, [enabled]);
}
