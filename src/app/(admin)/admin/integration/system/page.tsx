'use client';

import dynamic from 'next/dynamic';
import { IntegrationNav } from '@/app/(admin)/admin/integration/_components';
import { BG_COLOR } from '@/lib/styles';

const SystemPage = dynamic(() => import('../../system/page'), {
  loading: () => (
    <div className="space-y-6">
      <div className={`h-8 w-48 ${BG_COLOR.medium} rounded animate-pulse`} />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className={`h-32 ${BG_COLOR.medium} rounded-xl animate-pulse`} />
        ))}
      </div>
    </div>
  ),
});

export default function IntegrationSystemPage() {
  return (
    <div className="space-y-6">
      <IntegrationNav />
      <SystemPage />
    </div>
  );
}
