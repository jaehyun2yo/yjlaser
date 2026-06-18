'use client';

/**
 * useWebhardSocketRealtime
 * WebSocket 기반 실시간 업데이트 훅
 * - 폴더별 구독으로 현재 보고 있는 폴더의 변경사항만 수신
 * - 파일/폴더 CRUD 이벤트 시 React Query 캐시 자동 무효화
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useSocketNamespace } from '@/lib/socket/useSocketNamespace';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { invalidateBadgeCounts, invalidateStorageUsage } from '@/app/webhard/_lib/cacheHelpers';

interface UseWebhardSocketRealtimeOptions {
  /** 현재 보고 있는 폴더 ID */
  folderId: string | null;
  /** 활성화 여부 (기본값: true) */
  enabled?: boolean;
}

export function useWebhardSocketRealtime({
  folderId,
  enabled = true,
}: UseWebhardSocketRealtimeOptions) {
  const queryClient = useQueryClient();
  const currentFolderRef = useRef<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 디바운싱된 파일 캐시 무효화 (1초 윈도우 — 대량 동기화 시 9000 → 1-5회)
  const debouncedInvalidateFiles = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({ queryKey: queryKeys.webhard.files.all() });
      invalidateBadgeCounts(queryClient);
      invalidateStorageUsage(queryClient);
      debounceTimerRef.current = null;
    }, 1000);
  }, [queryClient]);

  // 언마운트 시 디바운스 타이머 정리
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, []);

  const handleFolderChanged = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: queryKeys.webhard.folders.all() });
  }, [queryClient]);

  // useSocketNamespace로 연결 및 이벤트 구독 (기본 네임스페이스 = 루트)
  const { socket } = useSocketNamespace({
    namespace: '',
    events: {
      'file:created': () => debouncedInvalidateFiles(),
      'file:deleted': () => debouncedInvalidateFiles(),
      'file:moved': () => debouncedInvalidateFiles(),
      'file:renamed': () => debouncedInvalidateFiles(),
      'batch:update': () => debouncedInvalidateFiles(),
      'folder:created': () => handleFolderChanged(),
      'folder:deleted': () => handleFolderChanged(),
      'folder:moved': () => handleFolderChanged(),
      'folder:renamed': () => handleFolderChanged(),
    },
    enabled,
  });

  // 폴더 변경 시 구독 갱신
  useEffect(() => {
    if (!socket || !enabled) return;

    // 이전 폴더 구독 해제
    if (currentFolderRef.current) {
      socket.emit('unsubscribe:folder', currentFolderRef.current);
    }

    // 새 폴더 구독
    const folderKey = folderId || 'root';
    socket.emit('subscribe:folder', folderKey);
    currentFolderRef.current = folderKey;

    return () => {
      if (socket.connected && currentFolderRef.current) {
        socket.emit('unsubscribe:folder', currentFolderRef.current);
      }
    };
  }, [folderId, enabled, socket]);
}
