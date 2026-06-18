'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState, useEffect } from 'react';
import {
  Task,
  TaskType,
  TaskPriority,
  TASK_TYPE_INFO,
  TASK_PRIORITY_INFO,
  TASK_STATUS_INFO,
} from '@/app/(admin)/admin/erp/_lib/types';
import {
  useUpdateTaskMutation,
  useDeleteTaskMutation,
  useMachinesQuery,
  useWorkersQuery,
} from '@/app/(admin)/admin/erp/_lib/hooks';
import { logger } from '@/lib/utils/logger';

const log = logger.createLogger('TaskModal');

interface TaskModalProps {
  task: Task | null;
  onClose: () => void;
}

export function TaskModal({ task, onClose }: TaskModalProps) {
  const updateMutation = useUpdateTaskMutation();
  const deleteMutation = useDeleteTaskMutation();
  const { data: machinesData } = useMachinesQuery(true);
  const { data: workersData } = useWorkersQuery(true);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    taskType: '' as TaskType | '',
    priority: 'normal' as TaskPriority,
    machineId: '',
    assignedTo: '',
    memo: '',
  });

  useEffect(() => {
    if (task) {
      setFormData({
        title: task.title,
        description: task.description || '',
        taskType: (task.task_type as TaskType) || '',
        priority: task.priority,
        machineId: task.machine_id || '',
        assignedTo: task.assigned_to || '',
        memo: task.memo || '',
      });
    }
  }, [task]);

  if (!task) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await updateMutation.mutateAsync({
        id: task.id,
        title: formData.title,
        description: formData.description || undefined,
        taskType: formData.taskType || undefined,
        priority: formData.priority,
        machineId: formData.machineId || undefined,
        assignedTo: formData.assignedTo || undefined,
        memo: formData.memo || undefined,
      });
      onClose();
    } catch (error) {
      log.error('Failed to update task:', error);
    }
  };

  const handleDelete = async () => {
    if (!confirm('이 작업을 삭제하시겠습니까?')) return;

    try {
      await deleteMutation.mutateAsync(task.id);
      onClose();
    } catch (error) {
      log.error('Failed to delete task:', error);
    }
  };

  const statusInfo = TASK_STATUS_INFO[task.status];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <div
        className={`${BG_COLOR.card} rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-4 border-b ${BORDER_COLOR.default}`}>
          <div className="flex items-center gap-2">
            <h2 className={`text-lg font-semibold ${TEXT_COLOR.primary}`}>작업 상세</h2>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.bgColor} ${statusInfo.color}`}
            >
              {statusInfo.label}
            </span>
          </div>
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

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-4 space-y-4">
          {/* Title */}
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
              작업명 *
            </label>
            <input
              type="text"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${BG_COLOR.whiteDark} ${BORDER_COLOR.default}`}
              required
            />
          </div>

          {/* Task Type */}
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
              작업 유형
            </label>
            <select
              value={formData.taskType}
              onChange={(e) => setFormData({ ...formData, taskType: e.target.value as TaskType })}
              className={`w-full px-3 py-2 border rounded-lg ${BG_COLOR.whiteDark} ${BORDER_COLOR.default}`}
            >
              <option value="">선택안함</option>
              {Object.entries(TASK_TYPE_INFO).map(([key, info]) => (
                <option key={key} value={key}>
                  {info.label}
                </option>
              ))}
            </select>
          </div>

          {/* Priority */}
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
              우선순위
            </label>
            <div className="flex gap-2">
              {Object.entries(TASK_PRIORITY_INFO).map(([key, info]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setFormData({ ...formData, priority: key as TaskPriority })}
                  className={`
                    flex-1 px-3 py-2 rounded-lg border text-sm font-medium transition
                    ${
                      formData.priority === key
                        ? `${info.bgColor} ${info.color} border-current`
                        : `${BORDER_COLOR.medium} ${BG_COLOR.hoverLighter}`
                    }
                  `}
                >
                  {info.label}
                </button>
              ))}
            </div>
          </div>

          {/* Machine */}
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>설비</label>
            <select
              value={formData.machineId}
              onChange={(e) => setFormData({ ...formData, machineId: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${BG_COLOR.whiteDark} ${BORDER_COLOR.default}`}
            >
              <option value="">선택안함</option>
              {machinesData?.machines.map((machine) => (
                <option key={machine.id} value={machine.id}>
                  {machine.name}
                </option>
              ))}
            </select>
          </div>

          {/* Assigned To */}
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>
              담당자
            </label>
            <select
              value={formData.assignedTo}
              onChange={(e) => setFormData({ ...formData, assignedTo: e.target.value })}
              className={`w-full px-3 py-2 border rounded-lg ${BG_COLOR.whiteDark} ${BORDER_COLOR.default}`}
            >
              <option value="">선택안함</option>
              {workersData?.workers.map((worker) => (
                <option key={worker.id} value={worker.name}>
                  {worker.name}
                </option>
              ))}
            </select>
          </div>

          {/* Description */}
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>설명</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={3}
              className={`w-full px-3 py-2 border rounded-lg ${BG_COLOR.whiteDark} ${BORDER_COLOR.default}`}
            />
          </div>

          {/* Memo */}
          <div>
            <label className={`block text-sm font-medium ${TEXT_COLOR.secondary} mb-1`}>메모</label>
            <textarea
              value={formData.memo}
              onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
              rows={2}
              className={`w-full px-3 py-2 border rounded-lg ${BG_COLOR.whiteDark} ${BORDER_COLOR.default}`}
            />
          </div>

          {/* Contact Info (read-only) */}
          {task.contact && (
            <div className={`p-3 ${BG_COLOR.grayHalf} rounded-lg`}>
              <p className={`text-xs ${TEXT_COLOR.secondary} mb-1`}>연결된 문의</p>
              <p className={`text-sm font-medium ${TEXT_COLOR.primary}`}>
                {task.contact.company_name}
              </p>
              {task.contact.product_name && (
                <p className={`text-sm ${TEXT_COLOR.secondary}`}>{task.contact.product_name}</p>
              )}
            </div>
          )}

          {/* Actions */}
          <div
            className={`flex items-center justify-between pt-4 border-t ${BORDER_COLOR.default}`}
          >
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleteMutation.isPending}
              className="px-4 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition"
            >
              삭제
            </button>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={updateMutation.isPending}
                className="px-4 py-2 text-sm bg-blue-600 text-white hover:bg-blue-700 rounded-lg transition disabled:opacity-50"
              >
                {updateMutation.isPending ? '저장중...' : '저장'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
