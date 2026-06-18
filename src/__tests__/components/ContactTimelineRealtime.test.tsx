import React from 'react';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ContactTimelineRealtime } from '@/app/(admin)/admin/contacts/_components/ContactTimelineRealtime';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { TimelineItem } from '@/lib/types/contact';

// Socket 훅 mock: 등록된 events 맵을 캡처해 테스트에서 직접 발화
const capturedEvents: { current: Record<string, (data: Record<string, unknown>) => void> } = {
  current: {},
};
const unsubscribeSpy = jest.fn();

jest.mock('@/lib/socket/useSocketNamespace', () => ({
  useSocketNamespace: ({
    events,
  }: {
    namespace: string;
    events: Record<string, (data: Record<string, unknown>) => void>;
  }) => {
    capturedEvents.current = events;
    // effect cleanup mock
    React.useEffect(() => {
      return () => unsubscribeSpy();
    }, []);
    return { socket: null, status: 'connected' };
  },
}));

// useContactTimeline 은 React Query 캐시를 조회만 하도록 mock — initialData 주입 후 invalidate 호출만 관찰
jest.mock('@/app/actions/contacts', () => ({
  getContactTimeline: jest.fn().mockResolvedValue({ success: true, data: [] }),
}));

function makeTimeline(): TimelineItem[] {
  return [
    {
      id: 'status-1',
      kind: 'status_change',
      createdAt: '2026-04-15T10:30:00.000Z',
      actorType: 'admin',
      actorName: '관리자',
      payload: {
        changeType: 'status',
        fromValue: 'received',
        toValue: 'drawing',
      },
    },
  ];
}

function renderWithClient(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  const invalidateSpy = jest.spyOn(client, 'invalidateQueries');
  const utils = render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
  return { ...utils, client, invalidateSpy };
}

describe('ContactTimelineRealtime', () => {
  beforeEach(() => {
    capturedEvents.current = {};
    unsubscribeSpy.mockClear();
  });

  test('initialEntries 로 전달된 데이터가 초기 렌더에 표시된다', () => {
    renderWithClient(
      <ContactTimelineRealtime contactId="contact-1" initialEntries={makeTimeline()} />
    );
    expect(screen.getByText('도면작업')).toBeInTheDocument();
  });

  test('8개 이벤트가 모두 등록된다', () => {
    renderWithClient(
      <ContactTimelineRealtime contactId="contact-1" initialEntries={makeTimeline()} />
    );
    const keys = Object.keys(capturedEvents.current).sort();
    expect(keys).toEqual(
      [
        'contact:drawing_revision_added',
        'contact:updated',
        'contact:status_changed',
        'contact:process_stage_changed',
        'contact:group-stage-advanced',
        'contact:split',
        'folder:renamed',
        'file:moved',
      ].sort()
    );
  });

  test('각 이벤트 발행 시 자기 contactId 이면 timeline 쿼리가 무효화된다', () => {
    const { invalidateSpy } = renderWithClient(
      <ContactTimelineRealtime contactId="contact-1" initialEntries={makeTimeline()} />
    );

    const selfId = 'contact-1';
    const expectedKey = { queryKey: queryKeys.contacts.timeline(selfId) };

    // contactId 필드 계열
    capturedEvents.current['contact:drawing_revision_added']({ contactId: selfId });
    capturedEvents.current['folder:renamed']({ contactId: selfId });
    capturedEvents.current['file:moved']({ contactId: selfId });

    // id 필드 계열 (contact 전체 레코드)
    capturedEvents.current['contact:updated']({ id: selfId });
    capturedEvents.current['contact:status_changed']({ id: selfId });
    capturedEvents.current['contact:process_stage_changed']({ id: selfId });

    // parentId 필드 계열 (split / group-stage-advanced)
    capturedEvents.current['contact:group-stage-advanced']({ parentId: selfId });
    capturedEvents.current['contact:split']({ parentId: selfId });

    // 8번 모두 invalidate 가 호출됐어야 한다
    const matchingCalls = invalidateSpy.mock.calls.filter(
      ([arg]) =>
        JSON.stringify((arg as { queryKey: unknown }).queryKey) ===
        JSON.stringify(expectedKey.queryKey)
    );
    expect(matchingCalls.length).toBe(8);
  });

  test('다른 contactId payload 는 invalidate 를 호출하지 않는다', () => {
    const { invalidateSpy } = renderWithClient(
      <ContactTimelineRealtime contactId="contact-1" initialEntries={makeTimeline()} />
    );
    invalidateSpy.mockClear();

    const otherId = 'contact-999';

    capturedEvents.current['contact:drawing_revision_added']({ contactId: otherId });
    capturedEvents.current['folder:renamed']({ contactId: otherId });
    capturedEvents.current['file:moved']({ contactId: otherId });
    capturedEvents.current['contact:updated']({ id: otherId });
    capturedEvents.current['contact:status_changed']({ id: otherId });
    capturedEvents.current['contact:process_stage_changed']({ id: otherId });
    capturedEvents.current['contact:group-stage-advanced']({ parentId: otherId });
    capturedEvents.current['contact:split']({ parentId: otherId });

    const timelineKeyStr = JSON.stringify(queryKeys.contacts.timeline('contact-1'));
    const hits = invalidateSpy.mock.calls.filter(
      ([arg]) => JSON.stringify((arg as { queryKey: unknown }).queryKey) === timelineKeyStr
    );
    expect(hits.length).toBe(0);
  });

  test('언마운트 시 소켓 구독이 해제된다', () => {
    const { unmount } = renderWithClient(
      <ContactTimelineRealtime contactId="contact-1" initialEntries={makeTimeline()} />
    );
    expect(unsubscribeSpy).not.toHaveBeenCalled();
    unmount();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });
});
