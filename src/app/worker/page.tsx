import { redirect } from 'next/navigation';
import { getErpWorkerSession } from '@/lib/auth/erp-session';

export default async function WorkerMobileIndexPage() {
  const session = await getErpWorkerSession();

  if (session) {
    redirect('/worker/dashboard');
  } else {
    redirect('/worker/login');
  }
}
