import { WorkerRouteGuard } from '@/app/worker/_components/WorkerRouteGuard';

export default function WorkerDashboardLayout({ children }: { children: React.ReactNode }) {
  return <WorkerRouteGuard>{children}</WorkerRouteGuard>;
}
