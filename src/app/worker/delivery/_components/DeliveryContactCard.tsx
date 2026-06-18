'use client';

import type { Contact } from '@/lib/types/contact';

interface DeliveryContactCardProps {
  contact: Contact;
  isSelected: boolean;
  isHighlighted?: boolean;
  onToggleSelect: (contactId: string) => void;
}

export default function DeliveryContactCard({
  contact,
  isSelected,
  isHighlighted = false,
  onToggleSelect,
}: DeliveryContactCardProps) {
  const borderStateClass = isHighlighted
    ? 'border-brand bg-brand-light ring-2 ring-brand shadow-md'
    : contact.is_urgent
      ? 'border-red-300 ring-1 ring-red-200'
      : 'border-gray-200';

  return (
    <div
      id={`delivery-contact-${contact.id}`}
      data-delivery-highlighted={isHighlighted ? 'true' : undefined}
      role="button"
      tabIndex={0}
      onClick={() => onToggleSelect(contact.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggleSelect(contact.id);
        }
      }}
      className={`rounded-lg border shadow-sm transition-colors cursor-pointer active:bg-gray-50 ${borderStateClass} ${
        isSelected
          ? 'ring-2 ring-brand border-brand bg-brand-light'
          : isHighlighted
            ? ''
            : 'bg-white'
      }`}
    >
      <div className="px-3 py-2.5">
        <div className="flex items-center gap-3">
          {/* Left: Checkbox */}
          <div className="shrink-0">
            <div className="w-11 h-11 flex items-center justify-center rounded-lg">
              <div
                className={`w-6 h-6 rounded border-2 flex items-center justify-center transition-colors ${
                  isSelected ? 'bg-brand border-brand' : 'border-gray-300 bg-white'
                }`}
              >
                {isSelected && (
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={3}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </div>
            </div>
          </div>

          {/* Center: Contact info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              {contact.is_urgent && (
                <span className="shrink-0 px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-100 text-red-700">
                  긴급
                </span>
              )}
              {contact.work_number && (
                <span className="text-xs text-gray-400 font-mono shrink-0">
                  {contact.work_number}
                </span>
              )}
            </div>
            <p className="text-sm font-bold text-gray-900 truncate">{contact.company_name}</p>
            {contact.inquiry_title && (
              <p className="text-xs text-gray-500 truncate">{contact.inquiry_title}</p>
            )}
            {(contact.length || contact.width || contact.height) && (
              <p className="text-[11px] text-gray-400 truncate">
                규격: {[contact.length, contact.width, contact.height].filter(Boolean).join(' x ')}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
