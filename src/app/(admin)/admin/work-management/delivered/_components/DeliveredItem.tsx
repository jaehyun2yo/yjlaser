'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { memo, useCallback, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Paperclip, Download, ChevronDown, ExternalLink, Circle } from 'lucide-react';
import DeliveryProofImage from '@/components/DeliveryProofImage';
import type { Contact } from '@/lib/types/contact';

interface DeliveredItemProps {
  contact: Contact;
}

function formatDateTime(dateStr: string): string {
  const d = new Date(dateStr);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = d.getHours();
  const ampm = hours < 12 ? '오전' : '오후';
  const displayHours = String(hours % 12 || 12).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}년 ${month}월 ${day}일 ${ampm} ${displayHours}:${minutes} 납품완료`;
}

function formatTimelineDate(dateStr: string): string {
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
    events.push({
      label: '도면 확정',
      date: contact.confirmed_at,
      color: 'text-indigo-500',
    });
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
    events.push({
      label: '수정 요청',
      date: contact.revision_requested_at,
      color: 'text-red-500',
    });
  }

  events.push({
    label: '납품 완료',
    date: contact.updated_at,
    color: 'text-green-600',
  });

  events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  return events;
}

function DeliveredItemComponent({ contact }: DeliveredItemProps) {
  const router = useRouter();
  const [isExpanded, setIsExpanded] = useState(true);

  const handleClick = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleDetailClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      router.push(`/admin/work-management/${contact.id}`);
    },
    [router, contact.id]
  );

  const fileName =
    contact.inquiry_title ||
    contact.attachment_filename ||
    contact.drawing_file_name ||
    `작업 #${contact.work_number || contact.inquiry_number || ''}`;

  const hasAttachment = !!(contact.attachment_url || contact.drawing_file_url);

  const timeline = isExpanded ? buildTimeline(contact) : [];

  return (
    <div
      className={`${BG_COLOR.white} border ${BORDER_COLOR.default} rounded-lg overflow-hidden transition-colors`}
    >
      {/* Main row */}
      <div
        onClick={handleClick}
        className={`flex items-center gap-3 px-4 py-3 ${BG_COLOR.hoverMuted} transition-colors cursor-pointer select-none`}
      >
        {/* Expand indicator */}
        <ChevronDown
          className={`w-3.5 h-3.5 text-gray-400 transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}
        />

        {/* Inquiry number */}
        <span
          className={`text-xs font-mono flex-shrink-0 ${contact.work_number || contact.inquiry_number ? TEXT_COLOR.disabled : TEXT_COLOR.redMuted}`}
        >
          {contact.work_number || contact.inquiry_number || '번호없음'}
        </span>

        {/* Company name */}
        <span
          className={`text-sm font-medium ${TEXT_COLOR.primary} min-w-[80px] max-w-[140px] truncate flex-shrink-0`}
        >
          {contact.company_name}
        </span>

        {/* Divider */}
        <span className={`${TEXT_COLOR.dimInvert} flex-shrink-0`}>|</span>

        {/* File name / title */}
        <span className={`text-sm ${TEXT_COLOR.secondary} truncate flex-1 min-w-0`}>
          {fileName}
        </span>

        {/* Attachment icon + download */}
        {hasAttachment && (
          <a
            href={contact.drawing_file_url || contact.attachment_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            title="첨부파일 다운로드"
            onClick={(e) => e.stopPropagation()}
            className="flex items-center gap-1 text-gray-400 hover:text-[#ED6C00] transition-colors flex-shrink-0"
          >
            <Paperclip className="w-3.5 h-3.5" />
            <Download className="w-3 h-3" />
          </a>
        )}

        {/* Delivered time */}
        <span className={`text-xs ${TEXT_COLOR.disabled} whitespace-nowrap flex-shrink-0`}>
          {formatDateTime(contact.updated_at)}
        </span>
      </div>

      {/* Timeline panel */}
      {isExpanded && (
        <div className={`border-t ${BORDER_COLOR.light} px-4 py-3 ${BG_COLOR.muted}`}>
          <div className="flex items-center justify-between mb-3">
            <span className={`text-xs font-medium ${TEXT_COLOR.secondary}`}>작업 타임라인</span>
            <button
              onClick={handleDetailClick}
              className="flex items-center gap-1 text-xs text-[#ED6C00] hover:underline"
            >
              상세보기
              <ExternalLink className="w-3 h-3" />
            </button>
          </div>

          <div className="relative pl-4">
            {/* Vertical line */}
            <div className={`absolute left-[7px] top-1 bottom-1 w-px ${BG_COLOR.muted}`} />

            <div className="space-y-2.5">
              {timeline.map((event, idx) => (
                <div key={idx} className="flex items-center gap-3 relative">
                  {/* Dot */}
                  <Circle
                    className={`w-3 h-3 flex-shrink-0 -ml-[5.5px] fill-current ${event.color} ${idx === timeline.length - 1 ? 'stroke-2' : ''}`}
                  />
                  {/* Label */}
                  <span className={`text-xs ${TEXT_COLOR.secondary} flex-1`}>{event.label}</span>
                  {/* Date */}
                  <span className={`text-[11px] ${TEXT_COLOR.disabled} whitespace-nowrap`}>
                    {formatTimelineDate(event.date)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {contact.delivery_proof_image && (
            <div className={`mt-3 pt-3 border-t ${BORDER_COLOR.light}`}>
              <span className={`text-xs font-medium ${TEXT_COLOR.secondary} mb-1.5 block`}>
                납품 증빙 사진
              </span>
              <DeliveryProofImage contactId={String(contact.id)} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const DeliveredItem = memo(DeliveredItemComponent);
