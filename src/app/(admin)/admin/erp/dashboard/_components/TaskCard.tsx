'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState } from 'react';
import {
  Task,
  TaskStatus,
  TASK_TYPE_INFO,
  TASK_PRIORITY_INFO,
  TASK_STATUS_INFO,
  TaskType,
  TaskPriority,
  KANBAN_COLUMNS,
} from '@/app/(admin)/admin/erp/_lib/types';
import { format } from 'date-fns';
import { ko } from 'date-fns/locale';

interface TaskCardProps {
  task: Task;
  isDragging?: boolean;
  onEdit?: (task: Task) => void;
  onStatusChange?: (taskId: string, status: TaskStatus) => void;
}

export function TaskCard({ task, isDragging, onEdit, onStatusChange }: TaskCardProps) {
  const [showStatusMenu, setShowStatusMenu] = useState(false);

  const priorityInfo = TASK_PRIORITY_INFO[task.priority as TaskPriority];
  const typeInfo = task.task_type ? TASK_TYPE_INFO[task.task_type as TaskType] : null;

  const handleStatusClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowStatusMenu(!showStatusMenu);
  };

  const handleStatusChange = (newStatus: TaskStatus) => {
    setShowStatusMenu(false);
    if (newStatus !== task.status) {
      onStatusChange?.(task.id, newStatus);
    }
  };

  return (
    <div
      className={`
        relative ${BG_COLOR.card} rounded-lg shadow-sm border
        ${task.priority === 'urgent' ? 'border-l-4 border-l-red-500' : BORDER_COLOR.default}
        p-3 cursor-pointer
        hover:shadow-md transition-shadow
        ${isDragging ? 'opacity-50' : ''}
      `}
      onClick={() => onEdit?.(task)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <h4 className={`font-medium text-sm ${TEXT_COLOR.primary} line-clamp-2`}>{task.title}</h4>
        <span
          className={`shrink-0 text-xs px-1.5 py-0.5 rounded ${priorityInfo.bgColor} ${priorityInfo.color}`}
        >
          {priorityInfo.label}
        </span>
      </div>

      {/* Task Type */}
      {typeInfo && (
        <div className="mb-2">
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${typeInfo.bgColor} ${typeInfo.color}`}
          >
            {typeInfo.label}
          </span>
        </div>
      )}

      {/* Contact Info */}
      {task.contact && (
        <div className={`text-xs ${TEXT_COLOR.secondary} space-y-0.5 mb-2`}>
          {task.contact.company_name && <p className="truncate">{task.contact.company_name}</p>}
          {task.contact.product_name && (
            <p className={`truncate ${TEXT_COLOR.secondary}`}>{task.contact.product_name}</p>
          )}
        </div>
      )}

      {/* Meta */}
      <div className={`flex items-center justify-between text-xs ${TEXT_COLOR.muted}`}>
        <div className="flex items-center gap-2">
          {task.assigned_to && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
              {task.assigned_to}
            </span>
          )}
          {task.machine_name && (
            <span className="flex items-center gap-1">
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z"
                />
              </svg>
              {task.machine_name}
            </span>
          )}
        </div>
        <span>{format(new Date(task.created_at), 'M/d', { locale: ko })}</span>
      </div>

      {/* Status Change Button */}
      <div
        className={`mt-2 pt-2 border-t ${BORDER_COLOR.lightMedium} flex items-center justify-between`}
      >
        <div className="relative">
          <button
            onClick={handleStatusClick}
            className={`text-xs px-2 py-1 rounded ${TASK_STATUS_INFO[task.status].bgColor} ${TASK_STATUS_INFO[task.status].color} hover:opacity-80 transition`}
          >
            {TASK_STATUS_INFO[task.status].label} ▼
          </button>

          {showStatusMenu && (
            <div
              className={`absolute bottom-full left-0 mb-1 ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg shadow-lg z-20 min-w-[100px]`}
            >
              {KANBAN_COLUMNS.map((col) => (
                <button
                  key={col.status}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleStatusChange(col.status);
                  }}
                  className={`block w-full text-left text-xs px-3 py-2 ${BG_COLOR.hoverMuted} transition
                    ${task.status === col.status ? BG_COLOR.light : ''}
                  `}
                >
                  {col.title}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Duration indicator for in-progress tasks */}
        {task.status === 'in_progress' && task.started_at && (
          <div className={`flex items-center gap-1 text-xs ${TEXT_COLOR.info}`}>
            <svg className="w-3 h-3 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                clipRule="evenodd"
              />
            </svg>
            <span>{format(new Date(task.started_at), 'HH:mm')} 시작</span>
          </div>
        )}

        {/* Completed indicator */}
        {task.status === 'completed' && task.completed_at && (
          <div className={`flex items-center gap-1 text-xs ${TEXT_COLOR.success}`}>
            <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                clipRule="evenodd"
              />
            </svg>
            <span>{format(new Date(task.completed_at), 'HH:mm')}</span>
            {task.actual_duration && (
              <span className="text-gray-400">({Math.round(task.actual_duration)}분)</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Skeleton for loading state
export function TaskCardSkeleton() {
  return (
    <div
      className={`${BG_COLOR.card} rounded-lg shadow-sm border ${BORDER_COLOR.default} p-3 animate-pulse`}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className={`h-4 ${BG_COLOR.medium} rounded w-3/4`} />
        <div className={`h-4 w-8 ${BG_COLOR.medium} rounded`} />
      </div>
      <div className={`h-5 w-16 ${BG_COLOR.medium} rounded-full mb-2`} />
      <div className="space-y-1 mb-2">
        <div className={`h-3 ${BG_COLOR.medium} rounded w-1/2`} />
        <div className={`h-3 ${BG_COLOR.medium} rounded w-2/3`} />
      </div>
      <div className="flex items-center justify-between">
        <div className={`h-3 w-16 ${BG_COLOR.medium} rounded`} />
        <div className={`h-3 w-8 ${BG_COLOR.medium} rounded`} />
      </div>
    </div>
  );
}
