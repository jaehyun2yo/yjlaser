/**
 * ContactContextMenu 컴포넌트 테스트
 * - 2개 재분류 항목 렌더링
 * - 현재 타입과 동일한 항목 disabled
 * - 클릭 시 onSelectInquiryType + onClose 호출
 * - ESC / 외부 클릭 시 onClose 호출
 */

import { render, screen, fireEvent } from '@testing-library/react';
import { ContactContextMenu } from '@/app/(admin)/admin/contacts/_components/ContactContextMenu';
import type { Contact, InquiryType } from '@/lib/types';

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

describe('ContactContextMenu', () => {
  it('2개 재분류 항목 ("칼선의뢰로 변경", "목형의뢰로 변경") 렌더링', () => {
    const contact = makeContact();
    render(
      <ContactContextMenu
        contact={contact}
        x={10}
        y={10}
        onSelectInquiryType={jest.fn()}
        onClose={jest.fn()}
      />
    );
    expect(screen.getByRole('menuitem', { name: '칼선의뢰로 변경' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: '목형의뢰로 변경' })).toBeInTheDocument();
  });

  it('inquiry_type === "cutting_request" → "칼선의뢰로 변경" disabled', () => {
    const contact = makeContact({ inquiry_type: 'cutting_request' });
    render(
      <ContactContextMenu
        contact={contact}
        x={10}
        y={10}
        onSelectInquiryType={jest.fn()}
        onClose={jest.fn()}
      />
    );
    const cuttingItem = screen.getByRole('menuitem', { name: '칼선의뢰로 변경' });
    const moldItem = screen.getByRole('menuitem', { name: '목형의뢰로 변경' });
    expect(cuttingItem).toBeDisabled();
    expect(moldItem).not.toBeDisabled();
  });

  it('inquiry_type === "mold_request" → "목형의뢰로 변경" disabled', () => {
    const contact = makeContact({ inquiry_type: 'mold_request' });
    render(
      <ContactContextMenu
        contact={contact}
        x={10}
        y={10}
        onSelectInquiryType={jest.fn()}
        onClose={jest.fn()}
      />
    );
    const cuttingItem = screen.getByRole('menuitem', { name: '칼선의뢰로 변경' });
    const moldItem = screen.getByRole('menuitem', { name: '목형의뢰로 변경' });
    expect(cuttingItem).not.toBeDisabled();
    expect(moldItem).toBeDisabled();
  });

  it('"목형의뢰로 변경" 클릭 → onSelectInquiryType("mold_request") + onClose 호출', () => {
    const contact = makeContact({ inquiry_type: 'cutting_request' });
    const onSelect = jest.fn<void, [InquiryType]>();
    const onClose = jest.fn();
    render(
      <ContactContextMenu
        contact={contact}
        x={10}
        y={10}
        onSelectInquiryType={onSelect}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByRole('menuitem', { name: '목형의뢰로 변경' }));

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith('mold_request');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('ESC 키 → onClose 호출', () => {
    const contact = makeContact();
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

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('메뉴 외부 mousedown → onClose 호출', () => {
    const contact = makeContact();
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

    // 문서 body에서 mousedown 발생 (메뉴 외부)
    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
