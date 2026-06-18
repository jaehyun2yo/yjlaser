import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

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

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get ERP dashboard statistics
   */
  async getDashboardStats(): Promise<DashboardResponse> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Run all queries in parallel (including completedToday to avoid a separate round-trip)
    const [
      taskStats,
      overdueContacts,
      machines,
      workerStats,
      recentCompleted,
      completedToday,
      workerCompletedToday,
    ] = await this.prisma.executeWithRetry(
      () =>
        Promise.all([
          // Task statistics
          this.prisma.task.groupBy({
            by: ['status', 'priority'],
            _count: true,
            where: { status: { not: 'cancelled' } },
          }),

          // Overdue contacts count (접수 후 7일 초과 + 미완료)
          this.prisma.contact.count({
            where: {
              createdAt: { lt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
              status: { notIn: ['completed', 'deleting'] },
              deletedAt: null,
            },
          }),

          // Machine statuses with active task count
          this.prisma.machine.findMany({
            where: { status: 'active' },
            include: {
              tasks: {
                where: { status: 'in_progress' },
                select: { id: true },
              },
            },
          }),

          // Worker statistics
          this.prisma.task.groupBy({
            by: ['assignedTo'],
            _count: true,
            where: {
              assignedTo: { not: null },
              status: { in: ['pending', 'in_progress'] },
            },
          }),

          // Recent completed tasks
          this.prisma.task.findMany({
            where: {
              status: 'completed',
              completedAt: { gte: today },
            },
            orderBy: { completedAt: 'desc' },
            take: 10,
            select: {
              id: true,
              title: true,
              completedAt: true,
              actualDuration: true,
              assignedTo: true,
            },
          }),

          // Total completed today count (separate from recentCompleted which is capped at 10)
          this.prisma.task.count({
            where: {
              status: 'completed',
              completedAt: { gte: today },
            },
          }),

          // Per-worker completed today (for worker status breakdown)
          this.prisma.task.groupBy({
            by: ['assignedTo'],
            _count: true,
            where: {
              assignedTo: { not: null },
              status: 'completed',
              completedAt: { gte: today },
            },
          }),
        ]),
      { operationName: 'getDashboardStats' }
    );

    // Calculate task stats
    let total = 0;
    let pending = 0;
    let inProgress = 0;
    let urgent = 0;

    for (const stat of taskStats) {
      total += stat._count;
      if (stat.status === 'pending') pending += stat._count;
      if (stat.status === 'in_progress') inProgress += stat._count;
      if (stat.priority === 'urgent' && stat.status !== 'completed') {
        urgent += stat._count;
      }
    }

    const completedMap = new Map(workerCompletedToday.map((w) => [w.assignedTo, w._count]));

    const workers: WorkerStatus[] = workerStats
      .filter((w) => w.assignedTo)
      .map((w) => ({
        name: w.assignedTo!,
        active_tasks: w._count,
        completed_today: completedMap.get(w.assignedTo) ?? 0,
      }));

    return {
      stats: {
        total_tasks: total,
        pending_tasks: pending,
        in_progress_tasks: inProgress,
        completed_today: completedToday,
        urgent_tasks: urgent,
        overdue_contacts: overdueContacts,
      },
      machines: machines.map((m) => ({
        id: m.id,
        name: m.name,
        type: m.type,
        status: m.status,
        active_tasks: m.tasks.length,
      })),
      workers,
      recent_completed: recentCompleted.map((t) => ({
        id: t.id,
        title: t.title,
        completed_at: t.completedAt?.toISOString() ?? '',
        actual_duration: t.actualDuration,
        assigned_to: t.assignedTo,
      })),
    };
  }
}
