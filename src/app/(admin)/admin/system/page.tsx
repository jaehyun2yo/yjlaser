'use client';

import { ACTIVITY_LOG_BADGE, BG_COLOR, BORDER_COLOR, DIVIDE_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';
import {
  FiDatabase,
  FiFolder,
  FiFile,
  FiHardDrive,
  FiClock,
  FiDownload,
  FiUpload,
  FiActivity,
  FiRefreshCw,
  FiAlertCircle,
  FiCheckCircle,
  FiAlertTriangle,
  FiZap,
  FiUsers,
  FiLayers,
} from 'react-icons/fi';

// ==================== 타입 정의 ====================

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

interface ActivityLog {
  id: string;
  actor_type: 'admin' | 'company';
  actor_id: string;
  actor_name: string | null;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  details: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

// ==================== 로컬 스타일 상수 ====================

const CARD_STYLES = {
  base: `rounded-xl border ${BG_COLOR.card} ${BORDER_COLOR.default} shadow-sm`,
  hover: 'hover:shadow-md transition-shadow duration-200',
};

// ==================== 유틸리티 함수 ====================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function getLatencyStatus(ms: number): { color: string; label: string } {
  if (ms < 100) return { color: 'text-green-500', label: '빠름' };
  if (ms < 300) return { color: 'text-yellow-500', label: '보통' };
  return { color: 'text-red-500', label: '느림' };
}

function getHealthStatus(metrics: PerformanceMetrics): {
  status: 'good' | 'warning' | 'critical';
  message: string;
} {
  const avgLatency =
    (metrics.apiLatency.filesListMs +
      metrics.apiLatency.foldersListMs +
      metrics.apiLatency.searchMs +
      metrics.apiLatency.undownloadedCountMs) /
    4;

  if (avgLatency > 500) {
    return { status: 'critical', message: 'API 응답 속도가 느립니다. 최적화가 필요합니다.' };
  }
  if (avgLatency > 200 || metrics.undownloadedFiles > 100) {
    return { status: 'warning', message: '일부 지표가 주의가 필요합니다.' };
  }
  return { status: 'good', message: '시스템이 정상적으로 운영 중입니다.' };
}

// ==================== 컴포넌트 ====================

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
  color?: 'blue' | 'green' | 'orange' | 'purple' | 'red';
}) {
  const colorMap = {
    blue: `${BG_COLOR.info} ${TEXT_COLOR.info}`,
    green: `${BG_COLOR.success} ${TEXT_COLOR.success}`,
    orange: `${BG_COLOR.orange} ${TEXT_COLOR.orange}`,
    purple: `${BG_COLOR.purple} ${TEXT_COLOR.purple}`,
    red: `${BG_COLOR.error} ${TEXT_COLOR.error}`,
  };

  return (
    <div className={`${CARD_STYLES.base} ${CARD_STYLES.hover} p-4`}>
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${colorMap[color]}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${TEXT_COLOR.secondary}`}>{label}</p>
          <p className={`text-xl font-bold ${TEXT_COLOR.primary} mt-0.5`}>{value}</p>
          {subValue && <p className={`text-xs ${TEXT_COLOR.muted} mt-0.5`}>{subValue}</p>}
        </div>
      </div>
    </div>
  );
}

function LatencyCard({ metrics }: { metrics: PerformanceMetrics }) {
  const latencyItems = [
    { label: '파일 목록', ms: metrics.apiLatency.filesListMs },
    { label: '폴더 목록', ms: metrics.apiLatency.foldersListMs },
    { label: '검색', ms: metrics.apiLatency.searchMs },
    { label: '미다운로드 카운트', ms: metrics.apiLatency.undownloadedCountMs },
  ];

  return (
    <div className={`${CARD_STYLES.base} p-4`}>
      <div className="flex items-center gap-2 mb-4">
        <FiZap className="w-5 h-5 text-yellow-500" />
        <h3 className={`font-semibold ${TEXT_COLOR.primary}`}>API 응답 시간</h3>
      </div>
      <div className="space-y-3">
        {latencyItems.map((item) => {
          const status = getLatencyStatus(item.ms);
          return (
            <div key={item.label} className="flex items-center justify-between">
              <span className={`text-sm ${TEXT_COLOR.secondary}`}>{item.label}</span>
              <div className="flex items-center gap-2">
                <div className={`w-24 h-2 ${BG_COLOR.medium} rounded-full overflow-hidden`}>
                  <div
                    className={`h-full rounded-full ${
                      item.ms < 100
                        ? 'bg-green-500'
                        : item.ms < 300
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                    }`}
                    style={{ width: `${Math.min((item.ms / 500) * 100, 100)}%` }}
                  />
                </div>
                <span className={`text-sm font-medium ${status.color}`}>{item.ms}ms</span>
              </div>
            </div>
          );
        })}
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
    { label: '소형 (<1MB)', value: distribution.small, color: 'bg-blue-500' },
    { label: '중형 (1-100MB)', value: distribution.medium, color: 'bg-green-500' },
    { label: '대형 (100MB-1GB)', value: distribution.large, color: 'bg-yellow-500' },
    { label: '초대형 (>1GB)', value: distribution.xlarge, color: 'bg-red-500' },
  ];

  return (
    <div className={`${CARD_STYLES.base} p-4`}>
      <div className="flex items-center gap-2 mb-4">
        <FiLayers className="w-5 h-5 text-purple-500" />
        <h3 className={`font-semibold ${TEXT_COLOR.primary}`}>파일 크기 분포</h3>
      </div>
      <div className="space-y-2">
        {items.map((item) => (
          <div key={item.label} className="flex items-center justify-between text-sm">
            <span className={TEXT_COLOR.secondary}>{item.label}</span>
            <div className="flex items-center gap-2">
              <div className={`w-20 h-2 ${BG_COLOR.medium} rounded-full overflow-hidden`}>
                <div
                  className={`h-full rounded-full ${item.color}`}
                  style={{ width: `${total > 0 ? (item.value / total) * 100 : 0}%` }}
                />
              </div>
              <span className={`${TEXT_COLOR.primary} font-medium w-12 text-right`}>
                {item.value.toLocaleString()}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function HealthStatusCard({ metrics }: { metrics: PerformanceMetrics }) {
  const health = getHealthStatus(metrics);
  const statusConfig = {
    good: {
      icon: FiCheckCircle,
      color: 'text-green-500',
      bgColor: `${BG_COLOR.success}`,
      borderColor: `${BORDER_COLOR.success}`,
    },
    warning: {
      icon: FiAlertTriangle,
      color: 'text-yellow-500',
      bgColor: `${BG_COLOR.warning}`,
      borderColor: `${BORDER_COLOR.warning}`,
    },
    critical: {
      icon: FiAlertCircle,
      color: 'text-red-500',
      bgColor: `${BG_COLOR.error}`,
      borderColor: `${BORDER_COLOR.error}`,
    },
  };

  const config = statusConfig[health.status];
  const StatusIcon = config.icon;

  return (
    <div className={`rounded-xl border p-4 ${config.bgColor} ${config.borderColor}`}>
      <div className="flex items-center gap-3">
        <StatusIcon className={`w-6 h-6 ${config.color}`} />
        <div>
          <h3 className={`font-semibold ${TEXT_COLOR.primary}`}>시스템 상태</h3>
          <p className={`text-sm ${TEXT_COLOR.secondary}`}>{health.message}</p>
        </div>
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
    LOGIN: '로그인',
    LOGOUT: '로그아웃',
    CREATE_FOLDER: '폴더 생성',
    DELETE: '삭제',
  };

  return (
    <div className={`${CARD_STYLES.base} p-4`}>
      <div className="flex items-center gap-2 mb-4">
        <FiActivity className="w-5 h-5 text-green-500" />
        <h3 className={`font-semibold ${TEXT_COLOR.primary}`}>24시간 활동 요약</h3>
      </div>
      {activities.length === 0 ? (
        <p className={`text-sm ${TEXT_COLOR.secondary}`}>최근 활동이 없습니다.</p>
      ) : (
        <div className="space-y-2">
          {activities.slice(0, 5).map((activity) => (
            <div key={activity.action} className="flex items-center justify-between text-sm">
              <span className={TEXT_COLOR.secondary}>
                {actionLabels[activity.action] || activity.action}
              </span>
              <span className={`font-medium ${TEXT_COLOR.primary}`}>
                {activity.count.toLocaleString()}회
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActivityLogsSection() {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const limit = 10;

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.system.activityLogs({ page, actionFilter, actorFilter }),
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('page', page.toString());
      params.set('limit', limit.toString());
      if (actionFilter) params.set('action', actionFilter);
      if (actorFilter) params.set('actor', actorFilter);

      const response = await fetch(`/api/admin/activity-logs?${params}`);
      if (!response.ok) throw new Error('Failed to fetch logs');
      return response.json() as Promise<{
        logs: ActivityLog[];
        total: number;
        totalPages: number;
      }>;
    },
  });

  const actionColorMap: Record<string, string> = {
    LOGIN: ACTIVITY_LOG_BADGE.login,
    LOGOUT: ACTIVITY_LOG_BADGE.logout,
    UPLOAD: ACTIVITY_LOG_BADGE.upload,
    DOWNLOAD: ACTIVITY_LOG_BADGE.download,
  };

  return (
    <div className={`${CARD_STYLES.base} overflow-hidden`}>
      <div className={`p-4 border-b ${BORDER_COLOR.default}`}>
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-2">
            <FiActivity className="w-5 h-5 text-blue-500" />
            <h3 className={`font-semibold ${TEXT_COLOR.primary}`}>활동 로그</h3>
            {data && (
              <span className={`text-sm ${TEXT_COLOR.secondary}`}>
                (총 {data.total.toLocaleString()}건)
              </span>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className={`rounded-md ${BORDER_COLOR.strong} ${BG_COLOR.card} text-sm px-3 py-1.5`}
            >
              <option value="">모든 활동</option>
              <option value="LOGIN">로그인</option>
              <option value="LOGOUT">로그아웃</option>
              <option value="UPLOAD">업로드</option>
              <option value="DOWNLOAD">다운로드</option>
            </select>
            <input
              type="text"
              placeholder="사용자 검색"
              value={actorFilter}
              onChange={(e) => {
                setActorFilter(e.target.value);
                setPage(1);
              }}
              className={`rounded-md ${BORDER_COLOR.strong} ${BG_COLOR.card} text-sm px-3 py-1.5`}
            />
          </div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead
            className={`text-xs ${TEXT_COLOR.mediumBright} uppercase ${BG_COLOR.grayLighter} border-b ${BORDER_COLOR.medium}`}
          >
            <tr>
              <th className="px-4 py-3 font-medium">일시</th>
              <th className="px-4 py-3 font-medium">사용자</th>
              <th className="px-4 py-3 font-medium">활동</th>
              <th className="px-4 py-3 font-medium">IP</th>
              <th className="px-4 py-3 font-medium">상세</th>
            </tr>
          </thead>
          <tbody className={`divide-y ${DIVIDE_COLOR.default}`}>
            {isLoading ? (
              <tr>
                <td colSpan={5} className={`px-4 py-8 text-center ${TEXT_COLOR.secondary}`}>
                  <div className="flex items-center justify-center gap-2">
                    <FiRefreshCw className="w-4 h-4 animate-spin" />
                    로딩 중...
                  </div>
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-red-500">
                  로그를 불러오는 중 오류가 발생했습니다.
                </td>
              </tr>
            ) : data?.logs.length === 0 ? (
              <tr>
                <td colSpan={5} className={`px-4 py-8 text-center ${TEXT_COLOR.secondary}`}>
                  기록된 활동 로그가 없습니다.
                </td>
              </tr>
            ) : (
              data?.logs.map((log) => (
                <tr
                  key={log.id}
                  className={`${BG_COLOR.card} ${BG_COLOR.hoverMuted} transition-colors`}
                >
                  <td className={`px-4 py-3 whitespace-nowrap ${TEXT_COLOR.secondary} text-xs`}>
                    {format(new Date(log.created_at), 'MM-dd HH:mm:ss', { locale: ko })}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="flex flex-col">
                      <span className={`font-medium ${TEXT_COLOR.primary} text-xs`}>
                        {log.actor_name || '알 수 없음'}
                      </span>
                      <span className={`text-[10px] ${TEXT_COLOR.secondary}`}>
                        {log.actor_type === 'admin' ? '관리자' : '업체'}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                        actionColorMap[log.action] || ACTIVITY_LOG_BADGE.default
                      }`}
                    >
                      {log.action}
                    </span>
                  </td>
                  <td className={`px-4 py-3 whitespace-nowrap ${TEXT_COLOR.secondary} text-xs`}>
                    {log.ip_address || '-'}
                  </td>
                  <td
                    className={`px-4 py-3 ${TEXT_COLOR.secondary} text-xs max-w-[200px] truncate`}
                  >
                    {log.details ? JSON.stringify(log.details).slice(0, 50) + '...' : '-'}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* 페이지네이션 */}
      {data && data.totalPages > 1 && (
        <div
          className={`px-4 py-3 border-t ${BORDER_COLOR.default} flex items-center justify-center gap-2`}
        >
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              page === 1
                ? `${TEXT_COLOR.muted} cursor-not-allowed`
                : `${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
            }`}
          >
            이전
          </button>
          <span className={`text-sm ${TEXT_COLOR.secondary}`}>
            {page} / {data.totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
            disabled={page === data.totalPages}
            className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
              page === data.totalPages
                ? `${TEXT_COLOR.muted} cursor-not-allowed`
                : `${TEXT_COLOR.secondary} ${BG_COLOR.hoverMuted}`
            }`}
          >
            다음
          </button>
        </div>
      )}
    </div>
  );
}

// ==================== 메인 페이지 ====================

export default function SystemManagementPage() {
  const [activeTab, setActiveTab] = useState<'performance' | 'logs'>('performance');

  const {
    data: metricsData,
    isLoading,
    error,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: queryKeys.system.performance(),
    queryFn: async () => {
      const response = await fetch('/api/webhard/performance');
      if (!response.ok) throw new Error('Failed to fetch performance metrics');
      const data = await response.json();
      return data.metrics as PerformanceMetrics;
    },
    refetchInterval: 60000, // 1분마다 자동 갱신
  });

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>시스템 관리</h1>
          <p className={`text-sm ${TEXT_COLOR.secondary} mt-1`}>
            웹하드 성능 모니터링 및 활동 로그
          </p>
        </div>

        <div className="flex items-center gap-3">
          {dataUpdatedAt && (
            <span className={`text-xs ${TEXT_COLOR.secondary}`}>
              마지막 업데이트: {format(new Date(dataUpdatedAt), 'HH:mm:ss')}
            </span>
          )}
          <button
            onClick={() => refetch()}
            disabled={isLoading}
            className={`flex items-center gap-2 px-3 py-1.5 text-sm font-medium ${TEXT_COLOR.secondary} ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg ${BG_COLOR.hoverMuted} transition-colors disabled:opacity-50`}
          >
            <FiRefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className={`border-b ${BORDER_COLOR.default}`}>
        <nav className="flex gap-4">
          <button
            onClick={() => setActiveTab('performance')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'performance'
                ? `border-blue-500 ${TEXT_COLOR.info}`
                : `border-transparent ${TEXT_COLOR.secondary} ${TEXT_COLOR.hoverPrimary}`
            }`}
          >
            <span className="flex items-center gap-2">
              <FiZap className="w-4 h-4" />
              성능 모니터링
            </span>
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'logs'
                ? `border-blue-500 ${TEXT_COLOR.info}`
                : `border-transparent ${TEXT_COLOR.secondary} ${TEXT_COLOR.hoverPrimary}`
            }`}
          >
            <span className="flex items-center gap-2">
              <FiActivity className="w-4 h-4" />
              활동 로그
            </span>
          </button>
        </nav>
      </div>

      {/* 탭 컨텐츠 */}
      {activeTab === 'performance' && (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className={`flex items-center gap-3 ${TEXT_COLOR.secondary}`}>
                <FiRefreshCw className="w-5 h-5 animate-spin" />
                <span>성능 데이터를 불러오는 중...</span>
              </div>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center py-12">
              <div className="flex items-center gap-3 text-red-500">
                <FiAlertCircle className="w-5 h-5" />
                <span>성능 데이터를 불러오는 데 실패했습니다.</span>
              </div>
            </div>
          ) : metricsData ? (
            <div className="space-y-6">
              {/* 시스템 상태 */}
              <HealthStatusCard metrics={metricsData} />

              {/* 기본 통계 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon={FiFile}
                  label="총 파일 수"
                  value={metricsData.totalFiles.toLocaleString()}
                  color="blue"
                />
                <StatCard
                  icon={FiFolder}
                  label="총 폴더 수"
                  value={metricsData.totalFolders.toLocaleString()}
                  color="green"
                />
                <StatCard
                  icon={FiHardDrive}
                  label="총 스토리지"
                  value={formatBytes(metricsData.totalSize)}
                  color="purple"
                />
                <StatCard
                  icon={FiUsers}
                  label="등록 업체"
                  value={metricsData.totalCompanies.toLocaleString()}
                  color="orange"
                />
              </div>

              {/* 24시간 활동 */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <StatCard
                  icon={FiClock}
                  label="24시간 신규"
                  value={metricsData.newFilesLast24h.toLocaleString()}
                  subValue="새로 업로드된 파일"
                  color="blue"
                />
                <StatCard
                  icon={FiDatabase}
                  label="미다운로드"
                  value={metricsData.undownloadedFiles.toLocaleString()}
                  subValue="아직 다운로드 안 된 파일"
                  color="orange"
                />
                <StatCard
                  icon={FiUpload}
                  label="24시간 업로드"
                  value={metricsData.uploadsLast24h.toLocaleString()}
                  color="green"
                />
                <StatCard
                  icon={FiDownload}
                  label="24시간 다운로드"
                  value={metricsData.downloadsLast24h.toLocaleString()}
                  color="purple"
                />
              </div>

              {/* 상세 분석 */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <LatencyCard metrics={metricsData} />
                <FileSizeDistributionCard distribution={metricsData.fileSizeDistribution} />
                <RecentActivitiesCard activities={metricsData.recentActivities} />
              </div>

              {/* 폴더 깊이 정보 */}
              <div className={`${CARD_STYLES.base} p-4`}>
                <h3 className={`font-semibold ${TEXT_COLOR.primary} mb-3`}>폴더 구조 분석</h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className={TEXT_COLOR.secondary}>최대 폴더 깊이</span>
                    <p className={`text-lg font-bold ${TEXT_COLOR.primary}`}>
                      {metricsData.maxFolderDepth} 단계
                    </p>
                  </div>
                  <div>
                    <span className={TEXT_COLOR.secondary}>평균 폴더 깊이</span>
                    <p className={`text-lg font-bold ${TEXT_COLOR.primary}`}>
                      {metricsData.avgFolderDepth} 단계
                    </p>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </>
      )}

      {activeTab === 'logs' && <ActivityLogsSection />}
    </div>
  );
}
