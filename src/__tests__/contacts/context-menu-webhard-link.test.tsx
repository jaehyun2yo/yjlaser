/**
 * @jest-environment jsdom
 *
 * ContactContextMenu "웹하드에서 열기" 항목 (task 22 Phase 4 — context-menu-webhard-link).
 *
 * - `contact.webhard_folder_id` 가 있으면 router.push(/webhard?folderId=&fileId=) 호출
 * - `contact.webhard_folder_id` 가 null 이면 항목 disabled, 클릭해도 push 호출 안 됨
 *
 * Worker 메뉴는 같은 buildWebhardUrl 유틸을 공유하므로 별도 테스트 생략 (phase4.md §테스트).
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { useRouter } from 'next/navigation';
import { ContactContextMenu } from '@/app/(admin)/admin/contacts/_components/ContactContextMenu';
import type { Contact } from '@/lib/types';

jest.mock('next/navigation', () => ({
  useRouter: jest.fn(),
}));

const mockedUseRouter = useRouter as jest.MockedFunction<typeof useRouter>;

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

describe('ContactContextMenu — 웹하드에서 열기', () => {
  let push: jest.Mock;

  beforeEach(() => {
    push = jest.fn();
    mockedUseRouter.mockReturnValue({
      push,
      replace: jest.fn(),
      prefetch: jest.fn(),
      back: jest.fn(),
      forward: jest.fn(),
      refresh: jest.fn(),
    } as unknown as ReturnType<typeof useRouter>);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('webhard_folder_id + webhard_file_id 존재 → 클릭 시 router.push 로 /webhard?folderId=&fileId= 로 이동', () => {
    const contact = makeContact({ webhard_folder_id: 'abc', webhard_file_id: 'xyz' });
    const onClose = jest.fn();

    render(
      <ContactContextMenu
        contact={contact}
        x={10}
        y={10}
        onSelectInquiryType={jest.fn()}
        onClose={onClose}
      />
    );

    const item = screen.getByRole('menuitem', { name: '웹하드에서 열기' });
    expect(item).not.toBeDisabled();

    fireEvent.click(item);

    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith('/webhard?folderId=abc&fileId=xyz');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('webhard_folder_id 가 null → 항목 disabled, 클릭해도 router.push 호출 안 됨', () => {
    const contact = makeContact({ webhard_folder_id: null, webhard_file_id: null });

    render(
      <ContactContextMenu
        contact={contact}
        x={10}
        y={10}
        onSelectInquiryType={jest.fn()}
        onClose={jest.fn()}
      />
    );

    const item = screen.getByRole('menuitem', { name: '웹하드에서 열기' });
    expect(item).toBeDisabled();

    fireEvent.click(item);

    expect(push).not.toHaveBeenCalled();
  });
});
