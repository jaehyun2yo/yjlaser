'use client';

/**
 * 상세 페이지(admin/contacts/[id], admin/work-management/[id]) 전용 타임라인 래퍼.
 * SSR 로 미리 조회한 데이터를 초기값으로 주입하고, 소켓 구독으로 8종 이벤트에 반응해
 * 자기 contactId 에 해당할 때만 React Query 캐시를 무효화한다.
 */
import { useQueryClient } from '@tanstack/react-query';
import { useSocketNamespace } from '@/lib/socket/useSocketNamespace';
import { useContactTimeline } from '@/lib/hooks/useContactTimeline';
import { queryKeys } from '@/lib/react-query/queryKeys';
import { ContactTimeline } from '@/components/ContactTimeline';
import type { TimelineItem } from '@/lib/types/contact';

interface ContactTimelineRealtimeProps {
  contactId: string;
  initialEntries: TimelineItem[];
  showActor?: boolean;
  compact?: boolean;
}

export function ContactTimelineRealtime({
  contactId,
  initialEntries,
  showActor = true,
  compact = false,
}: ContactTimelineRealtimeProps) {
  const queryClient = useQueryClient();

  const { entries } = useContactTimeline(contactId, {
    externalExpanded: true,
    initialData: initialEntries,
  });

  const invalidateSelf = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.contacts.timeline(contactId) });
  };

  const { status } = useSocketNamespace({
    namespace: 'contacts',
    events: {
      'contact:drawing_revision_added': (data) => {
        if ((data as { contactId?: string }).contactId !== contactId) return;
        invalidateSelf();
      },
      'contact:updated': (data) => {
        if (String((data as { id?: string | number }).id ?? '') !== String(contactId)) return;
        invalidateSelf();
      },
      'contact:status_changed': (data) => {
        if (String((data as { id?: string | number }).id ?? '') !== String(contactId)) return;
        invalidateSelf();
      },
      'contact:process_stage_changed': (data) => {
        if (String((data as { id?: string | number }).id ?? '') !== String(contactId)) return;
        invalidateSelf();
      },
      'contact:group-stage-advanced': (data) => {
        if ((data as { parentId?: string }).parentId !== contactId) return;
        invalidateSelf();
      },
      'contact:split': (data) => {
        if ((data as { parentId?: string }).parentId !== contactId) return;
        invalidateSelf();
      },
      'folder:renamed': (data) => {
        if ((data as { contactId?: string }).contactId !== contactId) return;
        invalidateSelf();
      },
      'file:moved': (data) => {
        if ((data as { contactId?: string }).contactId !== contactId) return;
        invalidateSelf();
      },
    },
  });

  return (
    <div data-realtime-status={status} data-testid="contact-timeline-realtime">
      <ContactTimeline entries={entries} showActor={showActor} compact={compact} />
    </div>
  );
}
