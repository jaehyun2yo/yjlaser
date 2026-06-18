import { WorkerRouteGuard } from '@/app/worker/_components/WorkerRouteGuard';

export default function WorkerOfficeLayout({ children }: { children: React.ReactNode }) {
  return <WorkerRouteGuard>{children}</WorkerRouteGuard>;
}
