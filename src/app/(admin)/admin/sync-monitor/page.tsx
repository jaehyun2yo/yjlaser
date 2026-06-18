'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  FiRefreshCw,
  FiPlay,
  FiPause,
  FiRotateCcw,
  FiCheckCircle,
  FiAlertTriangle,
  FiAlertCircle,
  FiDownload,
  FiServer,
  FiWifi,
  FiArrowDown,
} from 'react-icons/fi';
import { queryKeys } from '@/lib/react-query/queryKeys';

// ==================== 타입 정의 ====================

interface SyncServiceStatus {
  running: boolean;
  pid?: number;
  startedAt?: string;
  uptime?: number;
  health: 'healthy' | 'degraded' | 'unhealthy';
}

interface SyncStatusResponse {
  success: boolean;
  data: {
    syncService: SyncServiceStatus;
    syncMode: string;
    direction: string;
  };
  error?: {
    code: string;
    message: string;
  };
}

interface SyncStatsResponse {
  success: boolean;
  data: {
    syncMode: string;
    direction: string;
    service: {
      running: boolean;
      uptime: number;
      health: string;
    };
    totals: {
      filesDownloaded: number;
      filesSkipped: number;
      filesFailed: number;
      bytesTransferred: number;
    };
    queue: {
      pending: number;
      processing: number;
      completed: number;
      failed: number;
    };
    lastSync: string | null;
    websocket: {
      connectedClients: number;
    };
  };
}

interface SyncEvent {
  id: string;
  type: string;
  direction: string;
  fileName: string;
  status: string;
  createdAt: string;
}

// ==================== 로컬 스타일 상수 ====================

const CARD_STYLES = {
  base: `rounded-xl border ${BG_COLOR.card} ${BORDER_COLOR.default} shadow-sm`,
  hover: 'hover:shadow-md transition-shadow duration-200',
};

// ==================== 유틸리티 함수 ====================

function formatUptime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}일 ${hours % 24}시간`;
  if (hours > 0) return `${hours}시간 ${minutes % 60}분`;
  if (minutes > 0) return `${minutes}분`;
  return `${seconds}초`;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ==================== 컴포넌트 ====================

function ServiceStatusCard({
  status,
  isLoading,
  onRefresh,
}: {
  status: SyncServiceStatus | null;
  isLoading: boolean;
  onRefresh: () => void;
}) {
  if (isLoading) {
    return (
      <div className={`${CARD_STYLES.base} p-6`}>
        <div className="flex items-center justify-center py-8">
          <FiRefreshCw className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (!status) {
    return (
      <div className={`${CARD_STYLES.base} p-6`}>
        <div className="flex items-center gap-3 text-red-500">
          <FiAlertCircle className="w-6 h-6" />
          <div>
            <h3 className="font-semibold">연결 실패</h3>
            <p className={`text-sm ${TEXT_COLOR.secondary}`}>동기화 서비스에 연결할 수 없습니다.</p>
          </div>
        </div>
        <button
          onClick={onRefresh}
          className={`mt-4 flex items-center gap-2 px-3 py-1.5 text-sm font-medium ${TEXT_COLOR.info} ${BG_COLOR.hoverBlue} rounded-lg transition-colors`}
        >
          <FiRefreshCw className="w-4 h-4" />
          재시도
        </button>
      </div>
    );
  }

  const healthConfig = {
    healthy: {
      icon: FiCheckCircle,
      color: 'text-green-500',
      bgColor: `${BG_COLOR.success}`,
      label: '정상',
    },
    degraded: {
      icon: FiAlertTriangle,
      color: 'text-yellow-500',
      bgColor: `${BG_COLOR.warning}`,
      label: '주의',
    },
    unhealthy: {
      icon: FiAlertCircle,
      color: 'text-red-500',
      bgColor: `${BG_COLOR.error}`,
      label: '오류',
    },
  };

  const config = healthConfig[status.health] || healthConfig.unhealthy;
  const HealthIcon = config.icon;

  return (
    <div className={`${CARD_STYLES.base} p-6`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>서비스 상태</h3>
        <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${config.bgColor}`}>
          <HealthIcon className={`w-4 h-4 ${config.color}`} />
          <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <p className={`text-sm ${TEXT_COLOR.secondary}`}>실행 상태</p>
          <p className={`text-lg font-semibold ${TEXT_COLOR.primary} flex items-center gap-2`}>
            {status.running ? (
              <>
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                실행 중
              </>
            ) : (
              <>
                <span className="w-2 h-2 rounded-full bg-gray-400" />
                중지됨
              </>
            )}
          </p>
        </div>

        <div>
          <p className={`text-sm ${TEXT_COLOR.secondary}`}>PID</p>
          <p className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>{status.pid || '-'}</p>
        </div>

        <div>
          <p className={`text-sm ${TEXT_COLOR.secondary}`}>가동 시간</p>
          <p className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>
            {status.uptime ? formatUptime(status.uptime) : '-'}
          </p>
        </div>

        <div>
          <p className={`text-sm ${TEXT_COLOR.secondary}`}>시작 시간</p>
          <p className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>
            {status.startedAt
              ? format(new Date(status.startedAt), 'MM-dd HH:mm', { locale: ko })
              : '-'}
          </p>
        </div>
      </div>
    </div>
  );
}

function SyncModeCard() {
  return (
    <div className={`${CARD_STYLES.base} p-6`}>
      <div className="flex items-center gap-3 mb-4">
        <div className={`p-2 rounded-lg ${BG_COLOR.info}`}>
          <FiArrowDown className="w-5 h-5 text-blue-500" />
        </div>
        <div>
          <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>동기화 모드</h3>
          <p className={`text-sm ${TEXT_COLOR.secondary}`}>단방향 동기화</p>
        </div>
      </div>

      <div className="flex items-center justify-center py-4">
        <div className="flex items-center gap-4">
          <div className="text-center">
            <div className={`p-3 rounded-lg ${BG_COLOR.orange} mb-2`}>
              <FiServer className="w-6 h-6 text-orange-500 mx-auto" />
            </div>
            <p className={`text-sm font-medium ${TEXT_COLOR.primary}`}>LGU+ 웹하드</p>
          </div>

          <div className="flex items-center">
            <FiArrowDown className="w-6 h-6 text-blue-500 rotate-[-90deg]" />
          </div>

          <div className="text-center">
            <div className={`p-3 rounded-lg ${BG_COLOR.success} mb-2`}>
              <FiDownload className="w-6 h-6 text-green-500 mx-auto" />
            </div>
            <p className={`text-sm font-medium ${TEXT_COLOR.primary}`}>로컬 저장소</p>
          </div>
        </div>
      </div>

      <p className={`text-xs text-center ${TEXT_COLOR.secondary} mt-2`}>
        외부 웹하드에서 로컬로만 동기화됩니다.
      </p>
    </div>
  );
}

function StatsCard({ stats }: { stats: SyncStatsResponse['data'] | null }) {
  if (!stats) return null;

  const items = [
    {
      icon: FiDownload,
      label: '다운로드 완료',
      value: stats.totals.filesDownloaded,
      color: 'blue',
    },
    { icon: FiCheckCircle, label: '스킵됨', value: stats.totals.filesSkipped, color: 'green' },
    { icon: FiAlertCircle, label: '실패', value: stats.totals.filesFailed, color: 'red' },
    {
      icon: FiWifi,
      label: 'WS 클라이언트',
      value: stats.websocket.connectedClients,
      color: 'purple',
    },
  ];

  const colorMap: Record<string, string> = {
    blue: `${BG_COLOR.info} ${TEXT_COLOR.info}`,
    green: `${BG_COLOR.success} ${TEXT_COLOR.success}`,
    red: `${BG_COLOR.error} ${TEXT_COLOR.error}`,
    purple: `${BG_COLOR.purple} ${TEXT_COLOR.purple}`,
  };

  return (
    <div className={`${CARD_STYLES.base} p-6`}>
      <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>동기화 통계</h3>

      <div className="grid grid-cols-2 gap-4">
        {items.map((item) => (
          <div key={item.label} className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${colorMap[item.color]}`}>
              <item.icon className="w-4 h-4" />
            </div>
            <div>
              <p className={`text-sm ${TEXT_COLOR.secondary}`}>{item.label}</p>
              <p className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>
                {item.value.toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>

      {stats.totals.bytesTransferred > 0 && (
        <div className={`mt-4 pt-4 border-t ${BORDER_COLOR.default}`}>
          <p className={`text-sm ${TEXT_COLOR.secondary}`}>총 전송량</p>
          <p className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>
            {formatBytes(stats.totals.bytesTransferred)}
          </p>
        </div>
      )}
    </div>
  );
}

function QueueStatusCard({ stats }: { stats: SyncStatsResponse['data'] | null }) {
  if (!stats) return null;

  const queueItems = [
    { label: '대기 중', value: stats.queue.pending, color: 'bg-yellow-500' },
    { label: '처리 중', value: stats.queue.processing, color: 'bg-blue-500' },
    { label: '완료', value: stats.queue.completed, color: 'bg-green-500' },
    { label: '실패', value: stats.queue.failed, color: 'bg-red-500' },
  ];

  const total = queueItems.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className={`${CARD_STYLES.base} p-6`}>
      <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>큐 상태</h3>

      <div className="space-y-3">
        {queueItems.map((item) => (
          <div key={item.label} className="flex items-center justify-between">
            <span className={`text-sm ${TEXT_COLOR.secondary}`}>{item.label}</span>
            <div className="flex items-center gap-2">
              <div className={`w-24 h-2 ${BG_COLOR.medium} rounded-full overflow-hidden`}>
                <div
                  className={`h-full rounded-full ${item.color}`}
                  style={{ width: total > 0 ? `${(item.value / total) * 100}%` : '0%' }}
                />
              </div>
              <span className={`text-sm font-medium ${TEXT_COLOR.primary} w-10 text-right`}>
                {item.value}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ControlPanel({
  isRunning,
  onStart,
  onStop,
  onRestart,
  isPending,
}: {
  isRunning: boolean;
  onStart: () => void;
  onStop: () => void;
  onRestart: () => void;
  isPending: boolean;
}) {
  return (
    <div className={`${CARD_STYLES.base} p-6`}>
      <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>서비스 제어</h3>

      <div className="space-y-3">
        {!isRunning ? (
          <button
            onClick={onStart}
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isPending ? (
              <FiRefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <FiPlay className="w-4 h-4" />
            )}
            {isPending ? '처리 중...' : '시작'}
          </button>
        ) : (
          <>
            <button
              onClick={onStop}
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? (
                <FiRefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FiPause className="w-4 h-4" />
              )}
              {isPending ? '처리 중...' : '중지'}
            </button>

            <button
              onClick={onRestart}
              disabled={isPending}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium ${TEXT_COLOR.secondary} ${BG_COLOR.light} ${BG_COLOR.hoverDark} rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isPending ? (
                <FiRefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <FiRotateCcw className="w-4 h-4" />
              )}
              {isPending ? '처리 중...' : '재시작'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

// ==================== 메인 페이지 ====================

export default function SyncMonitorPage() {
  const queryClient = useQueryClient();

  // 상태 조회
  const {
    data: statusData,
    isLoading: statusLoading,
    error: statusError,
    refetch: refetchStatus,
  } = useQuery({
    queryKey: queryKeys.sync.status(),
    queryFn: async (): Promise<SyncStatusResponse> => {
      const res = await fetch('/api/sync/status');
      return res.json();
    },
    staleTime: 3000,
    refetchInterval: (query) => {
      const data = query.state.data as SyncStatusResponse | undefined;
      if (!data) return 5000;
      return data.data?.syncService?.running ? 5000 : 30000;
    },
  });

  // 통계 조회
  const { data: statsData } = useQuery({
    queryKey: queryKeys.sync.stats(),
    queryFn: async (): Promise<SyncStatsResponse> => {
      const res = await fetch('/api/sync/stats');
      return res.json();
    },
    staleTime: 5000,
    refetchInterval: () => {
      if (!statusData) return 10000;
      return statusData.data?.syncService?.running ? 10000 : 60000;
    },
    enabled: !statusError,
  });

  // 제어 뮤테이션
  const controlMutation = useMutation({
    mutationFn: async (action: 'start' | 'stop' | 'restart') => {
      const res = await fetch('/api/sync/control', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.sync.status() });
      queryClient.invalidateQueries({ queryKey: queryKeys.sync.stats() });
    },
  });

  const status = statusData?.success ? statusData.data.syncService : null;
  const stats = statsData?.success ? statsData.data : null;

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>LGU+ 동기화 모니터</h1>
          <p className={`text-sm ${TEXT_COLOR.secondary} mt-1`}>
            외부 웹하드 → 로컬 단방향 동기화 서비스
          </p>
        </div>

        <button
          onClick={() => refetchStatus()}
          disabled={statusLoading}
          className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium ${TEXT_COLOR.secondary} ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.hoverLighter} transition-colors disabled:opacity-50`}
        >
          <FiRefreshCw className={`w-4 h-4 ${statusLoading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {/* 상태 오류 메시지 */}
      {statusError && (
        <div className={`p-4 rounded-lg ${BG_COLOR.error} border ${BORDER_COLOR.error}`}>
          <div className={`flex items-center gap-2 ${TEXT_COLOR.error}`}>
            <FiAlertCircle className="w-5 h-5" />
            <span>동기화 서비스에 연결할 수 없습니다.</span>
          </div>
        </div>
      )}

      {/* 메인 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 좌측: 서비스 상태 및 동기화 모드 */}
        <div className="lg:col-span-2 space-y-6">
          <ServiceStatusCard
            status={status}
            isLoading={statusLoading}
            onRefresh={() => refetchStatus()}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <SyncModeCard />
            <StatsCard stats={stats} />
          </div>

          <QueueStatusCard stats={stats} />
        </div>

        {/* 우측: 제어 패널 */}
        <div className="space-y-6">
          <ControlPanel
            isRunning={status?.running || false}
            onStart={() => controlMutation.mutate('start')}
            onStop={() => controlMutation.mutate('stop')}
            onRestart={() => controlMutation.mutate('restart')}
            isPending={controlMutation.isPending}
          />

          {/* 추가 정보 */}
          <div className={`${CARD_STYLES.base} p-6`}>
            <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-4`}>정보</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className={TEXT_COLOR.secondary}>동기화 방향</span>
                <span className={`font-medium ${TEXT_COLOR.primary}`}>LGU+ → 로컬</span>
              </div>
              <div className="flex justify-between">
                <span className={TEXT_COLOR.secondary}>양방향 동기화</span>
                <span className="font-medium text-gray-500">비활성화됨</span>
              </div>
              <div className="flex justify-between">
                <span className={TEXT_COLOR.secondary}>API 서버</span>
                <span className={`font-medium ${TEXT_COLOR.primary}`}>:3001</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
