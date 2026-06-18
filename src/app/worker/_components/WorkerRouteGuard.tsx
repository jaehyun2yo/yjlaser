import { redirect } from 'next/navigation';
import { getErpWorkerSession } from '@/lib/auth/erp-session';

export async function WorkerRouteGuard({ children }: { children: React.ReactNode }) {
  const session = await getErpWorkerSession();
  if (!session) {
    redirect('/worker/login');
  }

  return <>{children}</>;
}
