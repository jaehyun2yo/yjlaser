'use client';

import { TEXT_COLOR } from '@/lib/styles';
import { TaskListView } from './_components';
import { WorkManagementNav } from '@/app/(admin)/admin/work-management/_components';

export default function WorkManagementBoardPage() {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div>
        <h1 className={`text-xl sm:text-2xl lg:text-3xl font-bold ${TEXT_COLOR.primary}`}>
          작업관리
        </h1>
        <p className={`text-sm sm:text-base ${TEXT_COLOR.secondary} mt-1 sm:mt-2`}>
          사무실 작업과 현장 작업을 카테고리별로 확인하세요
        </p>
      </div>

      <WorkManagementNav />

      <TaskListView />
    </div>
  );
}
