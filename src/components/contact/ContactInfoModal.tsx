'use client';

import { BaseModal } from '@/components/modals/BaseModal';
import { ContactDetailView } from '@/app/(admin)/admin/contacts/_components/ContactDetailView';
import type { Contact } from '@/lib/types/contact';

export interface ContactInfoModalProps {
  contact: Contact;
  open: boolean;
  onClose: () => void;
}

/**
 * 문의 정보 보기 모달 (Admin / Worker 공통).
 * admin 의 `ContactDetailView` 를 read-only 모드로 래핑하여 편집 액션 없이 상세 정보만 표시.
 *
 * 참조: docs/specs/features/worker-contact-classification.md — 우클릭 컨텍스트 메뉴 "정보 보기"
 */
export function ContactInfoModal({ contact, open, onClose }: ContactInfoModalProps) {
  return (
    <BaseModal
      isOpen={open}
      onClose={onClose}
      title="문의 정보"
      subtitle={contact.inquiry_number || undefined}
      maxWidth="4xl"
      showCancelButton={false}
    >
      <ContactDetailView contact={contact} isExpanded readOnly />
    </BaseModal>
  );
}
