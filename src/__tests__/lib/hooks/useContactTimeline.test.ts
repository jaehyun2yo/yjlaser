import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useContactTimeline } from '@/lib/hooks/useContactTimeline';
import { getContactTimeline } from '@/app/actions/contacts';

jest.mock('@/app/actions/contacts', () => ({
  getContactTimeline: jest.fn(),
}));

const mockedGetTimeline = getContactTimeline as jest.MockedFunction<typeof getContactTimeline>;

function makeWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
    },
  });
  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
}

describe('useContactTimeline', () => {
  beforeEach(() => {
    mockedGetTimeline.mockReset();
  });

  test('UUID 문자열 id를 action에 그대로 전달한다 (NaN 변환 없음)', async () => {
    mockedGetTimeline.mockResolvedValue({ success: true, data: [] });

    const uuid = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    renderHook(() => useContactTimeline(uuid, { externalExpanded: true }), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => {
      expect(mockedGetTimeline).toHaveBeenCalledWith(uuid);
    });

    // NaN 버그 회귀 방지: 전달된 첫 인자가 "NaN" 문자열도 아니고 number NaN 도 아니어야 한다
    const callArg = mockedGetTimeline.mock.calls[0]?.[0];
    expect(callArg).toBe(uuid);
    expect(typeof callArg).toBe('string');
    expect(Number.isNaN(callArg as unknown as number)).toBe(false);
  });

  test('externalExpanded=false 면 action을 호출하지 않는다 (enabled 계약)', async () => {
    mockedGetTimeline.mockResolvedValue({ success: true, data: [] });

    renderHook(
      () =>
        useContactTimeline('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', {
          externalExpanded: false,
        }),
      { wrapper: makeWrapper() }
    );

    // React Query 가 enabled=false 일 때 queryFn 을 호출하지 않는지 대기 후 검증
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockedGetTimeline).not.toHaveBeenCalled();
  });

  test('T1: 타임라인 쿼리에 staleTime 30_000 이 설정된다', async () => {
    mockedGetTimeline.mockResolvedValue({ success: true, data: [] });

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, gcTime: 0 } },
    });
    const Wrapper = ({ children }: { children: React.ReactNode }) =>
      React.createElement(QueryClientProvider, { client }, children);
    Wrapper.displayName = 'StaleTimeWrapper';

    const contactId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

    renderHook(() => useContactTimeline(contactId, { externalExpanded: true }), {
      wrapper: Wrapper,
    });

    await waitFor(() => {
      expect(mockedGetTimeline).toHaveBeenCalledWith(contactId);
    });

    const queries = client.getQueryCache().getAll();
    const timelineQuery = queries.find((q) => JSON.stringify(q.queryKey).includes('timeline'));
    expect(timelineQuery).toBeDefined();
    expect(timelineQuery?.options.staleTime).toBe(30_000);
  });
});
