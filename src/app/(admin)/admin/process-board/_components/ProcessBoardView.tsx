'use client';

import { BG_COLOR, BORDER_COLOR, TEXT_COLOR } from '@/lib/styles';
import { useState } from 'react';
import { useProcessBoard } from '@/app/(admin)/admin/process-board/_lib/hooks';
import ProcessColumn from './ProcessColumn';
import BoardFilters from './BoardFilters';
import TestContactButton from './TestContactButton';
import ProcessMoveModal from './ProcessMoveModal';
import ProxyContactModal from './ProxyContactModal';
import type { ProcessBoardFilters } from '@/app/(admin)/admin/process-board/_lib/types';
import type { Contact } from '@/lib/types/contact';

interface ProcessBoardViewProps {
  embedded?: boolean;
}

export default function ProcessBoardView({ embedded = false }: ProcessBoardViewProps) {
  const [filters, setFilters] = useState<ProcessBoardFilters>({
    dateFilter: 'all',
  });
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [isProxyModalOpen, setIsProxyModalOpen] = useState(false);

  const { data: columns = [], isLoading, error, refetch } = useProcessBoard(filters);

  const wrapperClass = embedded ? '' : `min-h-screen ${BG_COLOR.page} p-6`;

  if (isLoading) {
    return (
      <div className={wrapperClass}>
        <div className="max-w-[1800px] mx-auto">
          <div className={`h-8 w-48 ${BG_COLOR.muted} rounded mb-6 animate-pulse`} />
          <div className="flex gap-3 overflow-x-auto">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
              <div
                key={i}
                className={`min-w-[280px] w-[280px] h-[600px] ${BG_COLOR.muted} rounded-lg animate-pulse`}
              />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={wrapperClass}>
        <div className="max-w-[1800px] mx-auto">
          <div
            className={`${BG_COLOR.error} border ${BORDER_COLOR.error} rounded-lg p-6 text-center`}
          >
            <p className={`${TEXT_COLOR.error} mb-4`}>데이터를 불러오는 중 오류가 발생했습니다.</p>
            <button
              onClick={() => refetch()}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              재시도
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={wrapperClass}>
      <div className="max-w-[1800px] mx-auto">
        {/* 헤더 */}
        <div className="mb-6">
          {!embedded && (
            <div className="flex items-center gap-3 mb-4">
              <h1 className={`text-2xl font-bold ${TEXT_COLOR.primary}`}>작업현황 보드</h1>
              {/* Live 인디케이터 */}
              <div className="flex items-center gap-2">
                <div className="relative">
                  <div className="w-2 h-2 bg-green-500 rounded-full animate-ping absolute" />
                  <div className="w-2 h-2 bg-green-500 rounded-full relative" />
                </div>
                <span className={`text-sm ${TEXT_COLOR.success} font-medium`}>실시간</span>
              </div>
            </div>
          )}

          {/* 액션 버튼 */}
          <div className="flex items-center gap-3 mb-4">
            <TestContactButton />
            <button
              onClick={() => setIsProxyModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 4v16m8-8H4"
                />
              </svg>
              문의 대리 등록
            </button>
          </div>

          {/* 필터 */}
          <BoardFilters filters={filters} onFiltersChange={setFilters} />
        </div>

        {/* 보드 */}
        <div className="flex overflow-x-auto gap-3 pb-4">
          {columns.map((column) => (
            <ProcessColumn
              key={column.stage || 'pre-process'}
              {...column}
              onCardClick={setSelectedContact}
            />
          ))}
        </div>
      </div>

      {/* 모달 */}
      <ProcessMoveModal
        contact={selectedContact}
        isOpen={!!selectedContact}
        onClose={() => setSelectedContact(null)}
      />
      <ProxyContactModal isOpen={isProxyModalOpen} onClose={() => setIsProxyModalOpen(false)} />
    </div>
  );
}
