'use client';

import { useState, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  FaDatabase,
  FaFolder,
  FaFile,
  FaBuilding,
  FaDownload,
  FaUpload,
  FaClock,
  FaChartBar,
  FaSync,
  FaCheckCircle,
  FaExclamationTriangle,
} from 'react-icons/fa';
import { TYPOGRAPHY, TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';
import { Button } from '@/components/ui/button';
import { queryKeys } from '@/lib/react-query/queryKeys';

// 로컬 카드 스타일
const CARD_STYLES = {
  base: `${BG_COLOR.card} rounded-lg border ${BORDER_COLOR.default} p-4 shadow-sm`,
};

interface PerformanceMetrics {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  totalCompanies: number;
  newFilesLast24h: number;
  undownloadedFiles: number;
  downloadsLast24h: number;
  uploadsLast24h: number;
  maxFolderDepth: number;
  avgFolderDepth: number;
  fileSizeDistribution: {
    small: number;
    medium: number;
    large: number;
    xlarge: number;
  };
  recentActivities: {
    action: string;
    count: number;
  }[];
  apiLatency: {
    filesListMs: number;
    foldersListMs: number;
    searchMs: number;
    undownloadedCountMs: number;
  };
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getLatencyStatus(ms: number): { color: string; label: string } {
  if (ms < 50) return { color: 'text-green-500', label: '빠름' };
  if (ms < 150) return { color: 'text-yellow-500', label: '보통' };
  if (ms < 300) return { color: 'text-orange-500', label: '느림' };
  return { color: 'text-red-500', label: '매우 느림' };
}

type ColorType = 'blue' | 'green' | 'purple' | 'orange' | 'red';

const colorClasses: Record<ColorType, string> = {
  blue: `${BG_COLOR.infoLighter} ${TEXT_COLOR.info}`,
  green: `${BG_COLOR.successLight} ${TEXT_COLOR.success}`,
  purple: `${BG_COLOR.purpleLight} ${TEXT_COLOR.purple}`,
  orange: `${BG_COLOR.orangeLight} ${TEXT_COLOR.orange}`,
  red: `${BG_COLOR.errorLight} ${TEXT_COLOR.error}`,
};

function StatCard({
  icon: Icon,
  label,
  value,
  subValue,
  color = 'blue',
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  subValue?: string;
  color?: ColorType;
}) {
  return (
    <div className={`${CARD_STYLES.base} animate-fadeInUp`}>
      <div className="flex items-center gap-4">
        <div className={`p-3 rounded-lg ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
        <div>
          <p className={`text-sm ${TEXT_COLOR.secondary}`}>{label}</p>
          <p className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>{value}</p>
          {subValue && <p className={`text-xs ${TEXT_COLOR.muted}`}>{subValue}</p>}
        </div>
      </div>
    </div>
  );
}

function LatencyCard({ latency }: { latency: PerformanceMetrics['apiLatency'] }) {
  const items = [
    { label: '파일 목록 조회', ms: latency.filesListMs },
    { label: '폴더 목록 조회', ms: latency.foldersListMs },
    { label: '검색 쿼리', ms: latency.searchMs },
    { label: '미다운로드 카운트', ms: latency.undownloadedCountMs },
  ];

  return (
    <div className={`${CARD_STYLES.base} col-span-full lg:col-span-2 animate-fadeInUp`}>
      <h3 className={`${TYPOGRAPHY.h4} mb-4 flex items-center gap-2`}>
        <FaClock className="text-blue-500" />
        API 응답 시간 (실시간 측정)
      </h3>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {items.map((item) => {
          const status = getLatencyStatus(item.ms);
          return (
            <div key={item.label} className={`${BG_COLOR.grayDark} rounded-lg p-4 text-center`}>
              <p className={`text-sm ${TEXT_COLOR.secondary} mb-1`}>{item.label}</p>
              <p className={`text-2xl font-bold ${status.color}`}>{item.ms}ms</p>
              <p className={`text-xs ${status.color}`}>{status.label}</p>
            </div>
          );
        })}
      </div>
      <div className={`mt-4 flex items-center gap-2 text-xs ${TEXT_COLOR.secondary}`}>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-green-500"></span> &lt;50ms
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-500"></span> 50-150ms
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-orange-500"></span> 150-300ms
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500"></span> &gt;300ms
        </span>
      </div>
    </div>
  );
}

function FileSizeDistributionCard({
  distribution,
}: {
  distribution: PerformanceMetrics['fileSizeDistribution'];
}) {
  const total = distribution.small + distribution.medium + distribution.large + distribution.xlarge;
  const items = [
    { label: '소형 (<1MB)', count: distribution.small, color: 'bg-green-500' },
    { label: '중형 (1-100MB)', count: distribution.medium, color: 'bg-blue-500' },
    { label: '대형 (100MB-1GB)', count: distribution.large, color: 'bg-orange-500' },
    { label: '초대형 (>1GB)', count: distribution.xlarge, color: 'bg-red-500' },
  ];

  return (
    <div className={`${CARD_STYLES.base} animate-fadeInUp`}>
      <h3 className={`${TYPOGRAPHY.h4} mb-4 flex items-center gap-2`}>
        <FaChartBar className="text-purple-500" />
        파일 크기 분포
      </h3>
      <div className="space-y-3">
        {items.map((item) => {
          const percentage = total > 0 ? (item.count / total) * 100 : 0;
          return (
            <div key={item.label}>
              <div className="flex justify-between text-sm mb-1">
                <span className={TEXT_COLOR.secondary}>{item.label}</span>
                <span className={TEXT_COLOR.primary}>
                  {item.count.toLocaleString()} ({percentage.toFixed(1)}%)
                </span>
              </div>
              <div className={`w-full ${BG_COLOR.medium} rounded-full h-2`}>
                <div
                  className={`h-2 rounded-full progress-bar-transition ${item.color}`}
                  style={{ width: `${percentage}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecentActivitiesCard({
  activities,
}: {
  activities: PerformanceMetrics['recentActivities'];
}) {
  const actionLabels: Record<string, string> = {
    UPLOAD: '업로드',
    DOWNLOAD: '다운로드',
    DELETE: '삭제',
    RENAME: '이름 변경',
    MOVE: '이동',
    LOGIN: '로그인',
    LOGOUT: '로그아웃',
    CREATE_FOLDER: '폴더 생성',
  };

  return (
    <div className={`${CARD_STYLES.base} animate-fadeInUp`}>
      <h3 className={`${TYPOGRAPHY.h4} mb-4`}>최근 24시간 활동</h3>
      {activities.length === 0 ? (
        <p className={TEXT_COLOR.secondary}>활동 기록이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {activities.map((activity) => (
            <div
              key={activity.action}
              className={`flex justify-between items-center py-2 border-b ${BORDER_COLOR.lightMedium} last:border-0`}
            >
              <span className={TEXT_COLOR.secondary}>
                {actionLabels[activity.action] || activity.action}
              </span>
              <span className={`font-semibold ${TEXT_COLOR.primary}`}>
                {activity.count.toLocaleString()}회
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PerformanceHealthCard({ metrics }: { metrics: PerformanceMetrics }) {
  const checks = [
    {
      label: '파일 목록 API 응답',
      passed: metrics.apiLatency.filesListMs < 150,
      value: `${metrics.apiLatency.filesListMs}ms`,
    },
    {
      label: '검색 API 응답',
      passed: metrics.apiLatency.searchMs < 200,
      value: `${metrics.apiLatency.searchMs}ms`,
    },
    {
      label: '폴더 깊이',
      passed: metrics.maxFolderDepth <= 10,
      value: `최대 ${metrics.maxFolderDepth}단계`,
    },
    {
      label: '미다운로드 파일',
      passed: metrics.undownloadedFiles < 100,
      value: `${metrics.undownloadedFiles}개`,
    },
  ];

  const passedCount = checks.filter((c) => c.passed).length;
  const healthScore = Math.round((passedCount / checks.length) * 100);

  return (
    <div className={`${CARD_STYLES.base} animate-fadeInUp`}>
      <h3 className={`${TYPOGRAPHY.h4} mb-4`}>성능 상태</h3>
      <div className="flex items-center gap-4 mb-4">
        <div
          className={`text-4xl font-bold ${healthScore >= 75 ? 'text-green-500' : healthScore >= 50 ? 'text-yellow-500' : 'text-red-500'}`}
        >
          {healthScore}%
        </div>
        <div className={`text-sm ${TEXT_COLOR.secondary}`}>
          {passedCount}/{checks.length} 항목 통과
        </div>
      </div>
      <div className="space-y-2">
        {checks.map((check) => (
          <div key={check.label} className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {check.passed ? (
                <FaCheckCircle className="text-green-500" />
              ) : (
                <FaExclamationTriangle className="text-yellow-500" />
              )}
              <span className={TEXT_COLOR.secondary}>{check.label}</span>
            </div>
            <span className={check.passed ? 'text-green-600' : 'text-yellow-600'}>
              {check.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function WebhardPerformancePage() {
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const {
    data: metricsData,
    isLoading,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: queryKeys.webhard.performance(),
    queryFn: async () => {
      const response = await fetch('/api/webhard/performance');
      if (!response.ok) throw new Error('Failed to fetch performance metrics');
      const data = await response.json();
      return data.metrics as PerformanceMetrics;
    },
    refetchInterval: 60000, // 1분마다 자동 갱신
    staleTime: 30000,
  });

  const handleRefresh = useCallback(() => {
    refetch();
    setLastRefresh(new Date());
  }, [refetch]);

  // 자동 갱신 시 시간 업데이트
  useEffect(() => {
    if (!isFetching) {
      setLastRefresh(new Date());
    }
  }, [isFetching]);

  if (error) {
    return (
      <div className="p-6">
        <div className={`${BG_COLOR.error} border ${BORDER_COLOR.error} rounded-lg p-4`}>
          <p className={TEXT_COLOR.error}>성능 데이터를 불러오는 중 오류가 발생했습니다.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className={TYPOGRAPHY.h2}>웹하드 성능 모니터링</h1>
          <p className={`${TEXT_COLOR.secondary} mt-1`}>
            마지막 갱신: {lastRefresh.toLocaleTimeString('ko-KR')}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={handleRefresh}
          disabled={isFetching}
          className="flex items-center gap-2"
        >
          <FaSync className={isFetching ? 'animate-spin' : ''} />
          {isFetching ? '갱신 중...' : '새로고침'}
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className={`${CARD_STYLES.base} animate-pulse`}>
              <div className="flex items-center gap-4">
                <div className={`w-12 h-12 ${BG_COLOR.medium} rounded-lg`} />
                <div className="flex-1">
                  <div className={`h-4 ${BG_COLOR.medium} rounded w-20 mb-2`} />
                  <div className={`h-6 ${BG_COLOR.medium} rounded w-16`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : metricsData ? (
        <>
          {/* 기본 통계 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={FaFile}
              label="총 파일 수"
              value={metricsData.totalFiles.toLocaleString()}
              subValue={formatBytes(metricsData.totalSize)}
              color="blue"
            />
            <StatCard
              icon={FaFolder}
              label="총 폴더 수"
              value={metricsData.totalFolders.toLocaleString()}
              subValue={`최대 깊이: ${metricsData.maxFolderDepth}단계`}
              color="purple"
            />
            <StatCard
              icon={FaBuilding}
              label="등록 업체"
              value={metricsData.totalCompanies.toLocaleString()}
              color="green"
            />
            <StatCard
              icon={FaDatabase}
              label="전체 용량"
              value={formatBytes(metricsData.totalSize)}
              color="orange"
            />
          </div>

          {/* 24시간 활동 */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              icon={FaFile}
              label="신규 파일 (24h)"
              value={metricsData.newFilesLast24h.toLocaleString()}
              color="blue"
            />
            <StatCard
              icon={FaExclamationTriangle}
              label="미다운로드 파일"
              value={metricsData.undownloadedFiles.toLocaleString()}
              color="red"
            />
            <StatCard
              icon={FaUpload}
              label="업로드 (24h)"
              value={metricsData.uploadsLast24h.toLocaleString()}
              color="green"
            />
            <StatCard
              icon={FaDownload}
              label="다운로드 (24h)"
              value={metricsData.downloadsLast24h.toLocaleString()}
              color="purple"
            />
          </div>

          {/* API 응답 시간 */}
          <LatencyCard latency={metricsData.apiLatency} />

          {/* 상세 분석 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <FileSizeDistributionCard distribution={metricsData.fileSizeDistribution} />
            <RecentActivitiesCard activities={metricsData.recentActivities} />
            <PerformanceHealthCard metrics={metricsData} />
          </div>
        </>
      ) : null}
    </div>
  );
}
