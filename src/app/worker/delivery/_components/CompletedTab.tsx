'use client';

import { WorkerDeliveredList } from '@/app/worker/delivered/_components/WorkerDeliveredList';

interface CompletedTabProps {
  highlightContactId?: string | null;
  initialSearch?: string;
}

export default function CompletedTab({ highlightContactId, initialSearch }: CompletedTabProps) {
  return (
    <WorkerDeliveredList
      highlightContactId={highlightContactId}
      initialSearch={initialSearch}
      searchAllDates={!!initialSearch}
    />
  );
}
