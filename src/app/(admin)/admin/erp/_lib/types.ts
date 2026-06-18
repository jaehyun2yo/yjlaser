// ERP Types

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'urgent' | 'normal' | 'low';
export type TaskType = 'drawing' | 'sample' | 'laser' | 'cutting' | 'creasing' | 'delivery';

export interface Task {
  id: string;
  contact_id: string | null;
  title: string;
  description: string | null;
  task_type: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  machine_id: string | null;
  machine_name: string | null;
  assigned_to: string | null;
  started_at: string | null;
  completed_at: string | null;
  estimated_duration: number | null;
  actual_duration: number | null;
  sort_order: number;
  memo: string | null;
  created_at: string;
  updated_at: string;
  contact?: {
    product_name: string | null;
    company_name: string | null;
    due_date: string | null;
  } | null;
}

export interface TaskListResponse {
  tasks: Task[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface KanbanColumn {
  status: TaskStatus;
  title: string;
  tasks: Task[];
  count: number;
}

export interface KanbanResponse {
  columns: KanbanColumn[];
  stats: {
    total: number;
    pending: number;
    in_progress: number;
    completed: number;
    urgent: number;
  };
}

export interface Machine {
  id: string;
  name: string;
  type: string;
  status: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface MachineListResponse {
  machines: Machine[];
  total: number;
}

export interface Worker {
  id: string;
  name: string;
  role: string;
  worker_type: string | null;
  is_active: boolean;
  allowed_ips: string[];
  last_login_at: string | null;
  created_at: string;
}

export interface AccessLog {
  id: string;
  worker_id: string | null;
  worker_name: string | null;
  ip_address: string;
  user_agent: string | null;
  action: string;
  success: boolean;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AccessLogListResponse {
  logs: AccessLog[];
  total: number;
  page: number;
  limit: number;
  hasMore: boolean;
}

export interface AccessLogStats {
  total_logins: number;
  successful_logins: number;
  failed_logins: number;
  blocked_attempts: number;
  unique_ips: number;
  recent_blocked_ips: string[];
}

export interface WorkerListResponse {
  workers: Worker[];
  total: number;
}

export interface DashboardStats {
  total_tasks: number;
  pending_tasks: number;
  in_progress_tasks: number;
  completed_today: number;
  urgent_tasks: number;
  overdue_contacts: number;
}

export interface MachineStatus {
  id: string;
  name: string;
  type: string;
  status: string;
  active_tasks: number;
}

export interface WorkerStatus {
  name: string;
  active_tasks: number;
  completed_today: number;
}

export interface DashboardResponse {
  stats: DashboardStats;
  machines: MachineStatus[];
  workers: WorkerStatus[];
  recent_completed: Array<{
    id: string;
    title: string;
    completed_at: string;
    actual_duration: number | null;
    assigned_to: string | null;
  }>;
}

// Task type labels and colors
export const TASK_TYPE_INFO: Record<TaskType, { label: string; color: string; bgColor: string }> = {
  drawing: { label: '도면작업', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  sample: { label: '샘플제작', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  laser: { label: '레이저가공', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  cutting: { label: '칼 작업', color: 'text-yellow-600', bgColor: 'bg-yellow-100' },
  creasing: { label: '오시작업', color: 'text-teal-600', bgColor: 'bg-teal-100' },
  delivery: { label: '납품', color: 'text-green-600', bgColor: 'bg-green-100' },
};

export const TASK_PRIORITY_INFO: Record<
  TaskPriority,
  { label: string; color: string; bgColor: string }
> = {
  urgent: { label: '긴급', color: 'text-red-600', bgColor: 'bg-red-100' },
  normal: { label: '보통', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  low: { label: '낮음', color: 'text-gray-400', bgColor: 'bg-gray-50' },
};

export const TASK_STATUS_INFO: Record<
  TaskStatus,
  { label: string; color: string; bgColor: string }
> = {
  pending: { label: '대기', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  in_progress: { label: '진행중', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  completed: { label: '완료', color: 'text-green-600', bgColor: 'bg-green-100' },
  cancelled: { label: '취소', color: 'text-red-600', bgColor: 'bg-red-100' },
};

export const KANBAN_COLUMNS: { status: TaskStatus; title: string }[] = [
  { status: 'pending', title: '대기' },
  { status: 'in_progress', title: '진행중' },
  { status: 'completed', title: '완료' },
];
