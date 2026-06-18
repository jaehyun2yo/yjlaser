'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type {
  Task,
  TaskListResponse,
  KanbanResponse,
  DashboardResponse,
  MachineListResponse,
  WorkerListResponse,
  AccessLogListResponse,
  AccessLogStats,
  TaskStatus,
  TaskPriority,
  TaskType,
} from './types';
import { NESTJS_CLIENT_API_BASE } from '@/lib/api/api-base';

const API_BASE = NESTJS_CLIENT_API_BASE;

interface TaskFilters {
  status?: TaskStatus;
  priority?: TaskPriority;
  taskType?: TaskType;
  assignedTo?: string;
  page?: number;
  limit?: number;
}

function getCsrfToken(): string | undefined {
  const match = document.cookie.match(/(?:^|;\s*)csrf-token=([^;]*)/);
  return match?.[1];
}

async function fetchWithAuth(url: string, options: RequestInit = {}) {
  const csrfToken = getCsrfToken();
  const response = await fetch(url, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken && { 'x-csrf-token': csrfToken }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Request failed' }));
    throw new Error(error.message || 'Request failed');
  }

  return response.json();
}

// ============================================================================
// Task Hooks
// ============================================================================

export function useTasksQuery(filters: TaskFilters = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.taskType) params.set('taskType', filters.taskType);
  if (filters.assignedTo) params.set('assignedTo', filters.assignedTo);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  return useQuery<TaskListResponse>({
    queryKey: queryKeys.erp.tasks.list(filters),
    queryFn: () => fetchWithAuth(`${API_BASE}/erp/tasks?${params.toString()}`),
    staleTime: 60000,
  });
}

export function useKanbanQuery(filters: Omit<TaskFilters, 'status' | 'page' | 'limit'> = {}) {
  const params = new URLSearchParams();
  if (filters.priority) params.set('priority', filters.priority);
  if (filters.taskType) params.set('taskType', filters.taskType);
  if (filters.assignedTo) params.set('assignedTo', filters.assignedTo);

  return useQuery<KanbanResponse>({
    queryKey: queryKeys.erp.tasks.kanban(filters),
    queryFn: () => fetchWithAuth(`${API_BASE}/erp/tasks/kanban?${params.toString()}`),
    staleTime: 60000,
  });
}

export function useTodayTasksQuery(workerName?: string) {
  const params = new URLSearchParams();
  if (workerName) params.set('workerName', workerName);

  return useQuery<Task[]>({
    queryKey: queryKeys.erp.tasks.today(workerName),
    queryFn: () => fetchWithAuth(`${API_BASE}/erp/tasks/today?${params.toString()}`),
    staleTime: 60000,
  });
}

export function useTaskQuery(id: string | null) {
  return useQuery<Task>({
    queryKey: queryKeys.erp.tasks.detail(id || ''),
    queryFn: () => fetchWithAuth(`${API_BASE}/erp/tasks/${id}`),
    enabled: !!id,
    staleTime: 60000,
  });
}

export function useCreateTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      title: string;
      description?: string;
      contactId?: number;
      taskType?: TaskType;
      priority?: TaskPriority;
      machineId?: string;
      assignedTo?: string;
      estimatedDuration?: number;
      memo?: string;
    }) =>
      fetchWithAuth(`${API_BASE}/erp/tasks`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erp.tasks.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.erp.dashboard.all() });
    },
  });
}

export function useUpdateTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      fetchWithAuth(`${API_BASE}/erp/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erp.tasks.all() });
    },
  });
}

export function useUpdateTaskStatusMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      status,
      workerName,
    }: {
      id: string;
      status: TaskStatus;
      workerName?: string;
    }) =>
      fetchWithAuth(`${API_BASE}/erp/tasks/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status, workerName }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erp.tasks.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.erp.dashboard.all() });
    },
  });
}

export function useReorderTasksMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (tasks: Array<{ id: string; sortOrder: number; status?: TaskStatus }>) =>
      fetchWithAuth(`${API_BASE}/erp/tasks/batch/reorder`, {
        method: 'PATCH',
        body: JSON.stringify({ tasks }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erp.tasks.all() });
    },
  });
}

export function useDeleteTaskMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      fetchWithAuth(`${API_BASE}/erp/tasks/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erp.tasks.all() });
      queryClient.invalidateQueries({ queryKey: queryKeys.erp.dashboard.all() });
    },
  });
}

// ============================================================================
// Dashboard Hooks
// ============================================================================

export function useDashboardQuery() {
  return useQuery<DashboardResponse>({
    queryKey: queryKeys.erp.dashboard.stats(),
    queryFn: () => fetchWithAuth(`${API_BASE}/erp/dashboard`),
    staleTime: 60000,
    refetchInterval: 60000, // Refresh every minute
  });
}

// ============================================================================
// Machine Hooks
// ============================================================================

export function useMachinesQuery(activeOnly = false) {
  const params = new URLSearchParams();
  if (activeOnly) params.set('activeOnly', 'true');

  return useQuery<MachineListResponse>({
    queryKey: queryKeys.erp.machines.list(activeOnly),
    queryFn: () => fetchWithAuth(`${API_BASE}/erp/machines?${params.toString()}`),
    staleTime: 60000,
  });
}

export function useCreateMachineMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: { name: string; type: string; description?: string }) =>
      fetchWithAuth(`${API_BASE}/erp/machines`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erp.machines.all() });
    },
  });
}

export function useUpdateMachineMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      fetchWithAuth(`${API_BASE}/erp/machines/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erp.machines.all() });
    },
  });
}

export function useDeleteMachineMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      fetchWithAuth(`${API_BASE}/erp/machines/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erp.machines.all() });
    },
  });
}

// ============================================================================
// Worker Hooks
// ============================================================================

export function useWorkersQuery(activeOnly = false) {
  const params = new URLSearchParams();
  if (activeOnly) params.set('activeOnly', 'true');

  return useQuery<WorkerListResponse>({
    queryKey: queryKeys.erp.workers.list(activeOnly),
    queryFn: () => fetchWithAuth(`${API_BASE}/erp/workers?${params.toString()}`),
    staleTime: 60000,
  });
}

export function useCreateWorkerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: {
      name: string;
      pin: string;
      role?: string;
      workerType?: string;
      allowedIps?: string[];
    }) =>
      fetchWithAuth(`${API_BASE}/erp/workers`, {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erp.workers.all() });
    },
  });
}

export function useUpdateWorkerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, ...data }: { id: string; [key: string]: unknown }) =>
      fetchWithAuth(`${API_BASE}/erp/workers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erp.workers.all() });
    },
  });
}

export function useDeleteWorkerMutation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) =>
      fetchWithAuth(`${API_BASE}/erp/workers/${id}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.erp.workers.all() });
    },
  });
}

// ============================================================================
// Access Log Hooks
// ============================================================================

interface AccessLogFilters {
  workerId?: string;
  ipAddress?: string;
  action?: string;
  page?: number;
  limit?: number;
}

export function useAccessLogsQuery(filters: AccessLogFilters = {}) {
  const params = new URLSearchParams();
  if (filters.workerId) params.set('workerId', filters.workerId);
  if (filters.ipAddress) params.set('ipAddress', filters.ipAddress);
  if (filters.action) params.set('action', filters.action);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.limit) params.set('limit', String(filters.limit));

  return useQuery<AccessLogListResponse>({
    queryKey: queryKeys.erp.accessLogs.list(filters),
    queryFn: () => fetchWithAuth(`${API_BASE}/erp/access-logs?${params.toString()}`),
    staleTime: 30000,
  });
}

export function useAccessLogStatsQuery() {
  return useQuery<AccessLogStats>({
    queryKey: queryKeys.erp.accessLogs.stats(),
    queryFn: () => fetchWithAuth(`${API_BASE}/erp/access-logs/stats`),
    staleTime: 30000,
    refetchInterval: 60000,
  });
}
