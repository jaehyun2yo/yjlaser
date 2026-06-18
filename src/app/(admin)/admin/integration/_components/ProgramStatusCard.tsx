'use client';

import type { FC } from 'react';
import { Monitor, Wifi, WifiOff, AlertTriangle, Clock } from 'lucide-react';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR, BADGE } from '@/lib/styles';
import type { ProgramInfo, ProgramStatus } from '@/app/(admin)/admin/integration/_lib/types';

interface Props {
  program: ProgramInfo;
}

function formatLastSeen(lastSeen?: string): string {
  if (!lastSeen) return '알 수 없음';
  const diff = Date.now() - new Date(lastSeen).getTime();
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return `${seconds}초 전`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

function formatUptime(uptime?: number): string {
  if (!uptime) return '-';
  const hours = Math.floor(uptime / 3600);
  const minutes = Math.floor((uptime % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}

function getStatusConfig(status: ProgramStatus) {
  switch (status) {
    case 'online':
      return {
        label: '온라인',
        badge: BADGE.success,
        icon: <Wifi className="w-4 h-4 text-green-500" />,
        dotColor: 'bg-green-500',
      };
    case 'offline':
      return {
        label: '오프라인',
        badge: BADGE.gray,
        icon: <WifiOff className="w-4 h-4 text-gray-400" />,
        dotColor: 'bg-gray-400',
      };
    case 'error':
      return {
        label: '오류',
        badge: BADGE.error,
        icon: <AlertTriangle className="w-4 h-4 text-red-500" />,
        dotColor: 'bg-red-500',
      };
  }
}

const ProgramStatusCard: FC<Props> = ({ program }) => {
  const statusConfig = getStatusConfig(program.status);

  return (
    <div
      className={`${BG_COLOR.card} rounded-xl border ${BORDER_COLOR.default} p-5 shadow-sm hover:shadow-md transition-shadow`}
    >
      {/* 헤더 */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg ${program.status === 'online' ? `${BG_COLOR.success}` : program.status === 'error' ? `${BG_COLOR.error}` : `${BG_COLOR.lightDark}`} flex items-center justify-center`}
          >
            <Monitor
              className={`w-5 h-5 ${program.status === 'online' ? `${TEXT_COLOR.success}` : program.status === 'error' ? `${TEXT_COLOR.error}` : 'text-gray-400'}`}
            />
          </div>
          <div>
            <h3 className={`font-semibold text-sm ${TEXT_COLOR.primary}`}>{program.displayName}</h3>
            {program.hostname && (
              <p className={`text-xs ${TEXT_COLOR.secondary}`}>{program.hostname}</p>
            )}
            {program.instanceName && !program.hostname && (
              <p className={`text-xs ${TEXT_COLOR.secondary}`}>{program.instanceName}</p>
            )}
          </div>
        </div>

        {/* 상태 배지 */}
        <div className="flex items-center gap-1.5">
          <div
            className={`w-2 h-2 rounded-full ${statusConfig.dotColor} ${program.status === 'online' ? 'animate-pulse' : ''}`}
          />
          <span className={statusConfig.badge}>{statusConfig.label}</span>
        </div>
      </div>

      {/* 정보 */}
      <div className="space-y-2">
        {program.version && (
          <div className="flex items-center justify-between">
            <span className={`text-xs ${TEXT_COLOR.secondary}`}>버전</span>
            <span className={`text-xs font-mono ${TEXT_COLOR.secondary}`}>{program.version}</span>
          </div>
        )}

        {program.uptime !== undefined && program.status === 'online' && (
          <div className="flex items-center justify-between">
            <span className={`text-xs ${TEXT_COLOR.secondary}`}>가동시간</span>
            <span className={`text-xs ${TEXT_COLOR.secondary}`}>
              {formatUptime(program.uptime)}
            </span>
          </div>
        )}

        <div className="flex items-center justify-between">
          <span className={`text-xs ${TEXT_COLOR.secondary} flex items-center gap-1`}>
            <Clock className="w-3 h-3" />
            마지막 확인
          </span>
          <span className={`text-xs ${TEXT_COLOR.secondary}`}>
            {formatLastSeen(program.lastSeen)}
          </span>
        </div>
      </div>
    </div>
  );
};

export default ProgramStatusCard;
