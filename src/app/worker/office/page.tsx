import { redirect } from 'next/navigation';

export default function WorkerOfficeRedirect() {
  redirect('/worker/dashboard');
}
