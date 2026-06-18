'use client';

import { TEXT_COLOR } from '@/lib/styles';
import { DeliveredListView } from './_components';
import { WorkManagementNav } from '@/app/(admin)/admin/work-management/_components';

export default function WorkManagementDeliveredPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl sm:text-2xl lg:text-3xl font-bold ${TEXT_COLOR.primary}`}>
          납품 완료
        </h1>
        <p className={`text-sm sm:text-base ${TEXT_COLOR.secondary} mt-1 sm:mt-2`}>
          납품 완료된 작업을 확인하세요
        </p>
      </div>

      <WorkManagementNav />

      <DeliveredListView />
    </div>
  );
}
