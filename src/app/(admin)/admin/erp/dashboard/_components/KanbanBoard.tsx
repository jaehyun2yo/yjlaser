'use client';

import { useState, useCallback } from 'react';
import { Task, TaskStatus, KANBAN_COLUMNS } from '@/app/(admin)/admin/erp/_lib/types';
import { useKanbanQuery, useUpdateTaskStatusMutation } from '@/app/(admin)/admin/erp/_lib/hooks';
import { KanbanColumn } from './KanbanColumn';
import { TaskModal } from './TaskModal';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('KanbanBoard');

interface KanbanBoardProps {
  onTaskEdit?: (task: Task) => void;
}

export function KanbanBoard({ onTaskEdit }: KanbanBoardProps) {
  const { data, isLoading, error } = useKanbanQuery();
  const statusMutation = useUpdateTaskStatusMutation();

  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Build columns from server data
  const columns = data?.columns.reduce(
    (acc, col) => {
      acc[col.status] = col.tasks;
      return acc;
    },
    {} as Record<TaskStatus, Task[]>
  ) ?? {
    pending: [],
    in_progress: [],
    completed: [],
    cancelled: [],
  };

  const handleTaskEdit = useCallback((task: Task) => {
    setEditingTask(task);
  }, []);

  const handleStatusChange = useCallback(
    async (taskId: string, newStatus: TaskStatus) => {
      try {
        await statusMutation.mutateAsync({
          id: taskId,
          status: newStatus,
        });
      } catch (error) {
        log.error('Failed to update task status:', error);
      }
    },
    [statusMutation]
  );

  if (error) {
    return (
      <div className="flex items-center justify-center h-96 text-red-500">
        <div className="text-center">
          <p className="text-lg font-medium">데이터를 불러오는데 실패했습니다</p>
          <p className="text-sm mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {KANBAN_COLUMNS.map((col) => (
          <KanbanColumn
            key={col.status}
            status={col.status}
            title={col.title}
            tasks={columns[col.status] || []}
            count={columns[col.status]?.length || 0}
            isLoading={isLoading}
            onTaskEdit={handleTaskEdit}
            onStatusChange={handleStatusChange}
          />
        ))}
      </div>

      {editingTask && <TaskModal task={editingTask} onClose={() => setEditingTask(null)} />}
    </>
  );
}
