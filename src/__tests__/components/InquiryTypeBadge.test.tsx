/**
 * InquiryTypeBadge 컴포넌트 테스트
 * - 미분류(webhard + inquiry_type null): 인라인 [칼선의뢰][목형의뢰] 2버튼
 * - 분류된 상태: 읽기 전용 배지 (버튼 없음)
 * - 웹사이트 문의: "문의접수" 배지
 * - API 실패 시 optimistic rollback
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { InquiryTypeBadge } from '@/app/(admin)/admin/contacts/_components/InquiryTypeBadge';
import { queryKeys } from '@/lib/react-query/queryKeys';
import type { Contact } from '@/lib/types';

// fetch mock
global.fetch = jest.fn();
// alert mock (rollback path에서 호출됨)
const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});

function makeContact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 'test-contact-001',
    inquiry_number: 'INQ-001',
    work_number: null,
    company_name: '테스트업체',
    name: '홍길동',
    position: '대표',
    phone: '010-1234-5678',
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
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestQueryWrapper';
  return { Wrapper, queryClient };
}

describe('InquiryTypeBadge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy.mockClear();
  });

  it('미분류 (webhard + inquiry_type null) → 칼선의뢰/목형의뢰 2버튼 렌더', () => {
    const contact = makeContact({ source: 'webhard', inquiry_type: null });
    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <InquiryTypeBadge contact={contact} />
      </Wrapper>
    );

    const cuttingBtn = screen.getByRole('button', { name: '칼선의뢰로 분류' });
    const moldBtn = screen.getByRole('button', { name: '목형의뢰로 분류' });
    expect(cuttingBtn).toBeInTheDocument();
    expect(moldBtn).toBeInTheDocument();
    expect(cuttingBtn).toHaveTextContent('칼선의뢰');
    expect(moldBtn).toHaveTextContent('목형의뢰');
  });

  it('칼선의뢰 버튼 클릭 → PATCH /api/contacts/{id}/inquiry-type body { inquiry_type: "cutting_request" }', async () => {
    const contact = makeContact({ id: 'test-contact-042', source: 'webhard', inquiry_type: null });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <InquiryTypeBadge contact={contact} />
      </Wrapper>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '칼선의뢰로 분류' }));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/contacts/test-contact-042/inquiry-type', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inquiry_type: 'cutting_request' }),
    });
  });

  it('목형의뢰 버튼 클릭 → PATCH body { inquiry_type: "mold_request" }', async () => {
    const contact = makeContact({ id: 'test-contact-077', source: 'webhard', inquiry_type: null });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <InquiryTypeBadge contact={contact} />
      </Wrapper>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '목형의뢰로 분류' }));
    });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/contacts/test-contact-077/inquiry-type', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inquiry_type: 'mold_request' }),
    });
  });

  it('inquiry_type === "cutting_request" → 읽기 전용 "칼선의뢰" 배지 (버튼 없음)', () => {
    const contact = makeContact({ source: 'webhard', inquiry_type: 'cutting_request' });
    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <InquiryTypeBadge contact={contact} />
      </Wrapper>
    );

    expect(screen.getByText('칼선의뢰')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('inquiry_type === "mold_request" → 읽기 전용 "목형의뢰" 배지 (버튼 없음)', () => {
    const contact = makeContact({ source: 'webhard', inquiry_type: 'mold_request' });
    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <InquiryTypeBadge contact={contact} />
      </Wrapper>
    );

    expect(screen.getByText('목형의뢰')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('웹사이트 문의 (source !== "webhard" + inquiry_type null) → "문의접수" 배지', () => {
    const contact = makeContact({ source: 'website', inquiry_type: null });
    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <InquiryTypeBadge contact={contact} />
      </Wrapper>
    );

    expect(screen.getByText('문의접수')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('API 400 응답 시 optimistic 상태 rollback (이전 캐시 복원)', async () => {
    const contact = makeContact({ id: 'test-contact-099', source: 'webhard', inquiry_type: null });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ error: '잘못된 요청' }),
    });
    const { Wrapper, queryClient } = createWrapper();

    // 이전 캐시 상태를 세팅 (optimistic update 대상)
    const initialPages = {
      pages: [{ contacts: [contact] }],
      pageParams: [undefined],
    };
    queryClient.setQueryData(queryKeys.contacts.lists(), initialPages);
    queryClient.setQueryData(queryKeys.processBoard.all, [contact]);

    render(
      <Wrapper>
        <InquiryTypeBadge contact={contact} />
      </Wrapper>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '칼선의뢰로 분류' }));
    });

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalledWith('잘못된 요청');
    });

    // 롤백 검증: contacts 캐시가 이전 상태(inquiry_type: null)로 복원됨
    const restored = queryClient.getQueryData(queryKeys.contacts.lists()) as typeof initialPages;
    expect(restored.pages[0].contacts[0].inquiry_type).toBeNull();
    expect(restored.pages[0].contacts[0].status).toBe('received');

    // processBoard 캐시도 복원됨 (삭제되지 않음)
    const restoredBoard = queryClient.getQueryData(queryKeys.processBoard.all) as Contact[];
    expect(restoredBoard).toHaveLength(1);
    expect(restoredBoard[0].id).toBe('test-contact-099');
  });

  describe("mode='label-only'", () => {
    it('미분류 + label-only → 주황 "미분류" 단일 뱃지만 렌더 (버튼 없음)', () => {
      const contact = makeContact({ source: 'webhard', inquiry_type: null });
      const { Wrapper } = createWrapper();
      render(
        <Wrapper>
          <InquiryTypeBadge contact={contact} mode="label-only" />
        </Wrapper>
      );

      expect(screen.getByText('미분류')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '칼선의뢰로 분류' })).toBeNull();
      expect(screen.queryByRole('button', { name: '목형의뢰로 분류' })).toBeNull();
    });

    it('미분류 + label-only → 뱃지 클릭해도 fetch 호출되지 않는다', async () => {
      const contact = makeContact({ source: 'webhard', inquiry_type: null });
      const { Wrapper } = createWrapper();
      render(
        <Wrapper>
          <InquiryTypeBadge contact={contact} mode="label-only" />
        </Wrapper>
      );

      const badge = screen.getByText('미분류');
      await act(async () => {
        fireEvent.click(badge);
      });

      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
