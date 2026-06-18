'use client';

import { BG_COLOR, BORDER_COLOR } from '@/lib/styles';
import { Task, TaskStatus, TASK_STATUS_INFO } from '@/app/(admin)/admin/erp/_lib/types';
import { TaskCard, TaskCardSkeleton } from './TaskCard';

interface KanbanColumnProps {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  count: number;
  isLoading?: boolean;
  onTaskEdit?: (task: Task) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
}

export function KanbanColumn({
  status,
  title,
  tasks,
  count,
  isLoading,
  onTaskEdit,
  onStatusChange,
}: KanbanColumnProps) {
  const statusInfo = TASK_STATUS_INFO[status];

  return (
    <div
      className={`
        flex flex-col min-h-[500px] ${BG_COLOR.gray}/50 rounded-lg
      `}
    >
      {/* Column Header */}
      <div className={`
        sticky top-0 z-10 px-3 py-2 rounded-t-lg
        ${statusInfo.bgColor} border-b ${BORDER_COLOR.default}
      `}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h3 className={`font-semibold text-sm ${statusInfo.color}`}>
              {title}
            </h3>
            <span className={`
              text-xs px-2 py-0.5 rounded-full
              ${status === 'pending' ? 'bg-gray-200 text-gray-700' : ''}
              ${status === 'in_progress' ? 'bg-blue-200 text-blue-700' : ''}
              ${status === 'completed' ? 'bg-green-200 text-green-700' : ''}
            `}>
              {count}
            </span>
          </div>
          {status === 'pending' && (
            <button
              className="p-1 text-gray-400 hover:text-gray-600 rounded"
              title="작업 추가"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Column Content */}
      <div className="flex-1 p-2 space-y-2 overflow-y-auto">
        {isLoading ? (
          // Loading skeletons
          <>
            <TaskCardSkeleton />
            <TaskCardSkeleton />
            <TaskCardSkeleton />
          </>
        ) : (
          tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              onEdit={onTaskEdit}
              onStatusChange={onStatusChange}
            />
          ))
        )}

        {!isLoading && tasks.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 text-gray-400">
            <svg className="w-8 h-8 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
            </svg>
            <p className="text-sm">작업이 없습니다</p>
          </div>
        )}
      </div>
    </div>
  );
}
