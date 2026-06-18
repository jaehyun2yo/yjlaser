'use client';

/**
 * 웹하드 파일 실시간 구독 훅 (Socket.IO 기반)
 * 기존 EventsGateway의 file:created, file:deleted 등의 이벤트를 활용합니다.
 * - 현재 폴더의 파일 변경사항을 실시간으로 감지
 * - React Query 캐시 자동 무효화
 */

import { useEffect, useRef, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { invalidateStorageUsage } from '@/app/webhard/_lib/cacheHelpers';
import { webhardCacheUtils } from '@/lib/utils/webhardCacheUtils';
import { socketManager } from '@/lib/socket/socket-manager';

interface UseWebhardFileRealtimeOptions {
  /** 현재 보고 있는 폴더 ID */
  currentFolderId: string | null;
  /** 회사 ID (업체 사용자일 경우) */
  companyId?: string | number;
  /** 새 파일 알림 콜백 */
  onNewFile?: (file: Record<string, unknown>) => void;
  /** 파일 삭제 알림 콜백 */
  onFileDeleted?: (fileId: string) => void;
  /** 파일 업데이트 알림 콜백 */
  onFileUpdated?: (file: Record<string, unknown>) => void;
  /** 활성화 여부 (기본값: true) */
  enabled?: boolean;
}

/**
 * 웹하드 파일 실시간 구독 훅 (Socket.IO 기반)
 * 기존 EventsGateway (기본 네임스페이스)를 사용합니다.
 */
export function useWebhardFileRealtime({
  currentFolderId,
  companyId,
  onNewFile,
  onFileDeleted,
  onFileUpdated,
  enabled = true,
}: UseWebhardFileRealtimeOptions) {
  const queryClient = useQueryClient();
  const currentFolderRef = useRef<string | null>(null);

  // 파일 캐시 무효화 (디바운스)
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedInvalidate = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.webhard.files.all(),
      });
      // 뱃지 카운트 무효화
      if (currentFolderId) {
        webhardCacheUtils.invalidateAncestorBadges(queryClient, currentFolderId, companyId);
      }
      webhardCacheUtils.invalidateTotalBadge(queryClient);
      invalidateStorageUsage(queryClient);
      debounceTimerRef.current = null;
    }, 300);
  }, [queryClient, currentFolderId, companyId]);

  useEffect(() => {
    if (!enabled) return;

    // 기존 EventsGateway는 기본 네임스페이스 (namespace 없음) 사용
    const socket = socketManager.connect('');

    // 폴더 구독
    const folderKey = currentFolderId || 'root';
    socket.emit('subscribe:folder', folderKey);
    currentFolderRef.current = folderKey;

    const handleFileCreated = (data: Record<string, unknown>) => {
      onNewFile?.(data);
      debouncedInvalidate();
    };

    const handleFileDeleted = (data: Record<string, unknown>) => {
      const fileId = data.id as string;
      if (fileId) onFileDeleted?.(fileId);
      debouncedInvalidate();
    };

    const handleFileMoved = () => {
      debouncedInvalidate();
    };

    const handleFileRenamed = (data: Record<string, unknown>) => {
      onFileUpdated?.(data);
      debouncedInvalidate();
    };

    const handleBatchUpdate = () => {
      debouncedInvalidate();
    };

    socket.on('file:created', handleFileCreated);
    socket.on('file:deleted', handleFileDeleted);
    socket.on('file:moved', handleFileMoved);
    socket.on('file:renamed', handleFileRenamed);
    socket.on('batch:update', handleBatchUpdate);

    return () => {
      // 폴더 구독 해제
      if (currentFolderRef.current) {
        socket.emit('unsubscribe:folder', currentFolderRef.current);
        currentFolderRef.current = null;
      }

      socket.off('file:created', handleFileCreated);
      socket.off('file:deleted', handleFileDeleted);
      socket.off('file:moved', handleFileMoved);
      socket.off('file:renamed', handleFileRenamed);
      socket.off('batch:update', handleBatchUpdate);

      socketManager.disconnect('');

      // 디바운스 타이머 정리
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
    };
  }, [enabled, currentFolderId, debouncedInvalidate, onNewFile, onFileDeleted, onFileUpdated]);

  // 수동 새로고침 함수
  const refreshFiles = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.files.list({ folderId: currentFolderId ?? undefined }),
    });
  }, [queryClient, currentFolderId]);

  return {
    refreshFiles,
  };
}

export default useWebhardFileRealtime;
