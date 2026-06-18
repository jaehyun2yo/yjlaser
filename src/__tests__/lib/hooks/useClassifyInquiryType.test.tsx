import React, { type ReactNode } from 'react';
import { renderHook, act, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useClassifyInquiryType } from '@/lib/hooks/useClassifyInquiryType';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { Contact } from '@/lib/types';

global.fetch = jest.fn();
const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'test-contact-001',
    inquiry_number: 'INQ-001',
    work_number: null,
    company_name: '테스트업체',
    name: '홍길동',
    position: null,
    phone: '010-0000-0000',
    email: 'test@example.com',
    contact_type: 'company',
    service_mold_request: null,
    service_delivery_brokerage: null,
    drawing_type: null,
    has_physical_sample: null,
    has_reference_photos: null,
    drawing_modification: null,
    box_shape: null,
    length: null,
    width: null,
    height: null,
    material: null,
    drawing_notes: null,
    sample_notes: null,
    receipt_method: null,
    delivery_proof_image: null,
    delivery_complete_image: null,
    visit_date: null,
    visit_time_slot: null,
    delivery_type: null,
    delivery_address: null,
    delivery_name: null,
    delivery_phone: null,
    delivery_method: null,
    delivery_company_name: null,
    delivery_company_phone: null,
    delivery_company_address: null,
    attachment_filename: null,
    attachment_url: null,
    drawing_file_url: null,
    drawing_file_name: null,
    reference_photos_urls: null,
    status: 'received',
    process_stage: 'received',
    created_at: '2026-04-17T09:00:00.000Z',
    updated_at: '2026-04-17T09:00:00.000Z',
    source: 'webhard',
    inquiry_type: null,
    ...overrides,
  } as Contact;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestWrapper';
  return { Wrapper, queryClient };
}

describe('useClassifyInquiryType', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy.mockClear();
  });

  it('classify("cutting_request") → PATCH /api/contacts/:id/inquiry-type', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    const contact = makeContact({ id: 'uuid-abc' });
    const { Wrapper } = createWrapper();
    const { result } = renderHook(() => useClassifyInquiryType(contact), { wrapper: Wrapper });

    await act(async () => {
      await result.current.classify('cutting_request');
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/contacts/uuid-abc/inquiry-type', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inquiry_type: 'cutting_request' }),
    });
  });

  it('성공 시 contacts.all + processBoard.all 쿼리를 invalidate', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    const contact = makeContact();
    const { Wrapper, queryClient } = createWrapper();
    const invalidateSpy = jest.spyOn(queryClient, 'invalidateQueries');

    const { result } = renderHook(() => useClassifyInquiryType(contact), { wrapper: Wrapper });

    await act(async () => {
      await result.current.classify('mold_request');
    });

    const invalidatedKeys = invalidateSpy.mock.calls.map((call) => call[0]?.queryKey);
    expect(invalidatedKeys).toEqual(
      expect.arrayContaining([queryKeys.contacts.all, queryKeys.processBoard.all])
    );
  });

  it('API 실패 시 이전 데이터로 rollback + alert 호출', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: '권한이 없습니다' }),
    });
    const contact = makeContact({ id: 'uuid-fail' });
    const { Wrapper, queryClient } = createWrapper();

    const initialPages = {
      pages: [{ contacts: [contact] }],
      pageParams: [undefined],
    };
    queryClient.setQueryData(queryKeys.contacts.lists(), initialPages);
    queryClient.setQueryData(queryKeys.processBoard.all, [contact]);

    const { result } = renderHook(() => useClassifyInquiryType(contact), { wrapper: Wrapper });

    await act(async () => {
      await result.current.classify('cutting_request');
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('권한이 없습니다');
    });

    const restoredBoard = queryClient.getQueryData(queryKeys.processBoard.all) as Contact[];
    expect(restoredBoard).toHaveLength(1);
    expect(restoredBoard[0].id).toBe('uuid-fail');

    const restored = queryClient.getQueryData(queryKeys.contacts.lists()) as typeof initialPages;
    expect(restored.pages[0].contacts[0].inquiry_type).toBeNull();
  });
});
