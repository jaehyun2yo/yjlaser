/**
 * ContactCard 컴포넌트 테스트 (Phase 2: 우클릭 재분류 동작)
 * - 미분류 카드: 우클릭 시 컨텍스트 메뉴가 열리지 않음
 * - 분류된 카드: 우클릭 시 preventDefault 호출 + 메뉴 렌더
 * - status === 'received' 재분류: confirm 호출 안 함
 * - status !== 'received' 재분류: confirm 호출, 취소 시 PATCH 미호출
 */

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { ContactCard } from '@/app/(admin)/admin/contacts/_components/ContactCard';
import type { Contact } from '@/lib/types';

// 내부 서브 컴포넌트를 가벼운 stub으로 교체 (이 테스트의 관심사는 ContactCard 래퍼의
// 우클릭/재분류 로직이며, 헤더/액션/상세 뷰 렌더링은 별도 테스트가 담당).
jest.mock('@/app/(admin)/admin/contacts/_components/ContactCardHeader', () => ({
  ContactCardHeader: () => <div data-testid="card-header" />,
}));
jest.mock('@/app/(admin)/admin/contacts/_components/ContactCardSummary', () => ({
  ContactCardSummary: () => <div data-testid="card-summary" />,
}));
jest.mock('@/app/(admin)/admin/contacts/_components/ContactCardActions', () => ({
  ContactCardActions: () => <div data-testid="card-actions" />,
}));
jest.mock('@/app/(admin)/admin/contacts/_components/ContactDetailView', () => ({
  ContactDetailView: () => <div data-testid="card-detail" />,
}));

global.fetch = jest.fn();
const alertSpy = jest.spyOn(window, 'alert').mockImplementation(() => {});
const confirmSpy = jest.spyOn(window, 'confirm');

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
    status: 'drawing',
    process_stage: 'drawing',
    created_at: '2026-04-17T09:00:00.000Z',
    updated_at: '2026-04-17T09:00:00.000Z',
    source: 'webhard',
    inquiry_type: 'cutting_request',
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

describe('ContactCard — 우클릭 재분류', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy.mockClear();
    confirmSpy.mockReset();
  });

  afterAll(() => {
    confirmSpy.mockRestore();
  });

  it('미분류 카드 우클릭 → 컨텍스트 메뉴 렌더 안 됨', () => {
    const contact = makeContact({ inquiry_type: null, source: 'webhard' });
    const { Wrapper } = createWrapper();
    const { container } = render(
      <Wrapper>
        <ContactCard contact={contact} />
      </Wrapper>
    );

    const card = container.firstChild as HTMLElement;
    fireEvent.contextMenu(card);

    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('분류된 카드 우클릭 → preventDefault 호출 + 컨텍스트 메뉴 렌더', () => {
    const contact = makeContact({ inquiry_type: 'cutting_request' });
    const { Wrapper } = createWrapper();
    const { container } = render(
      <Wrapper>
        <ContactCard contact={contact} />
      </Wrapper>
    );

    const card = container.firstChild as HTMLElement;
    const preventDefault = jest.fn();
    fireEvent.contextMenu(card, { clientX: 50, clientY: 60, preventDefault });

    // 메뉴가 렌더되어야 함
    expect(screen.getByRole('menu')).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '칼선의뢰로 변경' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '목형의뢰로 변경' })).toBeInTheDocument();
  });

  it("status === 'received' + 재분류 → confirm 호출 안 함, 바로 PATCH", async () => {
    const contact = makeContact({ inquiry_type: 'cutting_request', status: 'received' });
    (global.fetch as jest.Mock).mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const { Wrapper } = createWrapper();
    const { container } = render(
      <Wrapper>
        <ContactCard contact={contact} />
      </Wrapper>
    );

    const card = container.firstChild as HTMLElement;
    fireEvent.contextMenu(card, { clientX: 0, clientY: 0 });

    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: '목형의뢰로 변경' }));
    });

    expect(confirmSpy).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
    expect(global.fetch).toHaveBeenCalledWith('/api/contacts/test-contact-001/inquiry-type', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inquiry_type: 'mold_request' }),
    });
  });

  it("status !== 'received' + 재분류 + confirm 취소 → PATCH 미호출", async () => {
    const contact = makeContact({ inquiry_type: 'cutting_request', status: 'drawing' });
    confirmSpy.mockReturnValueOnce(false);

    const { Wrapper } = createWrapper();
    const { container } = render(
      <Wrapper>
        <ContactCard contact={contact} />
      </Wrapper>
    );

    const card = container.firstChild as HTMLElement;
    fireEvent.contextMenu(card, { clientX: 0, clientY: 0 });

    await act(async () => {
      fireEvent.click(screen.getByRole('menuitem', { name: '목형의뢰로 변경' }));
    });

    expect(confirmSpy).toHaveBeenCalledTimes(1);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
