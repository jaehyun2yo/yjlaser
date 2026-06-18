'use client';

import type { FC } from 'react';
import type { Contact } from '@/lib/types/contact';
import { WORKER_STAGES } from '@/app/worker/_lib/hooks';

interface WorkerDashboardStatsProps {
  contacts: Contact[];
}

const STAGE_LABELS: Record<string, { label: string; emoji: string }> = {
  laser: { label: '레이저', emoji: '' },
  cutting: { label: '칼', emoji: '' },
  creasing: { label: '오시', emoji: '' },
  delivery: { label: '납품', emoji: '' },
};

export const WorkerDashboardStats: FC<WorkerDashboardStatsProps> = ({ contacts }) => {
  // 공정별 카운트
  const stageCounts = WORKER_STAGES.map((stage) => {
    const count = contacts.filter((c) => c.process_stage === stage).length;
    const info = STAGE_LABELS[stage] || { label: stage, emoji: '' };
    return { stage, count, ...info };
  });

  const totalActive = contacts.length;

  return (
    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 mb-3">
      <div className="bg-white rounded-lg p-2.5 text-center border border-gray-200">
        <p className="text-lg font-bold text-gray-900">{totalActive}</p>
        <p className="text-[10px] text-gray-500 font-medium">전체</p>
      </div>
      {stageCounts.map(({ stage, count, label }) => (
        <div key={stage} className="bg-white rounded-lg p-2.5 text-center border border-gray-200">
          <p className="text-lg font-bold text-gray-900">{count}</p>
          <p className="text-[10px] text-gray-500 font-medium">{label}</p>
        </div>
      ))}
    </div>
  );
};
