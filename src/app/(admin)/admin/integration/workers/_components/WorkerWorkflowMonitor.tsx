'use client';

import { useState, useMemo } from 'react';
import type { FC } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkersQuery, useDashboardQuery } from '@/app/(admin)/admin/erp/_lib/hooks';
import { useStaffProcessContacts, useOfficeWorkerContacts } from '@/app/worker/_lib/hooks';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { useSocketNamespace } from '@/lib/socket/useSocketNamespace';
import { BG_COLOR, BORDER_COLOR, DIVIDE_COLOR, TEXT_COLOR } from '@/lib/styles';
import { Users, Activity, AlertTriangle, CheckCircle, Clock, Search } from 'lucide-react';
import type { ProcessStage } from '@/lib/utils/processStages';

type AdminTab = 'office' | 'field';

const STAGE_LABELS: Record<string, string> = {
  laser: '레이저가공',
  cutting: '칼 작업',
  creasing: '오시작업',
  delivery: '납품',
  drawing: '도면작업',
  sample: '샘플제작',
  drawing_confirmed: '도면확정/목형의뢰',
};

const OFFICE_SUB_FILTERS: Array<{ key: ProcessStage | 'all'; label: string }> = [
  { key: 'all', label: '전체' },
  { key: null, label: '공정 시작전' },
  { key: 'drawing', label: '도면작업' },
  { key: 'sample', label: '샘플제작' },
  { key: 'drawing_confirmed', label: '도면확정' },
];

const FIELD_SUB_FILTERS: Array<{ key: ProcessStage | 'all'; label: string }> = [
  { key: 'all', label: '전체' },
  { key: 'laser', label: '레이저가공' },
  { key: 'cutting', label: '칼 작업' },
  { key: 'creasing', label: '오시작업' },
  { key: 'delivery', label: '납품' },
];

function formatRelativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export const WorkerWorkflowMonitor: FC = () => {
  const queryClient = useQueryClient();
  const { data: workersData, isLoading: workersLoading } = useWorkersQuery();
  const { data: dashboardData, isLoading: dashboardLoading } = useDashboardQuery();
  const { data: fieldContacts = [], isLoading: fieldLoading } = useStaffProcessContacts();
  const { data: officeContacts = [], isLoading: officeLoading } = useOfficeWorkerContacts();

  const [adminTab, setAdminTab] = useState<AdminTab>('field');
  const [subFilter, setSubFilter] = useState<ProcessStage | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Socket.IO realtime
  const socketEvents = useMemo(
    () => ({
      'contact:created': () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all }),
      'contact:updated': () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all }),
      'contact:status_changed': () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all }),
      'contact:process_stage_changed': () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all }),
      'contact:deleted': () =>
        queryClient.invalidateQueries({ queryKey: queryKeys.processBoard.all }),
    }),
    [queryClient]
  );

  useSocketNamespace({ namespace: 'contacts', events: socketEvents });

  const isLoading = workersLoading || dashboardLoading || fieldLoading || officeLoading;
  const activeWorkers = workersData?.workers.filter((w) => w.is_active) || [];
  const allContacts = [...fieldContacts, ...officeContacts];
  const issueContacts = allContacts.filter((c) => c.worker_issue);

  const currentContacts = adminTab === 'field' ? fieldContacts : officeContacts;
  const subFilters = adminTab === 'field' ? FIELD_SUB_FILTERS : OFFICE_SUB_FILTERS;

  const filteredContacts = useMemo(() => {
    let result = currentContacts;
    if (subFilter !== 'all') {
      result = result.filter((c) => c.process_stage === subFilter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (c) =>
          c.company_name?.toLowerCase().includes(q) ||
          c.inquiry_number?.toLowerCase().includes(q) ||
          c.inquiry_title?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [currentContacts, subFilter, searchQuery]);

  const handleTabChange = (tab: AdminTab) => {
    setAdminTab(tab);
    setSubFilter('all');
    setSearchQuery('');
  };

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={<Users className="w-5 h-5" />}
          label="활성 작업자"
          value={activeWorkers.length}
          loading={isLoading}
          color="text-blue-600"
          bgColor={BG_COLOR.infoLighter}
        />
        <StatCard
          icon={<Activity className="w-5 h-5" />}
          label="진행중 작업"
          value={allContacts.length}
          loading={isLoading}
          color="text-green-600"
          bgColor={BG_COLOR.successLight}
        />
        <StatCard
          icon={<CheckCircle className="w-5 h-5" />}
          label="오늘 완료"
          value={dashboardData?.stats.completed_today ?? 0}
          loading={isLoading}
          color="text-emerald-600"
          bgColor={BG_COLOR.emeraldLight}
        />
        <StatCard
          icon={<AlertTriangle className="w-5 h-5" />}
          label="이슈 보고"
          value={issueContacts.length}
          loading={isLoading}
          color="text-red-600"
          bgColor={BG_COLOR.errorLight}
        />
      </div>

      {/* Issue alerts */}
      {issueContacts.length > 0 && (
        <div className={`rounded-xl border ${BORDER_COLOR.error} ${BG_COLOR.errorSoft} p-4`}>
          <h3
            className={`text-sm font-semibold ${TEXT_COLOR.errorMedium} mb-3 flex items-center gap-2`}
          >
            <AlertTriangle className="w-4 h-4" />
            이슈 보고 ({issueContacts.length}건)
          </h3>
          <div className="space-y-2">
            {issueContacts.map((c) => (
              <div
                key={c.id}
                className={`flex items-start gap-3 p-2.5 ${BG_COLOR.card} rounded-lg border ${BORDER_COLOR.errorSoft}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-medium ${TEXT_COLOR.primary}`}>
                      {c.company_name}
                    </span>
                    <span className={`text-xs ${TEXT_COLOR.muted}`}>
                      {c.inquiry_number || `#${c.id}`}
                    </span>
                    {c.process_stage && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${BG_COLOR.light} ${TEXT_COLOR.secondary}`}
                      >
                        {STAGE_LABELS[c.process_stage] || c.process_stage}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs ${TEXT_COLOR.error} mt-1`}>{c.worker_memo}</p>
                  <p className={`text-xs ${TEXT_COLOR.muted} mt-0.5`}>
                    {c.worker_memo_by}{' '}
                    {c.worker_memo_at ? `- ${formatRelativeTime(c.worker_memo_at)}` : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tab + Filter + Board */}
      <div className={`rounded-xl border ${BORDER_COLOR.default} ${BG_COLOR.card} overflow-hidden`}>
        {/* Main tabs */}
        <div className={`flex border-b ${BORDER_COLOR.default}`}>
          <button
            onClick={() => handleTabChange('office')}
            className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${
              adminTab === 'office'
                ? `${TEXT_COLOR.primary} border-b-2 border-blue-600`
                : `${TEXT_COLOR.muted} ${TEXT_COLOR.hoverTertiary}`
            }`}
          >
            사무실 작업 ({officeContacts.length})
          </button>
          <button
            onClick={() => handleTabChange('field')}
            className={`flex-1 py-3 text-sm font-semibold text-center transition-colors ${
              adminTab === 'field'
                ? `${TEXT_COLOR.primary} border-b-2 border-orange-500`
                : `${TEXT_COLOR.muted} ${TEXT_COLOR.hoverTertiary}`
            }`}
          >
            현장 작업 ({fieldContacts.length})
          </button>
        </div>

        {/* Search + Sub-filters */}
        <div className={`px-4 py-3 space-y-3 ${BG_COLOR.grayDark}/50`}>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="업체명, 문의번호, 패키지명 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`w-full pl-9 pr-3 py-2 border rounded-lg text-sm ${BORDER_COLOR.default} ${BG_COLOR.card} ${TEXT_COLOR.primary} focus:ring-2 focus:ring-brand focus:border-transparent`}
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {subFilters.map((filter) => {
              const count =
                filter.key === 'all'
                  ? currentContacts.length
                  : currentContacts.filter((c) => c.process_stage === filter.key).length;
              const isActive = subFilter === filter.key;
              return (
                <button
                  key={String(filter.key)}
                  onClick={() => setSubFilter(filter.key)}
                  className={`px-3 py-1 text-xs font-medium rounded-full whitespace-nowrap transition-colors ${
                    isActive
                      ? adminTab === 'field'
                        ? 'bg-brand text-white'
                        : 'bg-blue-600 text-white'
                      : `${BG_COLOR.mediumDarkStrong} ${TEXT_COLOR.secondary} ${BG_COLOR.hoverMediumDark}`
                  }`}
                >
                  {filter.label} ({count})
                </button>
              );
            })}
          </div>
        </div>

        {/* Contact card list */}
        <div className={`divide-y ${DIVIDE_COLOR.light} max-h-[500px] overflow-y-auto`}>
          {isLoading ? (
            <div className="p-8 flex justify-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand" />
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className={`p-8 text-center ${TEXT_COLOR.muted} text-sm`}>
              {searchQuery.trim() ? '검색 결과가 없습니다' : '대기중인 작업 없음'}
            </div>
          ) : (
            filteredContacts.map((c) => (
              <div key={c.id} className={`px-4 py-3 ${BG_COLOR.hoverGrayDeep}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 min-w-0">
                    {c.process_stage && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${BG_COLOR.light} ${TEXT_COLOR.secondary} shrink-0`}
                      >
                        {STAGE_LABELS[c.process_stage] || c.process_stage}
                      </span>
                    )}
                    {!c.process_stage && (
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded ${BG_COLOR.light} text-gray-500 shrink-0`}
                      >
                        시작전
                      </span>
                    )}
                    <span className={`text-xs ${TEXT_COLOR.muted} shrink-0`}>
                      {c.inquiry_number || `#${c.id}`}
                    </span>
                  </div>
                  <span className={`text-xs ${TEXT_COLOR.muted} shrink-0`}>
                    {formatRelativeTime(c.updated_at)}
                  </span>
                </div>
                <p className={`text-sm font-medium ${TEXT_COLOR.primary} truncate mt-1`}>
                  {c.company_name}
                </p>
                {c.inquiry_title && (
                  <p className={`text-xs ${TEXT_COLOR.muted} truncate mt-0.5`}>{c.inquiry_title}</p>
                )}
                {c.worker_memo && (
                  <div
                    className={`mt-1.5 text-xs px-2 py-1 rounded ${
                      c.worker_issue
                        ? `${BG_COLOR.error} ${TEXT_COLOR.error}`
                        : `${BG_COLOR.warning} ${TEXT_COLOR.yellowMid}`
                    }`}
                  >
                    {c.worker_issue ? '[이슈] ' : '[메모] '}
                    {c.worker_memo}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Count footer */}
        <div className={`px-4 py-2 border-t ${BORDER_COLOR.default} ${BG_COLOR.grayDark}`}>
          <p className={`text-xs ${TEXT_COLOR.muted}`}>총 {filteredContacts.length}건</p>
        </div>
      </div>

      {/* Recently completed */}
      {dashboardData && dashboardData.recent_completed.length > 0 && (
        <div
          className={`rounded-xl border ${BORDER_COLOR.default} ${BG_COLOR.card} overflow-hidden`}
        >
          <div className={`px-4 py-2.5 border-b ${BORDER_COLOR.default} ${BG_COLOR.grayDark}`}>
            <h3 className={`text-sm font-semibold ${TEXT_COLOR.primary} flex items-center gap-2`}>
              <Clock className="w-4 h-4" />
              오늘 완료된 작업
            </h3>
          </div>
          <div className={`divide-y ${DIVIDE_COLOR.light} max-h-[250px] overflow-y-auto`}>
            {dashboardData.recent_completed.map((task) => (
              <div key={task.id} className="px-4 py-2.5 flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <span className={`text-sm ${TEXT_COLOR.primary} truncate block`}>
                    {task.title}
                  </span>
                  {task.assigned_to && (
                    <span className={`text-xs ${TEXT_COLOR.muted}`}>담당: {task.assigned_to}</span>
                  )}
                </div>
                <div className="text-right shrink-0">
                  {task.actual_duration !== null && (
                    <span className={`text-xs ${TEXT_COLOR.muted}`}>
                      {task.actual_duration}분 소요
                    </span>
                  )}
                  <p className={`text-xs ${TEXT_COLOR.muted}`}>
                    {formatRelativeTime(task.completed_at)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

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
