'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { ContactTimeline, ContactTimelineSkeleton } from '@/components/ContactTimeline';
import DeliveryProofImage from '@/components/DeliveryProofImage';
import { Skeleton } from '@/components/ui/skeleton';
import { useContactTimeline } from '@/lib/hooks/useContactTimeline';
import { useMinLoadingState } from '@/lib/hooks/useMinLoadingState';
import type { Contact } from '@/lib/types/contact';
import { cn } from '@/lib/utils';

interface DeliveredItemCardProps {
  contact: Contact;
  isHighlighted?: boolean;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = d.getHours();
  const ampm = hours < 12 ? '오전' : '오후';
  const displayHours = String(hours % 12 || 12).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${month}/${day} ${ampm} ${displayHours}:${minutes}`;
}

function DeliveredItemCardComponent({ contact, isHighlighted = false }: DeliveredItemCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { entries, isLoading: rawLoading } = useContactTimeline(contact.id, {
    externalExpanded: isExpanded,
  });
  const isLoading = useMinLoadingState(rawLoading, 1000);
  const hasPhoto = !!contact.delivery_proof_image;
  const [proofImageReady, setProofImageReady] = useState(!hasPhoto);

  const handleClick = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  useEffect(() => {
    if (!isExpanded) return;
    setProofImageReady(!hasPhoto);
  }, [contact.id, hasPhoto, isExpanded]);

  const handleProofReady = useCallback(() => {
    setProofImageReady(true);
  }, []);

  // 납품은 현장 번호(F-번호)만 표시
  const displayNumber = contact.work_number || `#${contact.id}`;

  const fileName =
    contact.inquiry_title ||
    contact.attachment_filename ||
    contact.drawing_file_name ||
    `작업 #${contact.work_number || contact.id}`;

  const isPanelLoading = isExpanded && (isLoading || (hasPhoto && !proofImageReady));

  return (
    <div
      id={`delivered-contact-${contact.id}`}
      data-highlighted={isHighlighted ? 'true' : undefined}
      className={cn(
        'relative scroll-mt-28 overflow-hidden rounded-xl border transition-all duration-300',
        isHighlighted
          ? 'border-brand bg-brand-light ring-2 ring-brand ring-offset-2 ring-offset-white shadow-lg'
          : 'border-gray-200 bg-white'
      )}
    >
      {isHighlighted && (
        <div className="absolute inset-y-0 left-0 w-1.5 bg-brand" aria-hidden="true" />
      )}
      {/* Header row */}
      <div
        onClick={handleClick}
        className="px-4 py-3 active:bg-gray-50 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2 mb-1">
          <ChevronDown
            className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
          />
          <span className="text-xs font-mono text-gray-400 flex-shrink-0">{displayNumber}</span>
          <span className="text-sm font-bold text-gray-900 truncate">{contact.company_name}</span>
        </div>

        <div className="ml-5.5 flex items-center justify-between">
          <p className="text-xs text-gray-600 truncate flex-1 mr-2">{fileName}</p>
          <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
            {formatDateTime(contact.updated_at)} 완료
          </span>
        </div>
      </div>

      {/* Expanded panel: timeline + photo side by side */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          <div className="relative">
            {isPanelLoading && <DeliveredExpandedSkeleton hasPhoto={hasPhoto} />}
            <div
              className={
                isPanelLoading
                  ? 'absolute inset-0 pointer-events-none opacity-0'
                  : 'opacity-100 transition-opacity duration-150'
              }
              aria-hidden={isPanelLoading}
            >
              <div className={`flex ${hasPhoto ? 'gap-3' : ''}`}>
                {/* Left: Timeline */}
                <div className={hasPhoto ? 'flex-1 min-w-0' : 'w-full'}>
                  <span className="text-xs font-medium text-gray-500 mb-2.5 block">
                    작업 타임라인
                  </span>
                  {entries.length > 0 ? (
                    <ContactTimeline entries={entries} compact showActor />
                  ) : (
                    <p className="text-xs text-gray-400 py-2">타임라인 데이터 없음</p>
                  )}
                </div>

                {/* Right: Proof photo (50%, fixed height) */}
                {hasPhoto && (
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-gray-500 mb-1.5 block">
                      납품 증빙 사진
                    </span>
                    <div className="h-40 overflow-hidden rounded-lg">
                      <DeliveryProofImage
                        contactId={String(contact.id)}
                        className="w-full h-full object-cover rounded-lg"
                        onReady={handleProofReady}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export const DeliveredItemCard = memo(DeliveredItemCardComponent);

function DeliveredExpandedSkeleton({ hasPhoto }: { hasPhoto: boolean }) {
  return (
    <div className={`flex ${hasPhoto ? 'gap-3' : ''}`} data-testid="delivered-expanded-skeleton">
      <div className={hasPhoto ? 'flex-1 min-w-0' : 'w-full'}>
        <Skeleton className="mb-2.5 h-3 w-20" />
        <ContactTimelineSkeleton compact rows={6} />
      </div>
      {hasPhoto && (
        <div className="flex-1 min-w-0">
          <Skeleton className="mb-1.5 h-3 w-20" />
          <Skeleton className="h-40 w-full rounded-lg" />
        </div>
      )}
    </div>
  );
}
