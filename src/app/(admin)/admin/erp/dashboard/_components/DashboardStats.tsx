'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useDashboardQuery } from '@/app/(admin)/admin/erp/_lib/hooks';

export function DashboardStats() {
  const { data, isLoading, error } = useDashboardQuery();

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        {[...Array(6)].map((_, i) => (
          <div key={i} className={`${BG_COLOR.card} rounded-lg p-4 shadow-sm animate-pulse`}>
            <div className={`h-4 w-16 ${BG_COLOR.medium} rounded mb-2`} />
            <div className={`h-8 w-12 ${BG_COLOR.medium} rounded`} />
          </div>
        ))}
      </div>
    );
  }

  if (error || !data) {
    return null;
  }

  const stats = [
    { label: '전체 작업', value: data.stats.total_tasks, color: TEXT_COLOR.primary },
    { label: '대기', value: data.stats.pending_tasks, color: TEXT_COLOR.secondary },
    { label: '진행중', value: data.stats.in_progress_tasks, color: TEXT_COLOR.info },
    { label: '오늘 완료', value: data.stats.completed_today, color: TEXT_COLOR.success },
    { label: '긴급', value: data.stats.urgent_tasks, color: TEXT_COLOR.error },
    { label: '납기 지연', value: data.stats.overdue_contacts, color: TEXT_COLOR.orange },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
      {stats.map((stat) => (
        <div
          key={stat.label}
          className={`${BG_COLOR.card} rounded-lg p-4 shadow-sm border ${BORDER_COLOR.lightMedium}`}
        >
          <p className={`text-xs ${TEXT_COLOR.secondary} mb-1`}>{stat.label}</p>
          <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
        </div>
      ))}
    </div>
  );
}

export function WorkerStats() {
  const { data, isLoading } = useDashboardQuery();

  if (isLoading || !data?.workers.length) {
    return null;
  }

  return (
    <div className={`${BG_COLOR.card} rounded-lg p-4 shadow-sm border ${BORDER_COLOR.lightMedium}`}>
      <h3 className={`text-sm font-semibold ${TEXT_COLOR.primary} mb-3`}>작업자 현황</h3>
      <div className="space-y-2">
        {data.workers.map((worker) => (
          <div
            key={worker.name}
            className={`flex items-center justify-between py-2 border-b ${BORDER_COLOR.lightMedium} last:border-0`}
          >
            <span className={`text-sm ${TEXT_COLOR.secondary}`}>{worker.name}</span>
            <div className="flex items-center gap-3 text-xs">
              <span className="text-blue-600">진행 {worker.active_tasks}</span>
              <span className="text-green-600">완료 {worker.completed_today}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MachineStats() {
  const { data, isLoading } = useDashboardQuery();

  if (isLoading || !data?.machines.length) {
    return null;
  }

  return (
    <div className={`${BG_COLOR.card} rounded-lg p-4 shadow-sm border ${BORDER_COLOR.lightMedium}`}>
      <h3 className={`text-sm font-semibold ${TEXT_COLOR.primary} mb-3`}>설비 현황</h3>
      <div className="space-y-2">
        {data.machines.map((machine) => (
          <div
            key={machine.id}
            className={`flex items-center justify-between py-2 border-b ${BORDER_COLOR.lightMedium} last:border-0`}
          >
            <span className={`text-sm ${TEXT_COLOR.secondary}`}>{machine.name}</span>
            <div className="flex items-center gap-2">
              {machine.active_tasks > 0 ? (
                <span className="text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full">
                  작업중 {machine.active_tasks}
                </span>
              ) : (
                <span className="text-xs px-2 py-0.5 bg-gray-100 text-gray-600 rounded-full">
                  대기
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function RecentCompleted() {
  const { data, isLoading } = useDashboardQuery();

  if (isLoading || !data?.recent_completed.length) {
    return null;
  }

  return (
    <div className={`${BG_COLOR.card} rounded-lg p-4 shadow-sm border ${BORDER_COLOR.lightMedium}`}>
      <h3 className={`text-sm font-semibold ${TEXT_COLOR.primary} mb-3`}>최근 완료 작업</h3>
      <div className="space-y-2">
        {data.recent_completed.slice(0, 5).map((task) => (
          <div
            key={task.id}
            className={`flex items-center justify-between py-2 border-b ${BORDER_COLOR.lightMedium} last:border-0`}
          >
            <div className="flex-1 min-w-0">
              <p className={`text-sm ${TEXT_COLOR.secondary} truncate`}>{task.title}</p>
              {task.assigned_to && <p className="text-xs text-gray-400">{task.assigned_to}</p>}
            </div>
            {task.actual_duration && (
              <span className="text-xs text-gray-500 shrink-0 ml-2">
                {Math.round(task.actual_duration)}분
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
