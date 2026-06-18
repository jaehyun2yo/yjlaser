'use client';

/**
 * StorageUsage
 * 저장 공간 사용량 표시 컴포넌트
 */

import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { FC } from 'react';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';
import { getStorageUsage } from '@/lib/api/webhard-api-client';

interface StorageUsageProps {
  userType: 'admin' | 'company';
  userId: string;
}

export const StorageUsage: FC<StorageUsageProps> = ({ userType, userId }) => {
  const { data: storageData } = useQuery({
    queryKey: queryKeys.webhard.storage(userType, userId),
    queryFn: async () => {
      const companyId = userType === 'company' ? Number(userId) : undefined;
      return getStorageUsage(companyId);
    },
    staleTime: 0,
    refetchOnWindowFocus: true,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });

  if (!storageData) return null;

  const active = storageData.active ?? storageData.current;
  const trash = storageData.trash ?? 0;
  const percentage = Math.min(100, (storageData.current / storageData.max) * 100);
  const activePercentage =
    storageData.current > 0 ? Math.min(100, (active / storageData.current) * percentage) : 0;
  const trashPercentage =
    storageData.current > 0 ? Math.min(100, (trash / storageData.current) * percentage) : 0;

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  return (
    <div className={`px-4 py-4 mt-auto border-t ${BORDER_COLOR.default} ${BG_COLOR.page}/50`}>
      <div className="flex justify-between items-end mb-2">
        <span className={`text-xs font-semibold ${TEXT_COLOR.secondary}`}>저장 공간</span>
        <span className={`text-[10px] ${TEXT_COLOR.muted} font-medium`}>
          {formatSize(storageData.current)} / {formatSize(storageData.max)}
        </span>
      </div>
      <div className={`w-full ${BG_COLOR.muted} rounded-full h-2 overflow-hidden flex`}>
        {activePercentage > 0 && (
          <div
            className={`h-full ${BG_COLOR.brand} progress-bar-transition`}
            style={{ width: `${activePercentage}%` }}
            aria-hidden="true"
          />
        )}
        {trashPercentage > 0 && (
          <div
            className={`h-full ${BG_COLOR.warningSolid} progress-bar-transition`}
            style={{ width: `${trashPercentage}%` }}
            aria-hidden="true"
          />
        )}
      </div>
      <div className={`mt-2 space-y-1 text-[10px] ${TEXT_COLOR.muted}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1">
            <span className={`h-1.5 w-1.5 rounded-full ${BG_COLOR.brand}`} aria-hidden="true" />
            사용 중
          </span>
          <span>{formatSize(active)}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1">
            <span
              className={`h-1.5 w-1.5 rounded-full ${BG_COLOR.warningSolid}`}
              aria-hidden="true"
            />
            휴지통
          </span>
          <span>{formatSize(trash)}</span>
        </div>
        <div className="text-right">{percentage.toFixed(1)}% 사용 중</div>
      </div>
    </div>
  );
};

export default StorageUsage;
