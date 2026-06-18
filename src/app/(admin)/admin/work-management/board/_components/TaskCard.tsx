'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import Link from 'next/link';
import { getProcessStageInfo } from '@/lib/utils/processStages';
import type { Contact } from '@/lib/types/contact';

interface TaskCardProps {
  contact: Contact;
}

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHour = Math.floor(diffMs / 3600000);
  const diffDay = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return '방금 전';
  if (diffMin < 60) return `${diffMin}분 전`;
  if (diffHour < 24) return `${diffHour}시간 전`;
  if (diffDay < 7) return `${diffDay}일 전`;
  return date.toLocaleDateString('ko-KR');
}

export function TaskCard({ contact }: TaskCardProps) {
  const stageInfo = getProcessStageInfo(contact.process_stage);
  const stageBgColor = stageInfo?.bgColor || BG_COLOR.muted;
  const stageTextColor = stageInfo?.color || TEXT_COLOR.secondary;
  const stageLabel = stageInfo?.label || '공정 시작 전';

  return (
    <Link
      href={`/admin/work-management/${contact.id}`}
      className={`block ${BG_COLOR.card} border ${BORDER_COLOR.default} rounded-lg p-4 hover:shadow-md transition-shadow`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            {(contact.work_number || contact.inquiry_number) && (
              <span className={`text-xs ${TEXT_COLOR.secondary} font-mono`}>
                {contact.work_number || contact.inquiry_number}
              </span>
            )}
            <span
              className={`px-2 py-0.5 text-xs rounded-full font-medium ${stageBgColor} ${stageTextColor}`}
            >
              {stageLabel}
            </span>
          </div>
          <h3 className={`text-sm font-medium ${TEXT_COLOR.primary} truncate`}>
            {contact.company_name}
          </h3>
          {contact.inquiry_title && (
            <p className={`text-xs ${TEXT_COLOR.secondary} mt-0.5 truncate`}>
              {contact.inquiry_title}
            </p>
          )}
        </div>
        <span className={`text-xs ${TEXT_COLOR.disabled} whitespace-nowrap`}>
          {formatRelativeTime(contact.updated_at)}
        </span>
      </div>
    </Link>
  );
}
