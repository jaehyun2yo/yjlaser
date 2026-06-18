'use client';

import { useState } from 'react';
import { FaFileAlt } from 'react-icons/fa';
import { ContactCardToggle } from '@/components/ContactCardToggle';
import type {
  Contact,
  StatusInfo as _StatusInfo,
  FilterType,
  Booking,
} from '@/app/company/dashboard/types';
import { getStatusInfo } from '@/app/company/dashboard/utils';

type Variant = 'mobile' | 'tablet' | 'desktop';

interface ContactListProps {
  contacts: Contact[];
  filterType: FilterType;
  variant?: Variant;
  bookings?: Booking[];
  onBookingChange?: () => void;
  company?: {
    manager_name?: string;
    manager_phone?: string;
    business_address?: string;
  } | null;
}

export function ContactList({
  contacts,
  filterType,
  variant = 'desktop',
  bookings = [],
  onBookingChange,
  company,
}: ContactListProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const emptyStateClasses = {
    mobile: 'text-center py-8',
    tablet: 'text-center py-10',
    desktop: 'text-center py-12',
  };

  const listClasses = {
    mobile: 'space-y-3',
    tablet: 'space-y-4',
    desktop: 'space-y-4',
  };

  if (contacts.length === 0) {
    return (
      <div className={emptyStateClasses[variant]}>
        <FaFileAlt className="mx-auto text-3xl sm:text-4xl text-gray-600 mb-3" />
        <p className="text-sm sm:text-base text-gray-500">
          {filterType === 'all'
            ? '진행중인 문의가 없습니다'
            : '선택한 기간에 해당하는 문의가 없습니다'}
        </p>
      </div>
    );
  }

  return (
    <div className={listClasses[variant]}>
      {contacts.map((contact) => {
        const statusInfo = getStatusInfo(contact.status, contact.inquiry_type);
        // contact_id로 매칭되는 booking 찾기
        const relatedBooking =
          bookings.find((booking) => booking.contact_id === contact.id) || null;
        return (
          <div key={contact.id}>
            <ContactCardToggle
              contact={contact}
              statusInfo={statusInfo}
              booking={relatedBooking}
              onBookingChange={onBookingChange}
              variant={variant}
              company={company}
              expanded={expandedId === contact.id}
              onToggle={() => setExpandedId(expandedId === contact.id ? null : contact.id)}
            />
          </div>
        );
      })}
    </div>
  );
}
