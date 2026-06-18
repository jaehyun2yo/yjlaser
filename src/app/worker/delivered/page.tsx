import { redirect } from 'next/navigation';

export default function WorkerDeliveredPage() {
  redirect('/worker/delivery?tab=completed');
}
