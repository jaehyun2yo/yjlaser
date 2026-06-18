/**
 * useTimelineRealtime 테스트 (Phase 4: frontend-timeline-realtime)
 * - expanded=true/false 에 따른 소켓 구독 on/off
 * - payload.contactId 매칭에 따른 refetchQueries 분기
 */

import React from 'react';
import { renderHook } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useTimelineRealtime } from '@/app/worker/_components/useTimelineRealtime';
import { queryKeys } from '@/lib/react-query/queryKeys';

// useSocketNamespace 를 mock 하여 events / enabled 를 캡처
const capturedCalls: Array<{
  namespace: string;
  enabled: boolean | undefined;
  events: Record<string, (data: Record<string, unknown>) => void>;
}> = [];
const unsubscribeSpy = jest.fn();

jest.mock('@/lib/socket/useSocketNamespace', () => ({
  useSocketNamespace: ({
    namespace,
    enabled,
    events,
  }: {
    namespace: string;
    enabled?: boolean;
    events?: Record<string, (data: Record<string, unknown>) => void>;
  }) => {
    capturedCalls.push({ namespace, enabled, events: events ?? {} });
    React.useEffect(() => {
      if (!enabled) return;
      return () => unsubscribeSpy();
    }, [enabled]);
    return { socket: null, status: 'connected' };
  },
}));

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TimelineRealtimeWrapper';
  return { Wrapper, client };
}

describe('useTimelineRealtime', () => {
  beforeEach(() => {
    capturedCalls.length = 0;
    unsubscribeSpy.mockClear();
  });

  test('T4: expanded=true 마운트 시 contact:drawing_revision_added 이벤트가 등록된다', () => {
    const { Wrapper } = makeWrapper();

    renderHook(() => useTimelineRealtime('c1', true), { wrapper: Wrapper });

    const lastCall = capturedCalls[capturedCalls.length - 1];
    expect(lastCall.namespace).toBe('contacts');
    expect(lastCall.enabled).toBe(true);
    expect(Object.keys(lastCall.events)).toContain('contact:drawing_revision_added');
  });

  test('T5: expanded=false 이면 enabled=false 로 전달되고 unmount 시 cleanup 이 실행된다', () => {
    const { Wrapper } = makeWrapper();

    // expanded=false 마운트
    const { rerender, unmount } = renderHook(
      ({ expanded }: { expanded: boolean }) => useTimelineRealtime('c1', expanded),
      {
        wrapper: Wrapper,
        initialProps: { expanded: false },
      }
    );

    const disabledCall = capturedCalls[capturedCalls.length - 1];
    expect(disabledCall.enabled).toBe(false);
    expect(unsubscribeSpy).not.toHaveBeenCalled();

    // expanded=true 로 전환 → cleanup 등록
    rerender({ expanded: true });
    const enabledCall = capturedCalls[capturedCalls.length - 1];
    expect(enabledCall.enabled).toBe(true);

    // unmount 시 cleanup 호출 (리스너 해제)
    unmount();
    expect(unsubscribeSpy).toHaveBeenCalledTimes(1);
  });

  test('T6: payload.contactId 가 일치할 때만 invalidateQueries 가 호출된다 (refetchType: all)', () => {
    const { Wrapper, client } = makeWrapper();
    const invalidateSpy = jest.spyOn(client, 'invalidateQueries');

    renderHook(() => useTimelineRealtime('c1', true), { wrapper: Wrapper });

    const handler =
      capturedCalls[capturedCalls.length - 1].events['contact:drawing_revision_added'];
    expect(handler).toBeDefined();

    // 불일치: 호출되지 않음
    handler({ contactId: 'c-other', revisionId: 'r1', version: 1 });
    expect(invalidateSpy).not.toHaveBeenCalled();

    // 일치: 호출됨
    handler({ contactId: 'c1', revisionId: 'r2', version: 2 });
    expect(invalidateSpy).toHaveBeenCalledTimes(1);

    const [arg] = invalidateSpy.mock.calls[0];
    expect(JSON.stringify((arg as { queryKey: unknown }).queryKey)).toBe(
      JSON.stringify(queryKeys.contacts.timeline('c1'))
    );
    expect((arg as { refetchType?: string }).refetchType).toBe('all');
  });
});
