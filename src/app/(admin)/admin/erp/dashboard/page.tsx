'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState } from 'react';
import { KanbanBoard } from './_components';
import {
  DashboardStats,
  WorkerStats,
  MachineStats,
  RecentCompleted,
} from './_components/DashboardStats';
import { useCreateTaskMutation } from '@/app/(admin)/admin/erp/_lib/hooks';
import { ErpNav } from '@/app/(admin)/admin/erp/_components';
import type { TaskPriority, TaskType } from '@/app/(admin)/admin/erp/_lib/types';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('ErpDashboardPage');

export default function ErpDashboardPage() {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);

  return (
    <div className="space-y-4 sm:space-y-6">
      <ErpNav />

      {/* 액션 버튼 */}
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setShowSidebar(!showSidebar)}
          className={`px-3 py-2 text-sm text-gray-600 ${BG_COLOR.card} border rounded-lg ${BG_COLOR.hoverLighter} transition hidden lg:flex items-center gap-1`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
          {showSidebar ? '사이드바 숨기기' : '사이드바 보기'}
        </button>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center gap-1"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          새 작업
        </button>
      </div>

      {/* Stats */}
      <DashboardStats />

      {/* Main Content */}
      <div className={`grid gap-6 ${showSidebar ? 'lg:grid-cols-[1fr,300px]' : ''}`}>
        {/* Kanban Board */}
        <div className="min-w-0">
          <KanbanBoard />
        </div>

        {/* Sidebar */}
        {showSidebar && (
          <div className="space-y-4 hidden lg:block">
            <WorkerStats />
            <MachineStats />
            <RecentCompleted />
          </div>
        )}
      </div>

      {/* Create Task Modal */}
      {showCreateModal && <CreateTaskModal onClose={() => setShowCreateModal(false)} />}
    </div>
  );
}

function CreateTaskModal({ onClose }: { onClose: () => void }) {
  const createMutation = useCreateTaskMutation();
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    taskType: '' as TaskType | '',
    priority: 'normal' as TaskPriority,
    machineId: '',
    assignedTo: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await createMutation.mutateAsync({
        title: formData.title,
        description: formData.description || undefined,
        taskType: formData.taskType || undefined,
        priority: formData.priority,
        machineId: formData.machineId || undefined,
        assignedTo: formData.assignedTo || undefined,
      });
      onClose();
    } catch (error) {
      log.error('Failed to create task:', error);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div className={`${BG_COLOR.card} rounded-lg shadow-xl w-full max-w-md`}>
        <div className={`flex items-center justify-between p-4 border-b ${BORDER_COLOR.default}`}>
          <h2 className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>새 작업 등록</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
              작업명 *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className={`w-full px-3 py-2 rounded-lg ${BORDER_COLOR.medium} ${BG_COLOR.whiteDark}`}
              required
              autoFocus
            />
          </div>

          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>설명</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className={`w-full px-3 py-2 rounded-lg ${BORDER_COLOR.medium} ${BG_COLOR.whiteDark}`}
            />
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
                작업 유형
              </label>
              <select
                value={formData.taskType}
                onChange={(e) => setFormData({ ...formData, taskType: e.target.value as TaskType })}
                className={`w-full px-3 py-2 rounded-lg ${BORDER_COLOR.medium} ${BG_COLOR.whiteDark}`}
              >
                <option value="">선택안함</option>
                <option value="drawing">도면작업</option>
                <option value="sample">샘플제작</option>
                <option value="laser">레이저가공</option>
                <option value="cutting">칼 작업</option>
                <option value="creasing">오시작업</option>
                <option value="delivery">납품</option>
              </select>
            </div>

            <div className="flex-1">
              <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
                우선순위
              </label>
              <select
                value={formData.priority}
                onChange={(e) =>
                  setFormData({ ...formData, priority: e.target.value as TaskPriority })
                }
                className={`w-full px-3 py-2 rounded-lg ${BORDER_COLOR.medium} ${BG_COLOR.whiteDark}`}
              >
                <option value="low">낮음</option>
                <option value="normal">보통</option>
                <option value="urgent">긴급</option>
              </select>
            </div>
          </div>

          <div
            className={`flex items-center justify-end gap-2 pt-4 border-t ${BORDER_COLOR.default}`}
          >
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending || !formData.title}
              className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
            >
              {createMutation.isPending ? '등록중...' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
