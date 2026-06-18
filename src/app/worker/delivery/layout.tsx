import { WorkerRouteGuard } from '@/app/worker/_components/WorkerRouteGuard';

export default function WorkerDeliveryLayout({ children }: { children: React.ReactNode }) {
  return <WorkerRouteGuard>{children}</WorkerRouteGuard>;
}
