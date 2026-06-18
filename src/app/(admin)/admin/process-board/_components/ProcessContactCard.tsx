'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { Badge } from '@/components/ui/badge';
import type { Contact } from '@/lib/types/contact';

interface ProcessContactCardProps {
  contact: Contact;
  onClick: () => void;
}

/**
 * 상대 시간 표시 (방금 전, N분 전, N시간 전, N일 전)
 */
function getRelativeTime(dateString: string): string {
  const now = new Date();
  const past = new Date(dateString);
  const diffMs = now.getTime() - past.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;
  if (diffHours < 24) return `${diffHours}시간 전`;
  return `${diffDays}일 전`;
}

/**
 * 상태별 뱃지 variant
 */
function getStatusVariant(status: string): 'info' | 'gray' | 'primary' | 'success' | 'warning' {
  switch (status) {
    case 'new':
      return 'info';
    case 'read':
      return 'gray';
    case 'in_progress':
    case 'revision_in_progress':
      return 'primary';
    case 'completed':
      return 'success';
    case 'on_hold':
      return 'warning';
    default:
      return 'gray';
  }
}

/**
 * 상태별 텍스트
 */
function getStatusText(status: string): string {
  switch (status) {
    case 'new':
      return '신규';
    case 'read':
      return '확인';
    case 'in_progress':
      return '진행중';
    case 'revision_in_progress':
      return '수정중';
    case 'completed':
      return '완료';
    case 'on_hold':
      return '보류';
    default:
      return status;
  }
}

export default function ProcessContactCard({ contact, onClick }: ProcessContactCardProps) {
  const isTestContact = contact.inquiry_title?.startsWith('[테스트]');

  return (
    <div
      onClick={onClick}
      className={`${BG_COLOR.card} rounded-lg p-3 border ${BORDER_COLOR.default} hover:shadow-md cursor-pointer transition-shadow`}
    >
      {/* 문의번호 + 상태 */}
      <div className="flex items-center justify-between mb-2">
        {contact.inquiry_number && (
          <span className={`text-xs font-mono ${TEXT_COLOR.secondary}`}>
            {contact.inquiry_number}
          </span>
        )}
        <Badge variant={getStatusVariant(contact.status)}>{getStatusText(contact.status)}</Badge>
      </div>

      {/* 업체명 */}
      <h4 className={`text-sm font-semibold mb-1 ${TEXT_COLOR.primary}`}>{contact.company_name}</h4>

      {/* 패키지명 + 테스트 뱃지 */}
      <div className="flex items-center gap-2 mb-2">
        <p className={`text-xs ${TEXT_COLOR.secondary} truncate flex-1`}>
          {contact.inquiry_title || '제목 없음'}
        </p>
        {isTestContact && (
          <span
            className={`px-1.5 py-0.5 ${BG_COLOR.warning} ${TEXT_COLOR.yellowDark} text-[10px] font-medium rounded`}
          >
            테스트
          </span>
        )}
      </div>

      {/* 담당자명 */}
      <p className={`text-xs ${TEXT_COLOR.secondary} mb-2`}>{contact.name}</p>

      {/* 최근 업데이트 */}
      <div className={`flex items-center justify-between pt-2 border-t ${BORDER_COLOR.light}`}>
        <span className={`text-[10px] ${TEXT_COLOR.disabled}`}>최근 업데이트</span>
        <span className={`text-[10px] ${TEXT_COLOR.secondary}`}>
          {getRelativeTime(contact.updated_at)}
        </span>
      </div>
    </div>
  );
}
