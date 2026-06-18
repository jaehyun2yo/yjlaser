'use client';

import { useState, useCallback } from 'react';
import {
  RefreshCw,
  Wifi,
  WifiOff,
  AlertTriangle,
  CheckCircle,
  XCircle,
  Clock,
  Activity,
  Server,
  Database,
  HardDrive,
} from 'lucide-react';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { useApiHealthCheck } from '@/app/(admin)/admin/integration/_lib/hooks';
import { IntegrationNav } from '@/app/(admin)/admin/integration/_components';
import type { ApiHealthResult } from '@/app/(admin)/admin/integration/_lib/api';

// 서비스 아이콘 매핑
const SERVICE_ICONS: Record<string, React.ReactNode> = {
  'NestJS API 서버': <Server className="w-5 h-5" />,
  '웹하드 API (프록시)': <HardDrive className="w-5 h-5" />,
  'Next.js 서버': <Database className="w-5 h-5" />,
};

// 상태별 색상/아이콘 매핑
function getStatusConfig(status: ApiHealthResult['status']) {
  switch (status) {
    case 'connected':
      return {
        icon: <CheckCircle className="w-5 h-5" />,
        color: TEXT_COLOR.success,
        bg: BG_COLOR.success,
        border: BORDER_COLOR.success,
        label: '연결됨',
        dot: 'bg-green-500',
      };
    case 'disconnected':
      return {
        icon: <XCircle className="w-5 h-5" />,
        color: TEXT_COLOR.error,
        bg: BG_COLOR.error,
        border: BORDER_COLOR.error,
        label: '연결 끊김',
        dot: 'bg-red-500',
      };
    case 'error':
      return {
        icon: <AlertTriangle className="w-5 h-5" />,
        color: TEXT_COLOR.warning,
        bg: BG_COLOR.warning,
        border: BORDER_COLOR.warning,
        label: '오류',
        dot: 'bg-yellow-500',
      };
  }
}

function getResponseTimeColor(ms: number): string {
  if (ms < 200) return TEXT_COLOR.success;
  if (ms < 500) return TEXT_COLOR.warning;
  return TEXT_COLOR.error;
}

function getResponseTimeLabel(ms: number): string {
  if (ms < 200) return '빠름';
  if (ms < 500) return '보통';
  return '느림';
}

// API 상태 카드 컴포넌트
function ApiStatusCard({ result }: { result: ApiHealthResult }) {
  const config = getStatusConfig(result.status);
  const responseColor = getResponseTimeColor(result.responseTime);

  return (
    <div className={`rounded-xl border ${config.border} ${config.bg} p-5 transition-all`}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={config.color}>
            {SERVICE_ICONS[result.name] || <Activity className="w-5 h-5" />}
          </div>
          <div>
            <h3 className={`font-semibold ${TEXT_COLOR.primary}`}>{result.name}</h3>
            <p className={`text-xs mt-0.5 ${TEXT_COLOR.muted}`}>{result.url}</p>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 ${config.color}`}>
          <div
            className={`w-2 h-2 rounded-full ${config.dot} ${result.status === 'connected' ? 'animate-pulse' : ''}`}
          />
          <span className="text-xs font-medium">{config.label}</span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* 응답 시간 */}
        <div className={`p-3 rounded-lg ${BG_COLOR.card}`}>
          <div className="flex items-center gap-1.5 mb-1">
            <Clock className={`w-3.5 h-3.5 ${TEXT_COLOR.muted}`} />
            <span className={`text-xs ${TEXT_COLOR.muted}`}>응답 시간</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className={`text-lg font-bold ${responseColor}`}>{result.responseTime}</span>
            <span className={`text-xs ${TEXT_COLOR.muted}`}>ms</span>
          </div>
          <span className={`text-xs ${responseColor}`}>
            {getResponseTimeLabel(result.responseTime)}
          </span>
        </div>

        {/* 상태 코드 */}
        <div className={`p-3 rounded-lg ${BG_COLOR.card}`}>
          <div className="flex items-center gap-1.5 mb-1">
            {config.icon}
            <span className={`text-xs ${TEXT_COLOR.muted}`}>상태</span>
          </div>
          {result.statusCode ? (
            <span className={`text-lg font-bold ${config.color}`}>{result.statusCode}</span>
          ) : (
            <span className={`text-sm font-medium ${config.color}`}>
              {result.errorMessage || '알 수 없음'}
            </span>
          )}
        </div>
      </div>

      {/* 에러 메시지 */}
      {result.errorMessage && result.status !== 'connected' && (
        <div className={`mt-3 p-2 rounded-lg ${BG_COLOR.weakLight}`}>
          <p className={`text-xs ${config.color}`}>{result.errorMessage}</p>
        </div>
      )}
    </div>
  );
}

// 전체 상태 요약 컴포넌트
function OverallStatus({ results }: { results: ApiHealthResult[] }) {
  const connectedCount = results.filter((r) => r.status === 'connected').length;
  const totalCount = results.length;
  const allConnected = connectedCount === totalCount;
  const allDisconnected = connectedCount === 0;

  const avgResponseTime = Math.round(
    results.reduce((sum, r) => sum + r.responseTime, 0) / totalCount
  );

  let statusConfig;
  if (allConnected) {
    statusConfig = {
      icon: <Wifi className="w-6 h-6" />,
      color: '${TEXT_COLOR.success}',
      bg: '${BG_COLOR.success}',
      border: '${BORDER_COLOR.success}',
      label: '모든 서비스 정상',
      description: '모든 API 서비스가 정상적으로 연결되어 있습니다.',
    };
  } else if (allDisconnected) {
    statusConfig = {
      icon: <WifiOff className="w-6 h-6" />,
      color: '${TEXT_COLOR.error}',
      bg: '${BG_COLOR.error}',
      border: '${BORDER_COLOR.error}',
      label: '서비스 연결 끊김',
      description: '모든 API 서비스에 연결할 수 없습니다. 서버 상태를 확인해주세요.',
    };
  } else {
    statusConfig = {
      icon: <AlertTriangle className="w-6 h-6" />,
      color: '${TEXT_COLOR.warning}',
      bg: '${BG_COLOR.warning}',
      border: '${BORDER_COLOR.warning}',
      label: '일부 서비스 문제',
      description: `${totalCount}개 중 ${connectedCount}개 서비스만 연결되어 있습니다.`,
    };
  }

  return (
    <div className={`rounded-xl border ${statusConfig.border} ${statusConfig.bg} p-5`}>
      <div className="flex items-center gap-4">
        <div className={statusConfig.color}>{statusConfig.icon}</div>
        <div className="flex-1">
          <h2 className={`text-lg font-bold ${TEXT_COLOR.primary}`}>{statusConfig.label}</h2>
          <p className={`text-sm mt-0.5 ${TEXT_COLOR.secondary}`}>{statusConfig.description}</p>
        </div>
        <div className="text-right">
          <div className="flex items-center gap-2">
            <span className={`text-2xl font-bold ${statusConfig.color}`}>
              {connectedCount}/{totalCount}
            </span>
          </div>
          <p className={`text-xs ${TEXT_COLOR.muted}`}>평균 응답: {avgResponseTime}ms</p>
        </div>
      </div>
    </div>
  );
}

export default function IntegrationSettingsPage() {
  const { data, isLoading, refetch, dataUpdatedAt } = useApiHealthCheck();
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refetch();
    setIsRefreshing(false);
  }, [refetch]);

  const isSpinning = isLoading || isRefreshing;

  return (
    <div className="space-y-6">
      <IntegrationNav />

      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>일반설정</h1>
          <p className={`text-sm mt-1 ${TEXT_COLOR.secondary}`}>
            API 통신 상태 확인 및 시스템 설정을 관리합니다
          </p>
        </div>

        <div className="flex items-center gap-3">
          {dataUpdatedAt && (
            <span className={`text-xs ${TEXT_COLOR.muted}`}>
              마지막 확인: {new Date(dataUpdatedAt).toLocaleTimeString('ko-KR')}
            </span>
          )}
          <Button
            variant="ghost"
            onClick={handleRefresh}
            disabled={isSpinning}
            className="flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isSpinning ? 'animate-spin' : ''}`} />
            상태 확인
          </Button>
        </div>
      </div>

      {/* API 통신 상태 섹션 */}
      <section>
        <div className="flex items-center gap-2 mb-4">
          <Activity className={`w-5 h-5 ${TEXT_COLOR.brand}`} />
          <h2 className={`text-base font-semibold ${TEXT_COLOR.primary}`}>API 통신 상태</h2>
        </div>

        {isLoading && !data ? (
          <div className="space-y-4">
            {/* 요약 스켈레톤 */}
            <div className={`h-24 rounded-xl ${BG_COLOR.light} animate-pulse`} />
            {/* 카드 스켈레톤 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className={`h-48 rounded-xl ${BG_COLOR.light} animate-pulse`} />
              ))}
            </div>
          </div>
        ) : data ? (
          <div className="space-y-4">
            {/* 전체 요약 */}
            <OverallStatus results={data.results} />

            {/* 개별 API 상태 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {data.results.map((result) => (
                <ApiStatusCard key={result.name} result={result} />
              ))}
            </div>

            {/* 안내 텍스트 */}
            <p className={`text-xs text-center ${TEXT_COLOR.muted}`}>
              API 상태는 1분마다 자동으로 갱신됩니다. 수동 확인은 &quot;상태 확인&quot; 버튼을
              클릭하세요.
            </p>
          </div>
        ) : (
          <div
            className={`p-16 text-center ${BG_COLOR.card} rounded-xl border ${BORDER_COLOR.default}`}
          >
            <WifiOff className={`w-12 h-12 mx-auto mb-4 ${TEXT_COLOR.muted} opacity-40`} />
            <p className={`text-lg font-medium ${TEXT_COLOR.muted}`}>상태를 확인할 수 없습니다</p>
            <p className={`text-sm mt-1 ${TEXT_COLOR.muted}`}>
              &quot;상태 확인&quot; 버튼을 클릭하여 다시 시도해주세요
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
