'use client';

import { useState } from 'react';
import type { FC } from 'react';
import { useAccessLogsQuery, useAccessLogStatsQuery } from '@/app/(admin)/admin/erp/_lib/hooks';
import { ACTIVITY_LOG_BADGE, BG_COLOR, BORDER_COLOR, DIVIDE_COLOR, TEXT_COLOR } from '@/lib/styles';
import { Shield, ShieldAlert, ShieldCheck, Globe, ChevronLeft, ChevronRight } from 'lucide-react';

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  login_success: {
    label: '로그인 성공',
    color: ACTIVITY_LOG_BADGE.login,
  },
  login_failed: {
    label: '로그인 실패',
    color: ACTIVITY_LOG_BADGE.delete,
  },
  ip_blocked: {
    label: 'IP 차단',
    color: ACTIVITY_LOG_BADGE.permissionChange,
  },
  logout: {
    label: '로그아웃',
    color: ACTIVITY_LOG_BADGE.logout,
  },
};

function getActionInfo(action: string) {
  return ACTION_LABELS[action] || { label: action, color: 'text-gray-600 bg-gray-100' };
}

function formatDateTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

export const AccessLogDashboard: FC = () => {
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState<string>('');

  const { data: stats, isLoading: statsLoading } = useAccessLogStatsQuery();
  const { data: logsData, isLoading: logsLoading } = useAccessLogsQuery({
    page,
    limit: 20,
    action: actionFilter || undefined,
  });

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          icon={<Shield className="w-5 h-5" />}
          label="총 접근"
          value={stats?.total_logins ?? 0}
          loading={statsLoading}
          color="text-blue-600"
          bgColor={BG_COLOR.infoLighter}
        />
        <StatCard
          icon={<ShieldCheck className="w-5 h-5" />}
          label="성공"
          value={stats?.successful_logins ?? 0}
          loading={statsLoading}
          color="text-green-600"
          bgColor={BG_COLOR.successLight}
        />
        <StatCard
          icon={<ShieldAlert className="w-5 h-5" />}
          label="실패"
          value={stats?.failed_logins ?? 0}
          loading={statsLoading}
          color="text-red-600"
          bgColor={BG_COLOR.errorLight}
        />
        <StatCard
          icon={<ShieldAlert className="w-5 h-5" />}
          label="IP 차단"
          value={stats?.blocked_attempts ?? 0}
          loading={statsLoading}
          color="text-orange-600"
          bgColor={BG_COLOR.orangeLight}
        />
        <StatCard
          icon={<Globe className="w-5 h-5" />}
          label="고유 IP"
          value={stats?.unique_ips ?? 0}
          loading={statsLoading}
          color="text-purple-600"
          bgColor={BG_COLOR.purpleLight}
        />
      </div>

      {/* 최근 차단 IP */}
      {stats && stats.recent_blocked_ips.length > 0 && (
        <div className={`p-4 rounded-xl border ${BORDER_COLOR.default} ${BG_COLOR.orangeSoft}`}>
          <h3 className={`text-sm font-medium ${TEXT_COLOR.orangeStrong} mb-2`}>
            최근 차단된 IP (24시간)
          </h3>
          <div className="flex flex-wrap gap-2">
            {stats.recent_blocked_ips.map((ip) => (
              <span
                key={ip}
                className={`text-xs font-mono px-2 py-1 rounded ${BG_COLOR.orangeLight} ${TEXT_COLOR.orangeStrong} border ${BORDER_COLOR.orange}`}
              >
                {ip}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 필터 */}
      <div className="flex gap-2 flex-wrap">
        {['', 'login_success', 'login_failed', 'ip_blocked'].map((action) => {
          const info = action ? getActionInfo(action) : { label: '전체', color: '' };
          return (
            <button
              key={action}
              onClick={() => {
                setActionFilter(action);
                setPage(1);
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition ${
                actionFilter === action
                  ? 'bg-brand text-white'
                  : `${BG_COLOR.light} ${TEXT_COLOR.secondary} hover:opacity-80`
              }`}
            >
              {info.label}
            </button>
          );
        })}
      </div>

      {/* 로그 테이블 */}
      <div className={`rounded-xl border ${BORDER_COLOR.default} ${BG_COLOR.card} overflow-hidden`}>
        {logsLoading ? (
          <div className="p-8 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand mx-auto" />
          </div>
        ) : !logsData || logsData.logs.length === 0 ? (
          <div className="p-8 text-center">
            <Shield className={`w-10 h-10 mx-auto mb-3 ${TEXT_COLOR.muted}`} />
            <p className={TEXT_COLOR.muted}>접근 로그가 없습니다</p>
          </div>
        ) : (
          <>
            {/* 모바일 카드 뷰 */}
            <div className={`block lg:hidden divide-y ${DIVIDE_COLOR.light}`}>
              {logsData.logs.map((log) => {
                const actionInfo = getActionInfo(log.action);
                return (
                  <div key={log.id} className="p-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${actionInfo.color}`}>
                        {actionInfo.label}
                      </span>
                      <span className={`text-xs ${TEXT_COLOR.muted}`}>
                        {formatDateTime(log.created_at)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className={TEXT_COLOR.primary}>{log.worker_name || '-'}</span>
                      <span className={`font-mono text-xs ${TEXT_COLOR.muted}`}>
                        {log.ip_address}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* 데스크톱 테이블 뷰 */}
            <table className="hidden lg:table w-full">
              <thead>
                <tr className={`border-b ${BORDER_COLOR.default} ${BG_COLOR.grayDark}`}>
                  <th
                    className={`text-left px-4 py-3 text-xs font-medium ${TEXT_COLOR.muted} uppercase`}
                  >
                    시간
                  </th>
                  <th
                    className={`text-left px-4 py-3 text-xs font-medium ${TEXT_COLOR.muted} uppercase`}
                  >
                    작업자
                  </th>
                  <th
                    className={`text-left px-4 py-3 text-xs font-medium ${TEXT_COLOR.muted} uppercase`}
                  >
                    액션
                  </th>
                  <th
                    className={`text-left px-4 py-3 text-xs font-medium ${TEXT_COLOR.muted} uppercase`}
                  >
                    IP 주소
                  </th>
                  <th
                    className={`text-left px-4 py-3 text-xs font-medium ${TEXT_COLOR.muted} uppercase`}
                  >
                    User-Agent
                  </th>
                </tr>
              </thead>
              <tbody className={`divide-y ${DIVIDE_COLOR.light}`}>
                {logsData.logs.map((log) => {
                  const actionInfo = getActionInfo(log.action);
                  return (
                    <tr key={log.id} className={`${BG_COLOR.hoverGrayDeep}`}>
                      <td className={`px-4 py-2.5 text-sm ${TEXT_COLOR.muted}`}>
                        {formatDateTime(log.created_at)}
                      </td>
                      <td className={`px-4 py-2.5 text-sm ${TEXT_COLOR.primary}`}>
                        {log.worker_name || '-'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs px-2 py-0.5 rounded-full ${actionInfo.color}`}>
                          {actionInfo.label}
                        </span>
                      </td>
                      <td className={`px-4 py-2.5 text-sm font-mono ${TEXT_COLOR.secondary}`}>
                        {log.ip_address}
                      </td>
                      <td
                        className={`px-4 py-2.5 text-xs ${TEXT_COLOR.muted} max-w-[200px] truncate`}
                      >
                        {log.user_agent || '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </>
        )}

        {/* 페이지네이션 */}
        {logsData && logsData.total > 20 && (
          <div
            className={`flex items-center justify-between px-4 py-3 border-t ${BORDER_COLOR.default} ${BG_COLOR.grayDark}`}
          >
            <p className={`text-sm ${TEXT_COLOR.muted}`}>
              총 {logsData.total}건 (페이지 {page}/{Math.ceil(logsData.total / 20)})
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className={`p-1.5 rounded-lg ${TEXT_COLOR.muted} ${BG_COLOR.hoverMuted} disabled:opacity-30 transition`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={() => setPage((p) => p + 1)}
                disabled={!logsData.hasMore}
                className={`p-1.5 rounded-lg ${TEXT_COLOR.muted} ${BG_COLOR.hoverMuted} disabled:opacity-30 transition`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Stat card component
function StatCard({
  icon,
  label,
  value,
  loading,
  color,
  bgColor,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  loading: boolean;
  color: string;
  bgColor: string;
}) {
  return (
    <div className={`rounded-xl border ${BORDER_COLOR.default} ${BG_COLOR.card} p-4`}>
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${bgColor} ${color}`}>{icon}</div>
        <div>
          <p className={`text-xs ${TEXT_COLOR.muted}`}>{label}</p>
          {loading ? (
            <div className={`h-6 w-12 ${BG_COLOR.medium} rounded animate-pulse mt-1`} />
          ) : (
            <p className={`text-xl font-bold ${TEXT_COLOR.primary}`}>{value}</p>
          )}
        </div>
      </div>
    </div>
  );
}
