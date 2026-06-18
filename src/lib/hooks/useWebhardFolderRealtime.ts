'use client';

/**
 * 웹하드 폴더 실시간 구독 훅 (Socket.IO 기반)
 * 기존 EventsGateway의 folder:created, folder:deleted 등의 이벤트를 활용합니다.
 */

import { useEffect, useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { invalidateAfterFolderMove } from '@/app/webhard/_lib/cacheHelpers';
import { webhardCacheUtils } from '@/lib/utils/webhardCacheUtils';
import { socketManager } from '@/lib/socket/socket-manager';

interface UseWebhardFolderRealtimeOptions {
  /** 회사 ID (업체 사용자일 경우) */
  companyId?: string | number;
  /** 새 폴더 알림 콜백 */
  onNewFolder?: (folder: Record<string, unknown>) => void;
  /** 폴더 삭제 알림 콜백 */
  onFolderDeleted?: (folderId: string) => void;
  /** 폴더 업데이트 알림 콜백 (이름 변경 등) */
  onFolderUpdated?: (folder: Record<string, unknown>) => void;
  /** 활성화 여부 (기본값: true) */
  enabled?: boolean;
}

/**
 * 웹하드 폴더 실시간 구독 훅 (Socket.IO 기반)
 * 기존 EventsGateway (기본 네임스페이스)를 사용합니다.
 */
export function useWebhardFolderRealtime({
  companyId,
  onNewFolder,
  onFolderDeleted,
  onFolderUpdated,
  enabled = true,
}: UseWebhardFolderRealtimeOptions) {
  const queryClient = useQueryClient();

  const invalidateFolders = useCallback(() => {
    invalidateAfterFolderMove(queryClient);
    webhardCacheUtils.invalidateBatchBadge(queryClient);
    webhardCacheUtils.invalidateTotalBadge(queryClient);
  }, [queryClient]);

  useEffect(() => {
    if (!enabled) return;

    // 기존 EventsGateway는 기본 네임스페이스 사용
    const socket = socketManager.connect('');

    const handleFolderCreated = (data: Record<string, unknown>) => {
      onNewFolder?.(data);
      invalidateFolders();
    };

    const handleFolderDeleted = (data: Record<string, unknown>) => {
      const folderId = data.id as string;
      if (folderId) onFolderDeleted?.(folderId);
      invalidateFolders();
    };

    const handleFolderMoved = () => {
      invalidateFolders();
    };

    const handleFolderRenamed = (data: Record<string, unknown>) => {
      onFolderUpdated?.(data);
      invalidateFolders();
    };

    socket.on('folder:created', handleFolderCreated);
    socket.on('folder:deleted', handleFolderDeleted);
    socket.on('folder:moved', handleFolderMoved);
    socket.on('folder:renamed', handleFolderRenamed);

    return () => {
      socket.off('folder:created', handleFolderCreated);
      socket.off('folder:deleted', handleFolderDeleted);
      socket.off('folder:moved', handleFolderMoved);
      socket.off('folder:renamed', handleFolderRenamed);
      socketManager.disconnect('');
    };
  }, [enabled, invalidateFolders, onNewFolder, onFolderDeleted, onFolderUpdated]);

  // 수동 새로고침 함수
  const refreshFolders = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: queryKeys.webhard.folders.list(companyId),
    });
  }, [queryClient, companyId]);

  return {
    refreshFolders,
  };
}

export default useWebhardFolderRealtime;
