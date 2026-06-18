import { WorkerRouteGuard } from '@/app/worker/_components/WorkerRouteGuard';

export default function WorkerTasksLayout({ children }: { children: React.ReactNode }) {
  return <WorkerRouteGuard>{children}</WorkerRouteGuard>;
}
