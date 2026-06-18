'use client';

import { memo, useCallback, useState } from 'react';
import { ChevronDown, Circle } from 'lucide-react';
import DeliveryProofImage from '@/components/DeliveryProofImage';
import type { Contact } from '@/lib/types/contact';

interface WorkerDeliveredItemProps {
  contact: Contact;
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

interface TimelineEvent {
  label: string;
  date: string;
  color: string;
}

function buildTimeline(contact: Contact): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  events.push({
    label: `문의 접수 (${contact.source === 'webhard' ? '웹하드' : contact.source === 'phone' ? '전화' : '웹사이트'})`,
    date: contact.created_at,
    color: 'text-blue-500',
  });

  if (contact.confirmed_at) {
    events.push({ label: '도면 확정', date: contact.confirmed_at, color: 'text-indigo-500' });
  }

  if (contact.production_started_at) {
    events.push({
      label: '생산 시작',
      date: contact.production_started_at,
      color: 'text-yellow-600',
    });
  }

  if (contact.cutting_started_at) {
    events.push({
      label: '칼 작업 시작',
      date: contact.cutting_started_at,
      color: 'text-orange-500',
    });
  }

  if (contact.cutting_completed_at) {
    events.push({
      label: '칼 작업 완료',
      date: contact.cutting_completed_at,
      color: 'text-orange-600',
    });
  }

  if (contact.finishing_started_at) {
    events.push({
      label: '오시 작업 시작',
      date: contact.finishing_started_at,
      color: 'text-purple-500',
    });
  }

  if (contact.finishing_completed_at) {
    events.push({
      label: '오시 작업 완료',
      date: contact.finishing_completed_at,
      color: 'text-purple-600',
    });
  }

  if (contact.revision_requested_at) {
    events.push({ label: '수정 요청', date: contact.revision_requested_at, color: 'text-red-500' });
  }

  events.push({
    label: '납품 완료',
    date: contact.updated_at,
    color: 'text-green-600',
  });

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return events;
}

function WorkerDeliveredItemComponent({ contact }: WorkerDeliveredItemProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleClick = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const fileName =
    contact.inquiry_title ||
    contact.attachment_filename ||
    contact.drawing_file_name ||
    `문의 #${contact.inquiry_number || contact.work_number || ''}`;

  const timeline = isExpanded ? buildTimeline(contact) : [];

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Main row */}
      <div
        onClick={handleClick}
        className="px-4 py-3 active:bg-gray-50 transition-colors cursor-pointer select-none"
      >
        <div className="flex items-center gap-2 mb-1">
          <ChevronDown
            className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
          />
          <span className="text-xs font-mono text-gray-400 flex-shrink-0">
            {contact.inquiry_number || '번호없음'}
          </span>
          <span className="text-sm font-bold text-gray-900 truncate">{contact.company_name}</span>
        </div>

        <div className="ml-5.5 flex items-center justify-between">
          <p className="text-xs text-gray-600 truncate flex-1 mr-2">{fileName}</p>
          <span className="text-[11px] text-gray-400 whitespace-nowrap flex-shrink-0">
            {formatDateTime(contact.updated_at)} 완료
          </span>
        </div>
      </div>

      {/* Timeline panel */}
      {isExpanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50">
          <span className="text-xs font-medium text-gray-500 mb-2.5 block">작업 타임라인</span>

          <div className="relative pl-4">
            {/* Vertical line */}
            <div className="absolute left-[7px] top-1 bottom-1 w-px bg-gray-200" />

            <div className="space-y-2.5">
              {timeline.map((event, idx) => (
                <div key={idx} className="flex items-center gap-3 relative">
                  <Circle
                    className={`w-3 h-3 flex-shrink-0 -ml-[5.5px] fill-current ${event.color} ${idx === timeline.length - 1 ? 'stroke-2' : ''}`}
                  />
                  <span className="text-xs text-gray-700 flex-1">{event.label}</span>
                  <span className="text-[11px] text-gray-400 whitespace-nowrap">
                    {formatDateTime(event.date)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {contact.delivery_proof_image && (
            <div className="mt-3 pt-3 border-t border-gray-200">
              <span className="text-xs font-medium text-gray-500 mb-1.5 block">납품 증빙 사진</span>
              <DeliveryProofImage contactId={String(contact.id)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const WorkerDeliveredItem = memo(WorkerDeliveredItemComponent);
