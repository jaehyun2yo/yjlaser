/**
 * 빈 상태 컴포넌트
 */
'use client';

import { memo } from 'react';
import { FaInbox, FaSearch } from 'react-icons/fa';
import { TEXT_COLOR, BG_COLOR, BORDER_COLOR } from '@/lib/styles';

interface EmptyStateProps {
  statusFilter: string;
  searchQuery?: string;
}

function EmptyStateComponent({ statusFilter, searchQuery }: EmptyStateProps) {
  const hasSearch = searchQuery && searchQuery.trim().length > 0;

  const getMessage = () => {
    if (hasSearch) {
      return {
        icon: FaSearch,
        title: '검색 결과가 없습니다',
        description: `"${searchQuery}"에 해당하는 문의를 찾을 수 없습니다.`,
      };
    }

    switch (statusFilter) {
      case 'received':
        return {
          icon: FaInbox,
          title: '접수된 문의가 없습니다',
          description: '새로운 문의가 접수되면 여기에 표시됩니다.',
        };
      case 'drawing':
        return {
          icon: FaInbox,
          title: '도면작업 중인 문의가 없습니다',
          description: '도면작업 진행 중인 문의가 여기에 표시됩니다.',
        };
      case 'confirmed':
        return {
          icon: FaInbox,
          title: '컨펌된 문의가 없습니다',
          description: '컨펌 완료된 문의가 여기에 표시됩니다.',
        };
      case 'production':
        return {
          icon: FaInbox,
          title: '목형제작 중인 문의가 없습니다',
          description: '목형제작 진행 중인 문의가 여기에 표시됩니다.',
        };
      case 'cutting':
        return {
          icon: FaInbox,
          title: '레이저가공 중인 문의가 없습니다',
          description: '레이저가공 진행 중인 문의가 여기에 표시됩니다.',
        };
      case 'finishing':
        return {
          icon: FaInbox,
          title: '칼/오시 작업 중인 문의가 없습니다',
          description: '칼/오시 작업 진행 중인 문의가 여기에 표시됩니다.',
        };
      case 'delivered':
        return {
          icon: FaInbox,
          title: '납품 완료된 문의가 없습니다',
          description: '납품 완료된 문의가 여기에 표시됩니다.',
        };
      case 'on_hold':
        return {
          icon: FaInbox,
          title: '보류 중인 문의가 없습니다',
          description: '보류 처리된 문의가 여기에 표시됩니다.',
        };
      case 'deleting':
        return {
          icon: FaInbox,
          title: '삭제 대기 중인 문의가 없습니다',
          description: '휴지통이 비어 있습니다.',
        };
      default:
        return {
          icon: FaInbox,
          title: '문의가 없습니다',
          description: '아직 접수된 문의가 없습니다.',
        };
    }
  };

  const { icon: Icon, title, description } = getMessage();

  return (
    <div
      className={`
        flex flex-col items-center justify-center py-16 px-4
        rounded-lg border ${BORDER_COLOR.default} ${BG_COLOR.card}
      `}
    >
      <Icon className={`text-4xl ${TEXT_COLOR.muted} mb-4`} />
      <h3 className={`text-lg font-semibold ${TEXT_COLOR.primary} mb-2`}>{title}</h3>
      <p className={`text-sm ${TEXT_COLOR.secondary} text-center max-w-md`}>{description}</p>
    </div>
  );
}

export const EmptyState = memo(EmptyStateComponent);
