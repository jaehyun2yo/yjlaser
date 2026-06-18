import { redirect } from 'next/navigation';

export default function WorkerTasksRedirect() {
  redirect('/worker/dashboard');
}
