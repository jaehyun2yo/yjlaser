import React, { type ReactNode } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { InquiryClassifyButtons } from '@/components/contacts/InquiryClassifyButtons';
import type { Contact } from '@/lib/types';

global.fetch = jest.fn();

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
    defaultOptions: { queries: { retry: false } },
  });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestWrapper';
  return { Wrapper };
}

describe('InquiryClassifyButtons', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('칼선의뢰, 목형의뢰 두 버튼과 role="group" 을 렌더한다', () => {
    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <InquiryClassifyButtons contact={makeContact()} />
      </Wrapper>
    );

    expect(screen.getByRole('group', { name: '문의 유형 분류' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '칼선의뢰로 분류' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '목형의뢰로 분류' })).toBeInTheDocument();
  });

  it('칼선의뢰 버튼 클릭 → PATCH body { inquiry_type: "cutting_request" }', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ success: true }),
    });
    const { Wrapper } = createWrapper();
    render(
      <Wrapper>
        <InquiryClassifyButtons contact={makeContact({ id: 'uuid-abc' })} />
      </Wrapper>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '칼선의뢰로 분류' }));
    });

    expect(global.fetch).toHaveBeenCalledWith('/api/contacts/uuid-abc/inquiry-type', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inquiry_type: 'cutting_request' }),
    });
  });

  it("size='sm' 과 size='md' 는 서로 다른 className 을 적용한다", () => {
    const { Wrapper } = createWrapper();
    const { rerender } = render(
      <Wrapper>
        <InquiryClassifyButtons contact={makeContact()} size="sm" />
      </Wrapper>
    );
    const smButton = screen.getByRole('button', { name: '칼선의뢰로 분류' });
    const smClass = smButton.className;

    rerender(
      <Wrapper>
        <InquiryClassifyButtons contact={makeContact()} size="md" />
      </Wrapper>
    );
    const mdButton = screen.getByRole('button', { name: '칼선의뢰로 분류' });
    const mdClass = mdButton.className;

    expect(smClass).not.toBe(mdClass);
    expect(smClass).toContain('py-2');
    expect(mdClass).toContain('py-3');
  });
});
